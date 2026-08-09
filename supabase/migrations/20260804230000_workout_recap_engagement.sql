-- Circle-authorized recap engagement. Base rows stay server-owned; RPCs expose
-- only presentation-safe projections and recheck the existing recap audience.
create table public.workout_recap_reactions (
  recap_id uuid not null references public.workout_recaps(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recap_id, actor_id)
);

create table public.workout_recap_comments (
  id uuid primary key default gen_random_uuid(),
  recap_id uuid not null references public.workout_recaps(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index workout_recap_comments_recap_created_at on public.workout_recap_comments (recap_id, created_at, id);

create function private.require_recap_engagement(recap_input uuid)
returns public.workout_recaps language plpgsql stable security definer set search_path = '' as $$
declare recap public.workout_recaps%rowtype;
begin
  select * into recap from public.workout_recaps
  where id = recap_input and deleted_at is null
    and private.is_recap_viewer(public.require_actor(), author_id);
  if not found then raise exception 'recap unavailable'; end if;
  return recap;
end;
$$;

create function private.workout_recap_comment_projection(comment_input public.workout_recap_comments)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', comment_input.id, 'author_alias', profile.alias,
    'author_avatar_id', profile.avatar_id, 'author_theme_id', profile.presentation_theme_id,
    'body', comment_input.body, 'created_at', comment_input.created_at,
    'is_author', comment_input.author_id = public.require_actor())
  from public.profiles profile where profile.id = comment_input.author_id
$$;

create or replace function public.get_workout_recap_detail(recap_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); recap public.workout_recaps%rowtype; result jsonb;
begin
  recap := private.require_recap_engagement(recap_id);
  select jsonb_build_object(
    'id', recap.id, 'author_alias', profile.alias, 'author_avatar_id', profile.avatar_id,
    'author_theme_id', profile.presentation_theme_id, 'routine_name', recap.routine_name,
    'completed_at', recap.completed_at, 'duration_seconds', recap.duration_seconds,
    'exercise_count', recap.exercise_count,
    'muscle_group_ids', coalesce((select array_agg(distinct muscle.value #>> '{}' order by muscle.value #>> '{}') from jsonb_array_elements(coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb)) exercise(value) cross join lateral jsonb_array_elements(coalesce(exercise.value -> 'muscle_group_ids', '[]'::jsonb)) muscle(value)), '{}'::text[]),
    'metrics', recap.metrics, 'caption', recap.caption, 'created_at', recap.created_at,
    'exercises', coalesce(recap.exercise_details -> 'exercises', '[]'::jsonb),
    'template_available', recap.share_payload ? 'routine', 'mesocycle_available', recap.share_payload ? 'mesocycle',
    'is_author', recap.author_id = actor, 'share_payload', recap.share_payload,
    'reaction_count', (select count(*) from public.workout_recap_reactions reaction where reaction.recap_id = recap.id),
    'viewer_has_reacted', exists (select 1 from public.workout_recap_reactions reaction where reaction.recap_id = recap.id and reaction.actor_id = actor),
    'comments', coalesce((select jsonb_agg(private.workout_recap_comment_projection(comment) order by comment.created_at, comment.id) from (select * from public.workout_recap_comments where recap_id = recap.id order by created_at desc, id desc limit 50) comment), '[]'::jsonb)
  ) into result from public.profiles profile where profile.id = recap.author_id;
  return result;
end;
$$;

create function public.set_workout_recap_reaction(recap_id uuid, reacted boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare recap public.workout_recaps%rowtype; actor uuid := public.require_actor();
begin
  if reacted is null then raise exception 'invalid recap reaction'; end if;
  recap := private.require_recap_engagement(recap_id);
  if reacted then
    insert into public.workout_recap_reactions(recap_id, actor_id) values (recap.id, actor) on conflict (recap_id, actor_id) do nothing;
    if found and recap.author_id <> actor then
      perform private.create_notification(recap.author_id, 'workout_recap_reaction', 'Nueva reacción',
        coalesce((select alias from public.profiles where id = actor), 'Un atleta') || ' reaccionó a tu entrenamiento.',
        jsonb_build_object('url', '/social/recap/' || recap.id), 'workout-recap-reaction:' || recap.id || ':' || actor);
    end if;
  else
    delete from public.workout_recap_reactions where workout_recap_reactions.recap_id = recap.id and actor_id = actor;
  end if;
  return jsonb_build_object('reacted', reacted, 'reaction_count', (select count(*) from public.workout_recap_reactions reaction where reaction.recap_id = recap.id));
end;
$$;

create function public.create_workout_recap_comment(recap_id uuid, body_input text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare recap public.workout_recaps%rowtype; actor uuid := public.require_actor(); body_value text; comment public.workout_recap_comments%rowtype;
begin
  recap := private.require_recap_engagement(recap_id);
  body_value := btrim(coalesce(body_input, ''));
  if char_length(body_value) not between 1 and 500 then raise exception 'invalid recap comment'; end if;
  insert into public.workout_recap_comments(recap_id, author_id, body) values (recap.id, actor, body_value) returning * into comment;
  if recap.author_id <> actor then
    perform private.create_notification(recap.author_id, 'workout_recap_comment', 'Nuevo comentario',
      coalesce((select alias from public.profiles where id = actor), 'Un atleta') || ' comentó tu entrenamiento.',
      jsonb_build_object('url', '/social/recap/' || recap.id), 'workout-recap-comment:' || comment.id);
  end if;
  return private.workout_recap_comment_projection(comment);
end;
$$;

alter table public.workout_recap_reactions enable row level security;
alter table public.workout_recap_comments enable row level security;
revoke all on public.workout_recap_reactions, public.workout_recap_comments from anon, authenticated;
revoke all on function private.require_recap_engagement(uuid), private.workout_recap_comment_projection(public.workout_recap_comments) from public, anon, authenticated;
revoke all on function public.get_workout_recap_detail(uuid) from public, anon;
revoke all on function public.set_workout_recap_reaction(uuid, boolean), public.create_workout_recap_comment(uuid, text) from public, anon;
grant execute on function public.get_workout_recap_detail(uuid) to authenticated;
grant execute on function public.set_workout_recap_reaction(uuid, boolean), public.create_workout_recap_comment(uuid, text) to authenticated;
