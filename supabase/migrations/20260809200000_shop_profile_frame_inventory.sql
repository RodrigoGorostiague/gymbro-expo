-- Commercial cosmetics use their own immutable catalog and inventory. Theme ownership remains untouched.
create table public.reward_profile_frame_catalog (
  frame_id text primary key,
  price integer not null check (price between 340 and 1100)
);

insert into public.reward_profile_frame_catalog(frame_id, price) values
  ('shop-campeon-indiscutible', 340), ('shop-heavy-duty', 360), ('shop-neon-vital', 380), ('shop-alfa', 400),
  ('shop-la-12', 420), ('shop-rosa-carmesi', 440), ('shop-millo', 460), ('shop-celtic-spirit', 480),
  ('shop-hierro-fe-disciplina', 500), ('shop-yo-soy-el-huno', 520), ('shop-spqr', 540), ('shop-fuerza-rinoceronte', 560),
  ('shop-fuerza-pantera', 600), ('shop-diamond-fit', 640), ('shop-ruby-fit', 680), ('shop-valhalla-training', 720),
  ('shop-aurora-fitness', 760), ('shop-holy-fit', 800), ('shop-medjay-core', 840), ('shop-fuerza-cocodrilo', 880),
  ('shop-fuerza-gorila', 920), ('shop-elegante-sport', 960), ('shop-banzai', 1000), ('shop-neon-gym', 1020),
  ('shop-fuerza-elefante', 1040), ('shop-this-is-sparta', 1060), ('shop-fuerza-tigre', 1080), ('shop-winter-arc', 1100);

create table public.reward_profile_frame_inventory (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  frame_id text not null references public.reward_profile_frame_catalog(frame_id),
  purchased_at timestamptz not null default now(),
  primary key (owner_id, frame_id)
);

-- Reserved independently for the forthcoming title store; it must never share frame ownership.
create table public.reward_profile_title_inventory (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title_id text not null,
  purchased_at timestamptz not null default now(),
  primary key (owner_id, title_id)
);

alter table public.profiles drop constraint if exists profiles_equipped_frame_id_check;
alter table public.profiles add constraint profiles_equipped_frame_id_check check (equipped_frame_id in (
  'principiante', 'intermedio', 'avanzado', 'gymbro', 'gymrat', 'g-boom', 'alfa', 'alfa-user', 'sigma',
  'brawl-rookie', 'brawl-contender', 'brawl-challenger', 'brawl-elite', 'brawl-apex', 'brawl-titan', 'brawl-warlord', 'brawl-legend',
  'shop-campeon-indiscutible', 'shop-heavy-duty', 'shop-neon-vital', 'shop-alfa', 'shop-la-12', 'shop-rosa-carmesi', 'shop-millo', 'shop-celtic-spirit', 'shop-hierro-fe-disciplina', 'shop-yo-soy-el-huno', 'shop-spqr', 'shop-fuerza-rinoceronte', 'shop-fuerza-pantera', 'shop-diamond-fit', 'shop-ruby-fit', 'shop-valhalla-training', 'shop-aurora-fitness', 'shop-holy-fit', 'shop-medjay-core', 'shop-fuerza-cocodrilo', 'shop-fuerza-gorila', 'shop-elegante-sport', 'shop-banzai', 'shop-neon-gym', 'shop-fuerza-elefante', 'shop-this-is-sparta', 'shop-fuerza-tigre', 'shop-winter-arc'
));
alter table public.public_profiles drop constraint if exists public_profiles_equipped_frame_id_check;
alter table public.public_profiles add constraint public_profiles_equipped_frame_id_check check (equipped_frame_id in (
  'principiante', 'intermedio', 'avanzado', 'gymbro', 'gymrat', 'g-boom', 'alfa', 'alfa-user', 'sigma',
  'brawl-rookie', 'brawl-contender', 'brawl-challenger', 'brawl-elite', 'brawl-apex', 'brawl-titan', 'brawl-warlord', 'brawl-legend',
  'shop-campeon-indiscutible', 'shop-heavy-duty', 'shop-neon-vital', 'shop-alfa', 'shop-la-12', 'shop-rosa-carmesi', 'shop-millo', 'shop-celtic-spirit', 'shop-hierro-fe-disciplina', 'shop-yo-soy-el-huno', 'shop-spqr', 'shop-fuerza-rinoceronte', 'shop-fuerza-pantera', 'shop-diamond-fit', 'shop-ruby-fit', 'shop-valhalla-training', 'shop-aurora-fitness', 'shop-holy-fit', 'shop-medjay-core', 'shop-fuerza-cocodrilo', 'shop-fuerza-gorila', 'shop-elegante-sport', 'shop-banzai', 'shop-neon-gym', 'shop-fuerza-elefante', 'shop-this-is-sparta', 'shop-fuerza-tigre', 'shop-winter-arc'
));

