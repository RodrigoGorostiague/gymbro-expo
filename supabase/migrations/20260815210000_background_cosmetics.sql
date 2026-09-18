-- Backgrounds are independent cosmetics: owning or equipping one never changes a theme.
create table public.reward_background_catalog (
  background_id text primary key,
  price integer not null check (price >= 0)
);

insert into public.reward_background_catalog(background_id, price) values
  ('banzai', 250), ('sakura', 250);

create table public.reward_background_inventory (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  background_id text not null references public.reward_background_catalog(background_id),
  purchased_at timestamptz not null default now(),
  primary key (owner_id, background_id)
);

alter table public.reward_wallets add column equipped_background_id text references public.reward_background_catalog(background_id);

create or replace function public.load_reward_wallet()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'balance', coalesce(wallet.balance, 0),
    'purchasedThemeIds', coalesce(wallet.purchased_theme_ids, '[]'::jsonb),
    'purchasedFrameIds', coalesce((select jsonb_agg(inventory.frame_id order by inventory.frame_id) from public.reward_profile_frame_inventory inventory where inventory.owner_id = auth.actor), '[]'::jsonb),
    'purchasedTitleIds', coalesce((select jsonb_agg(inventory.title_id order by inventory.title_id) from public.reward_profile_title_inventory inventory where inventory.owner_id = auth.actor), '[]'::jsonb),
    'purchasedBackgroundIds', coalesce((select jsonb_agg(inventory.background_id order by inventory.background_id) from public.reward_background_inventory inventory where inventory.owner_id = auth.actor), '[]'::jsonb),
    'equippedThemeId', wallet.equipped_theme_id,
    'equippedBackgroundId', wallet.equipped_background_id,
    'combineWithPartner', coalesce(wallet.combine_with_partner, false)
  )
  from (select public.require_actor() as actor) auth
  left join public.reward_wallets wallet on wallet.owner_id = auth.actor
$$;

create function public.purchase_reward_background(background_id_input text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); price_value integer; wallet public.reward_wallets%rowtype;
begin
  select price into price_value from public.reward_background_catalog where background_id = background_id_input;
  if price_value is null then raise exception 'unknown background'; end if;
  insert into public.reward_wallets(owner_id) values (actor) on conflict do nothing;
  select * into wallet from public.reward_wallets where owner_id = actor for update;
  if exists (select 1 from public.reward_background_inventory where owner_id = actor and background_id = background_id_input) then return public.load_reward_wallet(); end if;
  if wallet.balance < price_value then raise exception 'insufficient reward balance'; end if;
  insert into public.reward_background_inventory(owner_id, background_id) values (actor, background_id_input);
  update public.reward_wallets set balance = balance - price_value, equipped_background_id = background_id_input where owner_id = actor;
  insert into public.reward_ledger_entries(owner_id, idempotency_key, amount, kind, breakdown)
  values (actor, format('background-purchase:%s', background_id_input), -price_value, 'background_purchase', jsonb_build_object('backgroundId', background_id_input));
  return public.load_reward_wallet();
end;
$$;

create function public.update_reward_background_preferences(equipped_background_id_input text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  insert into public.reward_wallets(owner_id) values (actor) on conflict do nothing;
  if equipped_background_id_input is not null and not exists (
    select 1 from public.reward_background_inventory
    where owner_id = actor and background_id = equipped_background_id_input
  ) then raise exception 'background is not owned'; end if;
  update public.reward_wallets set equipped_background_id = equipped_background_id_input where owner_id = actor;
  return public.load_reward_wallet();
end;
$$;

alter table public.reward_background_catalog enable row level security;
alter table public.reward_background_inventory enable row level security;
revoke all on public.reward_background_catalog, public.reward_background_inventory from anon, authenticated;
revoke all on function public.purchase_reward_background(text), public.update_reward_background_preferences(text) from public, anon;
grant execute on function public.purchase_reward_background(text), public.update_reward_background_preferences(text) to authenticated;
