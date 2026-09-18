-- Private Partner messages are server-authorized notifications, never joint activity.
create function public.send_partner_message(recipient uuid, message_type text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_actor();
  sender_alias text;
  notification_title text;
  notification_body text;
begin
  if recipient is null or recipient = actor then
    raise exception 'partner message unavailable';
  end if;

  if message_type is null or message_type not in ('kiss', 'muscle', 'angry', 'cry') then
    raise exception 'invalid partner message type';
  end if;

  if not exists (
    select 1 from public.relationships relationship
    where relationship.member_low = least(actor, recipient)
      and relationship.member_high = greatest(actor, recipient)
      and relationship.kind = 'partner'
  ) or exists (
    select 1 from public.blocks block
    where (block.blocker_id, block.blocked_id) in ((actor, recipient), (recipient, actor))
  ) then
    raise exception 'partner message unavailable';
  end if;

  select alias into sender_alias from public.profiles where id = actor;
  select case message_type
    when 'kiss' then '💋 GymBro'
    when 'muscle' then '💪 GymBro'
    when 'angry' then '😠 GymBro'
    when 'cry' then '😢 GymBro'
  end, case message_type
    when 'kiss' then coalesce(sender_alias, 'Tu Partner') || ' te envía un beso 💋'
    when 'muscle' then coalesce(sender_alias, 'Tu Partner') || ' te manda ánimo 💪'
    when 'angry' then coalesce(sender_alias, 'Tu Partner') || ' está pensando en vos 😠'
    when 'cry' then coalesce(sender_alias, 'Tu Partner') || ' quiere irse 😢'
  end into notification_title, notification_body;

  perform private.create_notification(
    recipient,
    'partner_message',
    notification_title,
    notification_body,
    '{}'::jsonb,
    null
  );
end;
$$;

revoke all on function public.send_partner_message(uuid, text) from public, anon;
grant execute on function public.send_partner_message(uuid, text) to authenticated;
