-- A rank activity must retain the cosmetics it unlocks, even after the athlete changes their equipped presentation.
create or replace function private.rank_unlock_presentation(rank_name text)
returns jsonb language sql immutable set search_path = '' as $$
  select case rank_name
    when 'Principiante' then jsonb_build_object('unlocked_frame_id', 'principiante', 'unlocked_title_id', 'principiante')
    when 'Intermedio' then jsonb_build_object('unlocked_frame_id', 'intermedio', 'unlocked_title_id', 'intermedio')
    when 'Avanzado' then jsonb_build_object('unlocked_frame_id', 'avanzado', 'unlocked_title_id', 'avanzado')
    when 'GymBro' then jsonb_build_object('unlocked_frame_id', 'gymbro', 'unlocked_title_id', 'gymbro')
    when 'GymRat' then jsonb_build_object('unlocked_frame_id', 'gymrat', 'unlocked_title_id', 'gymrat')
    when 'G-Boom' then jsonb_build_object('unlocked_frame_id', 'g-boom', 'unlocked_title_id', 'g-boom')
    when 'Alfa' then jsonb_build_object('unlocked_frame_id', 'alfa', 'unlocked_title_id', 'alfa')
    when 'Sigma' then jsonb_build_object('unlocked_frame_id', 'sigma', 'unlocked_title_id', 'sigma')
    else '{}'::jsonb
  end
$$;

update public.community_activities
set payload = payload || private.rank_unlock_presentation(payload ->> 'rank')
where kind = 'rank_up';

create or replace function private.capture_rank_unlock_presentation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'rank_up' then
    new.payload := new.payload || private.rank_unlock_presentation(new.payload ->> 'rank');
  end if;
  return new;
end;
$$;

drop trigger if exists community_activity_rank_unlock_presentation on public.community_activities;
create trigger community_activity_rank_unlock_presentation
before insert on public.community_activities
for each row execute function private.capture_rank_unlock_presentation();
