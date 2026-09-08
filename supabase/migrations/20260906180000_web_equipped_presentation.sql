create or replace function public.get_own_web_presentation()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'avatarId', profile.avatar_id,
    'frameId', profile.equipped_frame_id,
    'titleId', profile.equipped_title_id,
    'themeId', coalesce(wallet.equipped_theme_id, profile.presentation_theme_id)
  )
  from (select public.require_actor() as actor) auth
  join public.profiles profile on profile.id = auth.actor
  left join public.reward_wallets wallet on wallet.owner_id = auth.actor
$$;

revoke all on function public.get_own_web_presentation() from public;
revoke execute on function public.get_own_web_presentation() from anon;
grant execute on function public.get_own_web_presentation() to authenticated;
