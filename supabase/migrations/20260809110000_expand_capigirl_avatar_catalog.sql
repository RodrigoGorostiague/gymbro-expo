-- Keep persisted avatar identifiers aligned with the nine unique supplied Capigirl variants.
alter table public.profiles drop constraint profiles_avatar_id_check;
alter table public.profiles add constraint profiles_avatar_id_check
  check (avatar_id in (
    'capybara-athlete', 'capybara-mark', 'capigirl', 'capigirl-ponytail',
    'capigirl-braid', 'capigirl-bob', 'capigirl-bun', 'capybro-spiky',
    'capybro-quiff', 'capybro-topknot', 'capybro-cropped', 'capybro-river-tattoo',
    'capybro-beanie-headphones', 'capybro-cap-headphones', 'capybro-cap-tank',
    'capybro-beanie-tank', 'capybro-red-visor', 'capybro-argentina-beanie',
    'capybro-argentina-visor', 'capybro-boca', 'capybro-river', 'capybro-argentina',
    'capigirl-pink-squat', 'capigirl-purple-deadlift', 'capigirl-blue-squat',
    'capigirl-black-pink-deadlift', 'capigirl-pink-jacket-deadlift',
    'capigirl-black-dumbbell', 'capigirl-pink-dumbbell', 'capigirl-purple-tee',
    'capigirl-purple-sport'
  ));

alter table public.public_profiles drop constraint public_profiles_avatar_id_check;
alter table public.public_profiles add constraint public_profiles_avatar_id_check
  check (avatar_id in (
    'capybara-athlete', 'capybara-mark', 'capigirl', 'capigirl-ponytail',
    'capigirl-braid', 'capigirl-bob', 'capigirl-bun', 'capybro-spiky',
    'capybro-quiff', 'capybro-topknot', 'capybro-cropped', 'capybro-river-tattoo',
    'capybro-beanie-headphones', 'capybro-cap-headphones', 'capybro-cap-tank',
    'capybro-beanie-tank', 'capybro-red-visor', 'capybro-argentina-beanie',
    'capybro-argentina-visor', 'capybro-boca', 'capybro-river', 'capybro-argentina',
    'capigirl-pink-squat', 'capigirl-purple-deadlift', 'capigirl-blue-squat',
    'capigirl-black-pink-deadlift', 'capigirl-pink-jacket-deadlift',
    'capigirl-black-dumbbell', 'capigirl-pink-dumbbell', 'capigirl-purple-tee',
    'capigirl-purple-sport'
  ));
