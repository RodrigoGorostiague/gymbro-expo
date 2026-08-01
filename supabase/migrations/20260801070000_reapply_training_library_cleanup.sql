create function public.sanitize_training_libraries()
returns void language sql security definer set search_path = '' as $$
  with sanitized as (
    select owner_id,
      public.sanitize_training_routines(routines) as routines,
      mesocycles
    from public.training_libraries
  )
  update public.training_libraries as library
  set routines = sanitized.routines,
      mesocycles = public.sanitize_training_mesocycles(sanitized.mesocycles, sanitized.routines)
  from sanitized
  where library.owner_id = sanitized.owner_id
    and (
      library.routines is distinct from sanitized.routines
      or library.mesocycles is distinct from public.sanitize_training_mesocycles(sanitized.mesocycles, sanitized.routines)
    )
$$;

select public.sanitize_training_libraries();

revoke all on function public.sanitize_training_libraries() from public, anon, authenticated;
