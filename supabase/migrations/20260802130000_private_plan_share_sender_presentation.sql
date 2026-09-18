create or replace function public.list_received_private_plan_share_requests()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', request.id,
    'senderAlias', profile.alias,
    'senderAvatarId', profile.avatar_id,
    'senderThemeId', profile.presentation_theme_id,
    'contentKind', request.content_kind,
    'snapshot', request.snapshot,
    'createdAt', request.created_at
  ) order by request.created_at desc), '[]'::jsonb)
  from public.private_plan_share_requests request
  join public.profiles profile on profile.id = request.sender_id
  where request.recipient_id = public.require_actor() and request.status = 'pending'
$$;
