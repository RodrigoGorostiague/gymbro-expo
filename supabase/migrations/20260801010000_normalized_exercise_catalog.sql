-- Curated catalog imported only by the development reset tool. Client callers
-- receive read-only projections through the RPCs below.
create table public.muscle_groups (
  id text primary key check (id ~ '^GM-[0-9]{3}$'),
  name text not null check (btrim(name) <> ''),
  type text not null check (btrim(type) <> ''),
  level integer not null check (level >= 0),
  visible_in_filters boolean not null,
  display_name text not null check (btrim(display_name) <> ''),
  path text not null check (btrim(path) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id text primary key check (id ~ '^EX-[0-9]{4}$'),
  canonical_name text not null check (btrim(canonical_name) <> ''),
  movement_pattern text,
  primary_muscle_label text,
  secondary_muscle_labels text,
  equipment text,
  angle_or_plane text,
  laterality text,
  body_position text,
  support_type text,
  grip text,
  trajectory_or_modality text,
  kinetic_chain text,
  technical_level text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.muscle_group_relations (
  id text primary key check (id ~ '^RG-[0-9]{4}$'),
  parent_muscle_group_id text not null references public.muscle_groups(id) on delete restrict,
  child_muscle_group_id text not null references public.muscle_groups(id) on delete restrict,
  relation_type text not null check (btrim(relation_type) <> ''),
  notes text,
  created_at timestamptz not null default now(),
  unique (parent_muscle_group_id, child_muscle_group_id, relation_type),
  check (parent_muscle_group_id <> child_muscle_group_id)
);

create table public.exercise_muscle_groups (
  id text primary key check (id ~ '^EM-[0-9]{5}$'),
  exercise_id text not null references public.exercises(id) on delete cascade,
  muscle_group_id text not null references public.muscle_groups(id) on delete restrict,
  role text not null check (role in ('Principal', 'Secundario')),
  relevance numeric(4, 3) not null check (relevance between 0.000 and 1.000),
  original_label text not null check (btrim(original_label) <> ''),
  source_origin text not null check (btrim(source_origin) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exercise_id, muscle_group_id, role)
);

create index exercises_canonical_name_idx on public.exercises (canonical_name);
create index exercises_movement_pattern_idx on public.exercises (movement_pattern);
create index muscle_groups_name_idx on public.muscle_groups (name);
create index muscle_groups_visible_in_filters_idx on public.muscle_groups (visible_in_filters);
create index muscle_group_relations_parent_idx on public.muscle_group_relations (parent_muscle_group_id);
create index muscle_group_relations_child_idx on public.muscle_group_relations (child_muscle_group_id);
create index muscle_group_relations_parent_child_idx on public.muscle_group_relations (parent_muscle_group_id, child_muscle_group_id);
create index exercise_muscle_groups_exercise_idx on public.exercise_muscle_groups (exercise_id);
create index exercise_muscle_groups_muscle_idx on public.exercise_muscle_groups (muscle_group_id);
create index exercise_muscle_groups_role_idx on public.exercise_muscle_groups (role);
create index exercise_muscle_groups_relevance_idx on public.exercise_muscle_groups (relevance desc);
create index exercise_muscle_groups_filter_idx on public.exercise_muscle_groups (muscle_group_id, role, relevance desc);

create trigger muscle_groups_updated_at before update on public.muscle_groups
for each row execute function public.touch_updated_at();
create trigger exercises_updated_at before update on public.exercises
for each row execute function public.touch_updated_at();
create trigger exercise_muscle_groups_updated_at before update on public.exercise_muscle_groups
for each row execute function public.touch_updated_at();

create function public.prevent_muscle_group_relation_cycle()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_muscle_group_id = new.child_muscle_group_id then
    raise exception 'muscle group relations cannot reference themselves';
  end if;

  if exists (
    with recursive descendants(id) as (
      select relation.child_muscle_group_id
      from public.muscle_group_relations as relation
      where relation.parent_muscle_group_id = new.child_muscle_group_id
        and (tg_op = 'INSERT' or relation.id <> old.id)
      union
      select relation.child_muscle_group_id
      from public.muscle_group_relations as relation
      join descendants on descendants.id = relation.parent_muscle_group_id
      where tg_op = 'INSERT' or relation.id <> old.id
    )
    select 1 from descendants where id = new.parent_muscle_group_id
  ) then
    raise exception 'muscle group relation would create a cycle';
  end if;
  return new;
end;
$$;

create trigger muscle_group_relations_prevent_cycles
before insert or update of parent_muscle_group_id, child_muscle_group_id on public.muscle_group_relations
for each row execute function public.prevent_muscle_group_relation_cycle();

create function public.list_catalog_muscle_groups()
returns table (
  id text,
  name text,
  type text,
  level integer,
  visible_in_filters boolean,
  display_name text,
  path text
)
language sql stable security definer set search_path = '' as $$
  select group_item.id, group_item.name, group_item.type, group_item.level,
    group_item.visible_in_filters, group_item.display_name, group_item.path
  from public.muscle_groups as group_item
  order by group_item.path, group_item.name, group_item.id
$$;

create function public.list_catalog_exercises_by_muscle_group(
  selected_group_id text,
  participation_mode text default 'all_roles'
)
returns table (
  exercise_id text,
  canonical_name text,
  movement_pattern text,
  equipment text,
  matched_muscle_group_id text,
  matched_muscle_name text,
  selected_parent_id text,
  role text,
  relevance numeric(4, 3),
  path text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if participation_mode not in ('primary_only', 'primary_and_secondary', 'all_roles') then
    raise exception 'invalid participation mode';
  end if;

  return query
  with recursive descendants(id) as (
    select selected_group_id
    union
    select relation.child_muscle_group_id
    from public.muscle_group_relations as relation
    join descendants on descendants.id = relation.parent_muscle_group_id
  ), matches as (
    select distinct on (association.exercise_id)
      association.exercise_id,
      exercise.canonical_name,
      exercise.movement_pattern,
      exercise.equipment,
      association.muscle_group_id,
      muscle.name,
      selected_group_id,
      association.role,
      association.relevance,
      muscle.path
    from public.exercise_muscle_groups as association
    join descendants on descendants.id = association.muscle_group_id
    join public.exercises as exercise on exercise.id = association.exercise_id
    join public.muscle_groups as muscle on muscle.id = association.muscle_group_id
    where participation_mode = 'all_roles'
      or (participation_mode = 'primary_only' and association.role = 'Principal')
      or (participation_mode = 'primary_and_secondary' and association.role in ('Principal', 'Secundario'))
    order by association.exercise_id, association.relevance desc, muscle.path, association.muscle_group_id
  )
  select matches.exercise_id, matches.canonical_name, matches.movement_pattern,
    matches.equipment, matches.muscle_group_id, matches.name, matches.selected_group_id,
    matches.role, matches.relevance, matches.path
  from matches
  order by matches.relevance desc, matches.canonical_name, matches.exercise_id;
end;
$$;

create function public.catalog_integrity_report()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exercises', (select count(*) from public.exercises),
    'muscle_groups', (select count(*) from public.muscle_groups),
    'muscle_group_relations', (select count(*) from public.muscle_group_relations),
    'exercise_muscle_groups', (select count(*) from public.exercise_muscle_groups),
    'exercises_without_primary', (select count(*) from public.exercises as exercise where not exists (
      select 1 from public.exercise_muscle_groups as association where association.exercise_id = exercise.id and association.role = 'Principal'
    )),
    'exercises_without_muscles', (select count(*) from public.exercises as exercise where not exists (
      select 1 from public.exercise_muscle_groups as association where association.exercise_id = exercise.id
    )),
    'groups_without_parent', (select count(*) from public.muscle_groups as group_item where not exists (
      select 1 from public.muscle_group_relations as relation where relation.child_muscle_group_id = group_item.id
    )),
    'groups_without_children', (select count(*) from public.muscle_groups as group_item where not exists (
      select 1 from public.muscle_group_relations as relation where relation.parent_muscle_group_id = group_item.id
    ))
  )
$$;

alter table public.exercises enable row level security;
alter table public.muscle_groups enable row level security;
alter table public.muscle_group_relations enable row level security;
alter table public.exercise_muscle_groups enable row level security;

revoke all on public.exercises, public.muscle_groups, public.muscle_group_relations, public.exercise_muscle_groups from anon, authenticated;
revoke all on function public.list_catalog_muscle_groups(), public.list_catalog_exercises_by_muscle_group(text, text), public.catalog_integrity_report() from public, anon;
grant execute on function public.list_catalog_muscle_groups(), public.list_catalog_exercises_by_muscle_group(text, text), public.catalog_integrity_report() to authenticated;
