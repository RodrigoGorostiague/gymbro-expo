-- Keep the persisted profile catalog aligned with the bundled avatar assets.
alter table public.profiles drop constraint profiles_avatar_id_check;
alter table public.profiles add constraint profiles_avatar_id_check
  check (avatar_id in (
    'capybara-athlete',
    'capybara-mark',
    'capigirl',
    'capigirl-ponytail',
    'capigirl-braid',
    'capigirl-bob',
    'capigirl-bun',
    'capybro-spiky',
    'capybro-quiff',
    'capybro-topknot',
    'capybro-cropped'
  ));

alter table public.public_profiles drop constraint public_profiles_avatar_id_check;
alter table public.public_profiles add constraint public_profiles_avatar_id_check
  check (avatar_id in (
    'capybara-athlete',
    'capybara-mark',
    'capigirl',
    'capigirl-ponytail',
    'capigirl-braid',
    'capigirl-bob',
    'capigirl-bun',
    'capybro-spiky',
    'capybro-quiff',
    'capybro-topknot',
    'capybro-cropped'
  ));
