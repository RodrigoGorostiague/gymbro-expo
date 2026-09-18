create function public.get_workout_recap_reaction_states(recap_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  return coalesce((select jsonb_object_agg(recap.id, jsonb_build_object(
    'reaction_count', (select count(*) from public.workout_recap_reactions reaction where reaction.recap_id = recap.id),
    'viewer_has_reacted', exists (select 1 from public.workout_recap_reactions reaction where reaction.recap_id = recap.id and reaction.actor_id = actor)
  )) from public.workout_recaps recap where recap.id = any(coalesce(recap_ids, '{}'::uuid[])) and recap.deleted_at is null and private.is_recap_viewer(actor, recap.author_id)), '{}'::jsonb);
end;
$$;

revoke all on function public.get_workout_recap_reaction_states(uuid[]) from public, anon;
grant execute on function public.get_workout_recap_reaction_states(uuid[]) to authenticated;
