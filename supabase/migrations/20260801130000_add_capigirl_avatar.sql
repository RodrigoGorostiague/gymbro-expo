alter table public.profiles drop constraint profiles_avatar_id_check;
alter table public.profiles add constraint profiles_avatar_id_check
  check (avatar_id in ('capybara-athlete', 'capybara-mark', 'capigirl'));

alter table public.public_profiles drop constraint public_profiles_avatar_id_check;
alter table public.public_profiles add constraint public_profiles_avatar_id_check
  check (avatar_id in ('capybara-athlete', 'capybara-mark', 'capigirl'));
