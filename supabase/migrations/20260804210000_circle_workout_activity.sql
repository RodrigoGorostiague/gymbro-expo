-- Short-lived, circle-only training presence. It contains no set, load, or completion data.
create table public.workout_start_activities (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  routine_name text not null check (char_length(routine_name) between 1 and 120),
  joint_workout_id uuid references public.joint_workouts(id) on delete set null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  check (expires_at > started_at)
);

create unique index workout_start_activities_one_open_author
  on public.workout_start_activities (author_id) where closed_at is null;
create index workout_start_activities_feed
  on public.workout_start_activities (started_at desc) where closed_at is null;

create function private.can_view_workout_start_activity(viewer uuid, author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select viewer = author or private.is_recap_viewer(viewer, author)
$$;

create function public.publish_workout_start_activity(input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  routine text;
  joint_id uuid;
begin
  if input is null or jsonb_typeof(input) <> 'object'
    or not input ? 'routine_name'
    or exists (select 1 from jsonb_object_keys(input) key where key <> all(array['routine_name', 'joint_workout_id']))
    or jsonb_typeof(input -> 'routine_name') <> 'string' then
    raise exception 'invalid workout start activity';
  end if;

  routine := btrim(input ->> 'routine_name');
  if char_length(routine) not between 1 and 120 then raise exception 'invalid workout start activity'; end if;
  if input ? 'joint_workout_id' then
    begin
      joint_id := (input ->> 'joint_workout_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid workout start activity';
    end;
    if not exists (
      select 1 from public.joint_workout_participants participant
      where participant.joint_workout_id = joint_id
        and participant.participant_id = actor
        and participant.status = 'active'
    ) then raise exception 'joint workout participant unavailable'; end if;
  end if;

  update public.workout_start_activities
  set closed_at = now()
  where author_id = actor and closed_at is null;

  insert into public.workout_start_activities (author_id, routine_name, joint_workout_id, expires_at)
  values (actor, routine, joint_id, now() + interval '2 hours');
end;
$$;

create function public.close_workout_start_activity()
returns void language sql security definer set search_path = '' as $$
  update public.workout_start_activities
  set closed_at = now()
  where author_id = public.require_actor() and closed_at is null
$$;

create function public.list_workout_start_activities()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', activity.id,
      'author_alias', profile.alias,
      'author_avatar_id', profile.avatar_id,
      'author_theme_id', profile.presentation_theme_id,
      'routine_name', activity.routine_name,
      'joint_workout_id', activity.joint_workout_id,
      'started_at', activity.started_at,
      'expires_at', activity.expires_at,
      'is_author', activity.author_id = actor
    ) order by activity.started_at desc)
    from public.workout_start_activities activity
    join public.profiles profile on profile.id = activity.author_id
    where activity.closed_at is null
      and activity.expires_at > now()
      and private.can_view_workout_start_activity(actor, activity.author_id)
  ), '[]'::jsonb);
end;
$$;

alter table public.workout_start_activities enable row level security;
create policy workout_start_activities_realtime_read on public.workout_start_activities
  for select to authenticated using (
    closed_at is null
    and expires_at > now()
    and private.can_view_workout_start_activity(auth.uid(), author_id)
  );

revoke all on public.workout_start_activities from anon, authenticated;
revoke all on function private.can_view_workout_start_activity(uuid, uuid) from public, anon, authenticated;
grant execute on function private.can_view_workout_start_activity(uuid, uuid) to authenticated;
revoke all on function public.publish_workout_start_activity(jsonb), public.close_workout_start_activity(), public.list_workout_start_activities() from public, anon;
grant execute on function public.publish_workout_start_activity(jsonb), public.close_workout_start_activity(), public.list_workout_start_activities() to authenticated;

alter publication supabase_realtime add table public.workout_start_activities;
