create table public.plan_publications (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content_kind text not null check (content_kind in ('routine','mesocycle')),
  source_version_id text not null check (btrim(source_version_id) <> ''),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  visibility text not null check (visibility in ('private','circle','community')),
  copy_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  moderation_hidden_at timestamptz
);
create index plan_publications_feed_page on public.plan_publications(created_at desc,id desc) where deleted_at is null and moderation_hidden_at is null;

create table public.plan_publication_copies (
  publication_id uuid not null references public.plan_publications(id),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  imported_ids jsonb not null check (jsonb_typeof(imported_ids) = 'object'),
  created_at timestamptz not null default now(),
  primary key(publication_id,actor_id)
);
create table public.plan_publication_reactions (
  publication_id uuid not null references public.plan_publications(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(publication_id,actor_id)
);
create table public.plan_publication_comments (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.plan_publications(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  moderation_hidden_at timestamptz
);
create table public.plan_publication_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_kind text not null check (target_kind in ('publication','comment')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(reporter_id,target_kind,target_id)
);

create function private.prevent_plan_publication_snapshot_edit() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.author_id=old.author_id and new.content_kind=old.content_kind and new.source_version_id=old.source_version_id and new.snapshot=old.snapshot and new.created_at=old.created_at then return new; end if;
  raise exception 'plan publication snapshots are immutable';
end;
$$;
create trigger plan_publications_immutable before update on public.plan_publications for each row execute function private.prevent_plan_publication_snapshot_edit();

create function private.plan_publication_visible(viewer uuid, publication public.plan_publications)
returns boolean language sql stable security definer set search_path = '' as $$
  select publication.deleted_at is null and publication.moderation_hidden_at is null and (
    viewer = publication.author_id or (
      not private.is_blocked_pair(viewer,publication.author_id) and (
        publication.visibility = 'community' or (
          publication.visibility = 'circle' and exists(select 1 from public.relationships where member_low=least(viewer,publication.author_id) and member_high=greatest(viewer,publication.author_id))
        )
      )
    )
  )
$$;

create function private.require_plan_publication(publication_input uuid, require_copy boolean default false)
returns public.plan_publications language plpgsql stable security definer set search_path = '' as $$
declare publication public.plan_publications%rowtype;
begin
  select * into publication from public.plan_publications where id=publication_input;
  if not found or not private.plan_publication_visible(public.require_actor(),publication)
    or (require_copy and not publication.copy_allowed) then
    if found and require_copy and private.plan_publication_visible(public.require_actor(),publication) then raise exception 'publication is not copyable'; end if;
    raise exception 'publication unavailable';
  end if;
  return publication;
end;
$$;

create function private.plan_publication_projection(publication public.plan_publications)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',publication.id,'kind',publication.content_kind,'sourceVersionId',publication.source_version_id,
    'visibility',publication.visibility,'copyAllowed',publication.copy_allowed,'snapshot',publication.snapshot,
    'createdAt',publication.created_at,'authorAlias',profile.alias,'authorAvatarId',profile.avatar_id,
    'authorFrameId',profile.equipped_frame_id,'authorTitleId',profile.equipped_title_id,
    'authorThemeId',profile.presentation_theme_id,'isAuthor',publication.author_id=public.require_actor(),
    'reactionCount',(select count(*) from public.plan_publication_reactions reaction where reaction.publication_id=publication.id),
    'viewerHasReacted',exists(select 1 from public.plan_publication_reactions reaction where reaction.publication_id=publication.id and reaction.actor_id=public.require_actor()),
    'comments',coalesce((select jsonb_agg(jsonb_build_object('id',comment.id,'authorAlias',author.alias,'body',comment.body,'createdAt',comment.created_at,'isAuthor',comment.author_id=public.require_actor()) order by comment.created_at,comment.id) from public.plan_publication_comments comment join public.profiles author on author.id=comment.author_id where comment.publication_id=publication.id and comment.deleted_at is null and comment.moderation_hidden_at is null),'[]'::jsonb)
  ) from public.profiles profile where profile.id=publication.author_id
$$;

create function public.create_plan_publication(kind_input text, source_id text, visibility_input text, copy_allowed_input boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); library public.training_libraries%rowtype; source jsonb; routines jsonb; snapshot_value jsonb; publication_id uuid;
begin
  if kind_input not in ('routine','mesocycle') or visibility_input not in ('private','circle','community') or copy_allowed_input is null or nullif(btrim(source_id),'') is null then raise exception 'invalid publication input'; end if;
  select * into library from public.training_libraries where owner_id=actor;
  if kind_input='routine' then
    select value into source from jsonb_array_elements(coalesce(library.routines,'[]')) where value->>'id'=source_id;
    if source is null or not public.training_library_valid_routine(source) then raise exception 'plan unavailable'; end if;
    snapshot_value:=jsonb_build_object('routines',jsonb_build_array(source));
  else
    select value into source from jsonb_array_elements(coalesce(library.mesocycles,'[]')) where value->>'id'=source_id;
    select coalesce(jsonb_agg(routine.value order by routine.ordinality),'[]') into routines from jsonb_array_elements(coalesce(library.routines,'[]')) with ordinality routine(value,ordinality)
      where exists(select 1 from jsonb_array_elements(source->'weeks') week cross join lateral jsonb_array_elements(week->'entries') entry where coalesce(entry->>'kind','')<>'rest' and entry->'ref'->>'routineId'=routine.value->>'id');
    if source is null or not public.training_library_valid_routines(routines) or not public.training_library_valid_mesocycle(source,routines) then raise exception 'plan unavailable'; end if;
    snapshot_value:=jsonb_build_object('routines',routines,'mesocycle',source);
  end if;
  insert into public.plan_publications(author_id,content_kind,source_version_id,snapshot,visibility,copy_allowed)
  values(actor,kind_input,coalesce(source->>'version',source->>'id'),snapshot_value,visibility_input,copy_allowed_input) returning id into publication_id;
  return publication_id;
end;
$$;

create function public.get_plan_publication(publication_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare publication public.plan_publications%rowtype;
begin publication:=private.require_plan_publication(publication_id); return private.plan_publication_projection(publication); end;
$$;

create function public.update_plan_publication(publication_id uuid, visibility_input text, copy_allowed_input boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if visibility_input not in ('private','circle','community') or copy_allowed_input is null then raise exception 'invalid publication input'; end if;
  update public.plan_publications set visibility=visibility_input,copy_allowed=copy_allowed_input where id=publication_id and author_id=public.require_actor() and deleted_at is null and moderation_hidden_at is null;
  if not found then raise exception 'publication unavailable'; end if;
end;
$$;

create function public.delete_plan_publication(publication_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.plan_publications set deleted_at=now() where id=publication_id and author_id=public.require_actor() and deleted_at is null;
  if not found then raise exception 'publication unavailable'; end if;
end;
$$;

create function public.copy_plan_publication(publication_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); publication public.plan_publications%rowtype; library public.training_libraries%rowtype; prior jsonb; routine_map jsonb; source_routine jsonb; copied_routines jsonb:='[]'; copied_mesocycle jsonb; next_routines jsonb; next_mesocycles jsonb; copied_at timestamptz:=now(); origin jsonb;
begin
  select * into publication from public.plan_publications where id=publication_id for update;
  publication:=private.require_plan_publication(publication_id,true);
  if publication.author_id=actor then raise exception 'authors cannot copy their own publication'; end if;
  select copy.imported_ids into prior from public.plan_publication_copies copy where copy.publication_id=publication.id and copy.actor_id=actor;
  if prior is not null then return prior; end if;
  select * into library from public.training_libraries where owner_id=actor for update;
  select coalesce(jsonb_object_agg(value->>'id',gen_random_uuid()::text),'{}') into routine_map from jsonb_array_elements(publication.snapshot->'routines');
  origin:=jsonb_build_object('publicationId',publication.id,'sourceAuthorId',publication.author_id,'sourceVersionId',publication.source_version_id,'copiedAt',copied_at);
  for source_routine in select value from jsonb_array_elements(publication.snapshot->'routines') loop
    copied_routines:=copied_routines||jsonb_set(jsonb_set(private.copy_shared_routine(source_routine),'{id}',to_jsonb(routine_map->>(source_routine->>'id'))),'{publicationOrigin}',origin,true);
  end loop;
  if publication.content_kind='mesocycle' then
    copied_mesocycle:=jsonb_set(private.copy_shared_mesocycle(publication.snapshot->'mesocycle',routine_map)-array['startDate','pausedAt','pausedOn','scheduleShiftDays','lifecycleHistory'],'{publicationOrigin}',origin,true);
  end if;
  next_routines:=coalesce(library.routines,'[]')||copied_routines;
  next_mesocycles:=coalesce(library.mesocycles,'[]')||case when copied_mesocycle is null then '[]' else jsonb_build_array(copied_mesocycle) end;
  if not public.training_library_valid_routines(next_routines) or next_mesocycles is distinct from public.sanitize_training_mesocycles(next_mesocycles,next_routines) then raise exception 'invalid publication snapshot'; end if;
  insert into public.training_libraries(owner_id,routines,mesocycles) values(actor,next_routines,next_mesocycles)
    on conflict(owner_id) do update set routines=excluded.routines,mesocycles=excluded.mesocycles,updated_at=now();
  prior:=jsonb_build_object('routineIds',coalesce((select jsonb_agg(value) from jsonb_each_text(routine_map)),'[]'),'mesocycleId',case when copied_mesocycle is null then null else copied_mesocycle->>'id' end);
  insert into public.plan_publication_copies values(publication.id,actor,prior,now());
  return prior;
end;
$$;

create function public.set_plan_publication_reaction(publication_id uuid, reacted boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); publication public.plan_publications%rowtype;
begin
  if reacted is null then raise exception 'invalid publication reaction'; end if; publication:=private.require_plan_publication(publication_id);
  if reacted then insert into public.plan_publication_reactions values(publication.id,actor,now()) on conflict do nothing; else delete from public.plan_publication_reactions where plan_publication_reactions.publication_id=publication.id and actor_id=actor; end if;
  return jsonb_build_object('reacted',reacted,'reactionCount',(select count(*) from public.plan_publication_reactions where plan_publication_reactions.publication_id=publication.id));
end;
$$;

create function public.create_plan_publication_comment(publication_id uuid, body_input text) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); publication public.plan_publications%rowtype; body_value text:=btrim(coalesce(body_input,'')); comment_id uuid;
begin
  publication:=private.require_plan_publication(publication_id); if char_length(body_value) not between 1 and 500 then raise exception 'invalid publication comment'; end if;
  insert into public.plan_publication_comments(publication_id,author_id,body) values(publication.id,actor,body_value) returning id into comment_id; return comment_id;
end;
$$;
create function public.delete_plan_publication_comment(comment_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin update public.plan_publication_comments set deleted_at=now() where id=comment_id and author_id=public.require_actor() and deleted_at is null; if not found then raise exception 'comment unavailable'; end if; end;
$$;

create function public.report_plan_content(target_kind_input text,target_id_input uuid,reason_input text) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); reason_value text:=btrim(coalesce(reason_input,'')); publication public.plan_publications%rowtype; report_id uuid;
begin
  if target_kind_input='publication' then publication:=private.require_plan_publication(target_id_input);
  elsif target_kind_input='comment' then select target_publication.* into publication from public.plan_publication_comments comment join public.plan_publications target_publication on target_publication.id=comment.publication_id where comment.id=target_id_input and comment.deleted_at is null and comment.moderation_hidden_at is null; if not found or not private.plan_publication_visible(actor,publication) then raise exception 'content unavailable'; end if;
  else raise exception 'invalid report target'; end if;
  if char_length(reason_value) not between 1 and 500 then raise exception 'invalid report reason'; end if;
  insert into public.plan_publication_reports(reporter_id,target_kind,target_id,reason) values(actor,target_kind_input,target_id_input,reason_value)
    on conflict(reporter_id,target_kind,target_id) do update set reason=excluded.reason returning id into report_id; return report_id;
end;
$$;

create function public.list_plan_feed(cursor text default null,page_size integer default 20) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid:=public.require_actor(); bounded integer:=least(greatest(coalesce(page_size,20),1),50); decoded jsonb; cursor_time timestamptz; cursor_id uuid; result jsonb; extra boolean; last_item jsonb;
begin
  if cursor is not null then begin decoded:=convert_from(decode(cursor,'base64'),'UTF8')::jsonb; cursor_time:=(decoded->>'c')::timestamptz; cursor_id:=(decoded->>'i')::uuid; if cursor_time is null or cursor_id is null then raise exception 'invalid cursor'; end if; exception when others then raise exception 'invalid cursor'; end; end if;
  with candidates as (
    select activity.id,activity.created_at,jsonb_build_object('type','activity','id',activity.id,'kind',activity.kind,'authorAlias',profile.alias,'payload',activity.payload,'createdAt',activity.created_at) item from public.community_activities activity join public.profiles profile on profile.id=activity.author_id where private.is_recap_viewer(actor,activity.author_id)
    union all
    select publication.id,publication.created_at,jsonb_build_object('type','publication')||private.plan_publication_projection(publication) from public.plan_publications publication where private.plan_publication_visible(actor,publication)
  ), page as (select * from candidates where cursor_id is null or (created_at,id)<(cursor_time,cursor_id) order by created_at desc,id desc limit bounded+1), numbered as (select *,row_number() over(order by created_at desc,id desc) n from page)
  select coalesce(jsonb_agg(item order by created_at desc,id desc) filter(where n<=bounded),'[]'),bool_or(n>bounded),(jsonb_agg(item order by created_at desc,id desc) filter(where n<=bounded))->-1 into result,extra,last_item from numbered;
  return jsonb_build_object('items',result,'nextCursor',case when coalesce(extra,false) then encode(convert_to(jsonb_build_object('c',last_item->>'createdAt','i',last_item->>'id')::text,'UTF8'),'base64') else null end);
end;
$$;

alter table public.plan_publications enable row level security;
alter table public.plan_publication_copies enable row level security;
alter table public.plan_publication_reactions enable row level security;
alter table public.plan_publication_comments enable row level security;
alter table public.plan_publication_reports enable row level security;
revoke all on public.plan_publications,public.plan_publication_copies,public.plan_publication_reactions,public.plan_publication_comments,public.plan_publication_reports from public,anon,authenticated;
revoke all on function private.prevent_plan_publication_snapshot_edit(),private.plan_publication_visible(uuid,public.plan_publications),private.require_plan_publication(uuid,boolean),private.plan_publication_projection(public.plan_publications) from public,anon,authenticated;
revoke all on function public.create_plan_publication(text,text,text,boolean),public.get_plan_publication(uuid),public.update_plan_publication(uuid,text,boolean),public.delete_plan_publication(uuid),public.copy_plan_publication(uuid),public.set_plan_publication_reaction(uuid,boolean),public.create_plan_publication_comment(uuid,text),public.delete_plan_publication_comment(uuid),public.report_plan_content(text,uuid,text),public.list_plan_feed(text,integer) from public,anon;
grant execute on function public.create_plan_publication(text,text,text,boolean),public.get_plan_publication(uuid),public.update_plan_publication(uuid,text,boolean),public.delete_plan_publication(uuid),public.copy_plan_publication(uuid),public.set_plan_publication_reaction(uuid,boolean),public.create_plan_publication_comment(uuid,text),public.delete_plan_publication_comment(uuid),public.report_plan_content(text,uuid,text),public.list_plan_feed(text,integer) to authenticated;
