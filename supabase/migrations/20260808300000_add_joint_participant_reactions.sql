-- Stars are a single idempotent reaction per viewer and completed participant workout.
create table public.joint_workout_participant_reactions (
  joint_workout_id uuid not null,
  participant_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (joint_workout_id, participant_id, actor_id),
  foreign key (joint_workout_id, participant_id) references public.joint_workout_participants(joint_workout_id, participant_id) on delete cascade
);

create function public.set_joint_participant_reaction(workout_id uuid, target_id uuid, reacted boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); target public.joint_workout_participants%rowtype; actor_alias text;
begin
  if reacted is null then raise exception 'invalid joint workout reaction'; end if;
  select * into target from public.joint_workout_participants
  where joint_workout_id = workout_id and participant_id = target_id and status = 'completed'
    and private.can_view_joint_participant(actor, participant_id, visibility);
  if not found then raise exception 'joint workout unavailable'; end if;
  if reacted then
    insert into public.joint_workout_participant_reactions(joint_workout_id, participant_id, actor_id) values (workout_id, target_id, actor)
    on conflict do nothing;
    if found and target_id <> actor then
      select alias into actor_alias from public.profiles where id = actor;
      perform private.create_notification(target_id, 'joint_workout_reaction', 'Nueva estrella',
        coalesce(actor_alias, 'Un atleta') || ' dejó una estrella en tu entrenamiento.',
        jsonb_build_object('url', '/community/joint/' || workout_id, 'workout_id', workout_id, 'participant_id', target_id),
        'joint-workout-reaction:' || workout_id || ':' || target_id || ':' || actor);
    end if;
  else
    delete from public.joint_workout_participant_reactions where joint_workout_id = workout_id and participant_id = target_id and actor_id = actor;
  end if;
  return jsonb_build_object('reacted', reacted, 'reaction_count', (select count(*) from public.joint_workout_participant_reactions where joint_workout_id = workout_id and participant_id = target_id));
end;
$$;

create function public.get_joint_participant_reaction_states(workout_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_object_agg(participant.participant_id, jsonb_build_object(
    'reaction_count', (select count(*) from public.joint_workout_participant_reactions reaction where reaction.joint_workout_id = participant.joint_workout_id and reaction.participant_id = participant.participant_id),
    'viewer_has_reacted', exists (select 1 from public.joint_workout_participant_reactions reaction where reaction.joint_workout_id = participant.joint_workout_id and reaction.participant_id = participant.participant_id and reaction.actor_id = actor)
  )) from public.joint_workout_participants participant where participant.joint_workout_id = workout_id and participant.status = 'completed' and private.can_view_joint_participant(actor, participant.participant_id, participant.visibility)), '{}'::jsonb);
end;
$$;

alter table public.joint_workout_participant_reactions enable row level security;
revoke all on public.joint_workout_participant_reactions from anon, authenticated;
revoke all on function public.set_joint_participant_reaction(uuid, uuid, boolean), public.get_joint_participant_reaction_states(uuid) from public, anon;
grant execute on function public.set_joint_participant_reaction(uuid, uuid, boolean), public.get_joint_participant_reaction_states(uuid) to authenticated;
