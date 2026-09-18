create table public.training_libraries (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  routines jsonb not null default '[]'::jsonb check (jsonb_typeof(routines) = 'array'),
  mesocycles jsonb not null default '[]'::jsonb check (jsonb_typeof(mesocycles) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger training_libraries_updated_at before update on public.training_libraries
for each row execute function public.touch_updated_at();

create function public.load_training_library()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('routines', library.routines, 'mesocycles', library.mesocycles)
  from public.training_libraries as library
  where library.owner_id = public.require_actor()
  union all
  select jsonb_build_object('routines', '[]'::jsonb, 'mesocycles', '[]'::jsonb)
  where not exists (select 1 from public.training_libraries where owner_id = public.require_actor())
  limit 1
$$;

create function public.save_training_library(routines_input jsonb default null, mesocycles_input jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  if (routines_input is not null and jsonb_typeof(routines_input) <> 'array')
    or (mesocycles_input is not null and jsonb_typeof(mesocycles_input) <> 'array') then
    raise exception 'invalid training library input';
  end if;

  insert into public.training_libraries (owner_id, routines, mesocycles)
  values (actor, coalesce(routines_input, '[]'::jsonb), coalesce(mesocycles_input, '[]'::jsonb))
  on conflict (owner_id) do update set
    routines = coalesce(routines_input, public.training_libraries.routines),
    mesocycles = coalesce(mesocycles_input, public.training_libraries.mesocycles),
    updated_at = now();
end;
$$;

alter table public.training_libraries enable row level security;
revoke all on public.training_libraries from anon, authenticated;
revoke all on function public.load_training_library(), public.save_training_library(jsonb, jsonb) from public, anon;
grant execute on function public.load_training_library(), public.save_training_library(jsonb, jsonb) to authenticated;