alter table public.profiles alter column equipped_title_id drop not null;
alter table public.public_profiles alter column equipped_title_id drop not null;

create or replace function public.load_reward_wallet()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'balance', coalesce(wallet.balance, 0),
    'purchasedThemeIds', coalesce(wallet.purchased_theme_ids, '[]'::jsonb),
    'purchasedFrameIds', coalesce((select jsonb_agg(inventory.frame_id order by inventory.frame_id) from public.reward_profile_frame_inventory inventory where inventory.owner_id = auth.actor), '[]'::jsonb),
    'purchasedTitleIds', coalesce((select jsonb_agg(inventory.title_id order by inventory.title_id) from public.reward_profile_title_inventory inventory where inventory.owner_id = auth.actor), '[]'::jsonb),
    'equippedThemeId', wallet.equipped_theme_id,
    'combineWithPartner', coalesce(wallet.combine_with_partner, false)
  )
  from (select public.require_actor() as actor) auth
  left join public.reward_wallets wallet on wallet.owner_id = auth.actor
$$;

create function public.purchase_reward_profile_frame(frame_id_input text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); price_value integer; wallet public.reward_wallets%rowtype;
begin
  select price into price_value from public.reward_profile_frame_catalog where frame_id = frame_id_input;
  if price_value is null then raise exception 'unknown profile frame'; end if;
  insert into public.reward_wallets(owner_id) values (actor) on conflict do nothing;
  select * into wallet from public.reward_wallets where owner_id = actor for update;
  if exists (select 1 from public.reward_profile_frame_inventory where owner_id = actor and frame_id = frame_id_input) then return public.load_reward_wallet(); end if;
  if wallet.balance < price_value then raise exception 'insufficient reward balance'; end if;
  insert into public.reward_profile_frame_inventory(owner_id, frame_id) values (actor, frame_id_input);
  update public.reward_wallets set balance = balance - price_value where owner_id = actor;
  insert into public.reward_ledger_entries(owner_id, idempotency_key, amount, kind, breakdown)
  values (actor, format('profile-frame-purchase:%s', frame_id_input), -price_value, 'profile_frame_purchase', jsonb_build_object('frameId', frame_id_input));
  return public.load_reward_wallet();
end;
$$;

