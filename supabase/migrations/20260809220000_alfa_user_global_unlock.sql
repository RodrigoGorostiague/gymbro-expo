-- Alfa User cosmetics are globally available during the alpha; Alfa legacy remains level-gated.
create or replace function public.profile_frame_unlock_level(frame_id_input text)
returns integer language sql immutable set search_path = '' as $$
  select case frame_id_input
    when 'principiante' then 1
    when 'intermedio' then 5
    when 'avanzado' then 10
    when 'gymbro' then 20
    when 'gymrat' then 35
    when 'g-boom' then 50
    when 'alfa' then 70
    when 'alfa-user' then 1
    when 'sigma' then 85
    else null
  end
$$;

create or replace function public.profile_title_unlock_level(title_id_input text)
returns integer language sql immutable set search_path = '' as $$
  select case title_id_input
    when 'principiante' then 1
    when 'intermedio' then 5
    when 'avanzado' then 10
    when 'gymbro' then 20
    when 'gymrat' then 35
    when 'g-boom' then 50
    when 'alfa' then 70
    when 'alfa-user' then 1
    when 'sigma' then 85
    else null
  end
$$;

revoke all on function public.profile_title_unlock_level(text) from public, anon, authenticated;
revoke all on function public.profile_frame_unlock_level(text) from public, anon, authenticated;
