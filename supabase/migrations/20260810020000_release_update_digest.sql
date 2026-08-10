create table public.release_announcements (
  version text primary key,
  release_sequence integer not null unique check (release_sequence > 0),
  title text not null,
  message text not null,
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  fixes jsonb not null default '[]'::jsonb check (jsonb_typeof(fixes) = 'array'),
  reward_gems integer not null default 0 check (reward_gems >= 0 and reward_gems <= 1000),
  published_at timestamptz not null default now()
);

create table public.release_announcement_acknowledgements (
  owner_id uuid not null references auth.users(id) on delete cascade,
  version text not null references public.release_announcements(version) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (owner_id, version)
);

insert into public.release_announcements(version, release_sequence, title, message, features, fixes, reward_gems) values
  ('0.1.0', 1, 'Gracias por entrenar con GymBro', 'Esta versión marcó el comienzo de GymBro en etapa alfa.', '["Novedades de versión dentro de la app.", "Primer versionado público de GymBro."]', '[]', 0),
  ('0.2.0', 2, 'GymBro sigue creciendo con vos', 'Más visibilidad para tus mesociclos y tu progreso.', '["Seguimiento visual de mesociclos y adherencia semanal.", "Gráficos de evolución de carga por ejercicio.", "Más detalles en rutinas y publicaciones compartidas.", "Nuevos avatares, temas y privacidad."]', '["Corregimos el cálculo de tonelaje para cargas en libras.", "Mejoramos la confiabilidad de entrenamientos conjuntos e invitaciones."]', 50),
  ('0.3.0', 3, 'Más conexión, más motivación', 'La comunidad se volvió parte de cada entrenamiento.', '["Bandeja de notificaciones y accesos directos.", "Reacciones y comentarios en publicaciones.", "Entrenamientos compartidos e invitaciones en vivo.", "Avatares deportivos inspirados en fútbol y Argentina."]', '["Mejoramos la estabilidad del envío de notificaciones."]', 50),
  ('0.4.0', 4, 'Tu progreso tiene una nueva dimensión', 'GymBro sumó herramientas para entender tu progreso y entrenar en comunidad.', '["Onboarding privado con identidad, antropometrías y avatares.", "Radar muscular y gráficos animados.", "Análisis contra sesiones anteriores.", "Entrenamientos conjuntos con grupos e invitaciones en vivo.", "Feed de comunidad con hitos, récords y rachas."]', '["Mejoramos estabilidad en Android, recaps, perfiles y notificaciones."]', 100),
  ('0.4.1', 5, 'Gracias por ser Alfa User', 'Celebramos que estés construyendo GymBro con nosotros.', '["Marco exclusivo Alfa User.", "Título Alfa User para tu perfil."]', '[]', 150),
  ('0.5.0', 6, 'Entrená con intención y en equipo', 'Tu entrenamiento ahora comunica mejor el esfuerzo, el balance y el progreso compartido.', '["Objetivos de intensidad RIR y RPE por serie.", "Balance muscular ponderado con objetivo configurable.", "Radar que compara estímulo realizado contra tu objetivo.", "Progreso, descansos y estados en vivo en entrenamientos conjuntos."]', '["Mejoramos la precisión de la distribución muscular con participaciones ponderadas.", "Mejoramos la sincronización de borradores y progreso en entrenamientos conjuntos."]', 50);

insert into public.release_reward_campaigns(version, gem_amount, idempotency_key)
values ('0.5.0', 50, 'release:0.5.0:50-gems');

create function public.claim_pending_release_updates(max_release_sequence integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_actor();
  campaign_row record;
  did_claim boolean;
  claimed_any boolean := false;
begin
  if max_release_sequence is null or max_release_sequence < 1 then raise exception 'invalid release sequence'; end if;
  perform private.ensure_actor_profile(actor);
  insert into public.reward_wallets(owner_id) values (actor) on conflict do nothing;

  for campaign_row in
    select release_campaign.version, release_campaign.gem_amount, release_campaign.idempotency_key
    from public.release_reward_campaigns release_campaign
    join public.release_announcements announcement on announcement.version = release_campaign.version
    where announcement.release_sequence <= max_release_sequence
    order by announcement.release_sequence
  loop
    select public.reward_add_entry(
      actor,
      campaign_row.idempotency_key,
      campaign_row.gem_amount,
      'release_gift',
      null,
      jsonb_build_object('releaseVersion', campaign_row.version)
    ) into did_claim;
    claimed_any := claimed_any or did_claim;
  end loop;

  return jsonb_build_object(
    'claimed', claimed_any,
    'wallet', public.load_reward_wallet(),
    'releases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'version', announcement.version,
        'title', announcement.title,
        'message', announcement.message,
        'features', announcement.features,
        'fixes', announcement.fixes,
        'rewardGems', announcement.reward_gems,
        'rewardClaimed', announcement.reward_gems > 0
      ) order by announcement.release_sequence)
      from public.release_announcements announcement
      where announcement.release_sequence <= max_release_sequence and not exists (
        select 1 from public.release_announcement_acknowledgements acknowledgement
        where acknowledgement.owner_id = actor and acknowledgement.version = announcement.version
      )
    ), '[]'::jsonb)
  );
end;
$$;

create function public.acknowledge_release_updates(versions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := public.require_actor();
begin
  if versions is null or cardinality(versions) = 0 then return; end if;
  if exists (select 1 from unnest(versions) candidate(version) where candidate.version is null)
    or exists (select 1 from unnest(versions) candidate(version) where not exists (select 1 from public.release_announcements announcement where announcement.version = candidate.version)) then
    raise exception 'invalid release acknowledgement';
  end if;

  insert into public.release_announcement_acknowledgements(owner_id, version)
  select actor, candidate.version from unnest(versions) candidate(version)
  on conflict do nothing;
end;
$$;

alter table public.release_announcements enable row level security;
alter table public.release_announcement_acknowledgements enable row level security;
revoke all on public.release_announcements, public.release_announcement_acknowledgements from anon, authenticated;
revoke all on function public.claim_pending_release_updates(integer) from public, anon;
revoke all on function public.acknowledge_release_updates(text[]) from public, anon;
grant execute on function public.claim_pending_release_updates(integer) to authenticated;
grant execute on function public.acknowledge_release_updates(text[]) to authenticated;