create or replace function public.save_own_profile(profile_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); alias_input text; frame_id_input text; title_id_input text; current_level integer;
begin
  if profile_input is null or jsonb_typeof(profile_input) <> 'object'
    or not profile_input ?& array['alias', 'avatar_id', 'equipped_frame_id', 'equipped_title_id', 'categories', 'category_visibility', 'auto_share_completed_workouts', 'share_routine_template', 'share_mesocycle_template', 'share_performed_set_details', 'share_social_activity', 'share_social_progress', 'share_social_consistency', 'share_social_statistics', 'share_social_muscle_distribution']
    or exists (select 1 from jsonb_object_keys(profile_input) as keys(value) where keys.value <> all(array['alias', 'avatar_id', 'equipped_frame_id', 'equipped_title_id', 'categories', 'category_visibility', 'auto_share_completed_workouts', 'share_routine_template', 'share_mesocycle_template', 'share_performed_set_details', 'share_social_activity', 'share_social_progress', 'share_social_consistency', 'share_social_statistics', 'share_social_muscle_distribution']))
    or jsonb_typeof(profile_input -> 'alias') <> 'string' or jsonb_typeof(profile_input -> 'avatar_id') <> 'string'
    or jsonb_typeof(profile_input -> 'equipped_frame_id') <> 'string' or jsonb_typeof(profile_input -> 'equipped_title_id') not in ('string', 'null')
    or jsonb_typeof(profile_input -> 'categories') <> 'object' or jsonb_typeof(profile_input -> 'category_visibility') <> 'object'
    or exists (select 1 from unnest(array['auto_share_completed_workouts', 'share_routine_template', 'share_mesocycle_template', 'share_performed_set_details', 'share_social_activity', 'share_social_progress', 'share_social_consistency', 'share_social_statistics', 'share_social_muscle_distribution']) key where jsonb_typeof(profile_input -> key) <> 'boolean')
    or exists (select 1 from jsonb_each(profile_input -> 'categories') as entries(key, value) where jsonb_typeof(entries.value) <> 'string')
    or exists (select 1 from jsonb_each(profile_input -> 'category_visibility') as entries(key, value) where jsonb_typeof(entries.value) <> 'boolean') then raise exception 'invalid profile input'; end if;
  alias_input := trim(profile_input ->> 'alias'); frame_id_input := profile_input ->> 'equipped_frame_id'; title_id_input := profile_input ->> 'equipped_title_id';
  select coalesce(level, 1) into current_level from public.experience_progress where owner_id = actor;
  current_level := coalesce(current_level, 1);
  if char_length(alias_input) not between 3 and 320 then raise exception 'invalid profile alias'; end if;
  if (public.profile_frame_unlock_level(frame_id_input) is null or current_level < public.profile_frame_unlock_level(frame_id_input)) and not exists (select 1 from public.reward_profile_frame_inventory where owner_id = actor and frame_id = frame_id_input) then raise exception 'profile frame is not unlocked'; end if;
  if title_id_input is not null and (public.profile_title_unlock_level(title_id_input) is null or current_level < public.profile_title_unlock_level(title_id_input)) and not exists (select 1 from public.reward_profile_title_inventory where owner_id = actor and title_id = title_id_input) then raise exception 'profile title is not unlocked'; end if;
  perform private.ensure_actor_profile(actor);
  update public.profiles set alias = alias_input, avatar_id = profile_input ->> 'avatar_id', equipped_frame_id = frame_id_input, equipped_title_id = title_id_input, categories = profile_input -> 'categories', category_visibility = profile_input -> 'category_visibility', auto_share_completed_workouts = (profile_input ->> 'auto_share_completed_workouts')::boolean, share_routine_template = (profile_input ->> 'share_routine_template')::boolean, share_mesocycle_template = (profile_input ->> 'share_mesocycle_template')::boolean, share_performed_set_details = (profile_input ->> 'share_performed_set_details')::boolean, share_social_activity = (profile_input ->> 'share_social_activity')::boolean, share_social_progress = (profile_input ->> 'share_social_progress')::boolean, share_social_consistency = (profile_input ->> 'share_social_consistency')::boolean, share_social_statistics = (profile_input ->> 'share_social_statistics')::boolean, share_social_muscle_distribution = (profile_input ->> 'share_social_muscle_distribution')::boolean where id = actor;
end;
$$;

alter table public.reward_profile_frame_catalog enable row level security;
alter table public.reward_profile_frame_inventory enable row level security;
alter table public.reward_profile_title_inventory enable row level security;
revoke all on public.reward_profile_frame_catalog, public.reward_profile_frame_inventory, public.reward_profile_title_inventory from anon, authenticated;
revoke all on function public.purchase_reward_profile_frame(text) from public, anon;
grant execute on function public.purchase_reward_profile_frame(text) to authenticated;
