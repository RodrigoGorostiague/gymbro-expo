create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  metric_type text not null check (metric_type in ('body_weight')),
  value numeric(8, 3) not null check (value > 0),
  unit text not null check (unit = 'kg'),
  measured_at timestamptz not null,
  source text not null check (source = 'manual'),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

create index body_metrics_owner_type_measured_at_idx
  on public.body_metrics (owner_id, metric_type, measured_at desc);

alter table public.body_metrics enable row level security;
revoke all on public.body_metrics from anon, authenticated;

create function public.list_body_metrics()
returns table (
  id uuid,
  metric_type text,
  value numeric,
  unit text,
  measured_at timestamptz,
  source text,
  notes text
) language sql stable security definer set search_path = '' as $$
  select metric.id, metric.metric_type, metric.value, metric.unit, metric.measured_at, metric.source, metric.notes
  from public.body_metrics as metric
  where metric.owner_id = public.require_actor()
  order by metric.measured_at desc, metric.created_at desc
$$;

create function public.record_body_metric(
  metric_type_input text,
  value_input numeric,
  unit_input text,
  measured_at_input timestamptz,
  notes_input text default null
)
returns table (
  id uuid,
  metric_type text,
  value numeric,
  unit text,
  measured_at timestamptz,
  source text,
  notes text
) language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
  if metric_type_input <> 'body_weight' or unit_input <> 'kg'
    or value_input is null or value_input <= 0 or measured_at_input is null then
    raise exception 'invalid body metric input';
  end if;

  return query
  insert into public.body_metrics(owner_id, metric_type, value, unit, measured_at, source, notes)
  values (actor, metric_type_input, value_input, unit_input, measured_at_input, 'manual', nullif(btrim(notes_input), ''))
  returning body_metrics.id, body_metrics.metric_type, body_metrics.value, body_metrics.unit,
    body_metrics.measured_at, body_metrics.source, body_metrics.notes;
end;
$$;

revoke all on function public.list_body_metrics(), public.record_body_metric(text, numeric, text, timestamptz, text) from public, anon;
grant execute on function public.list_body_metrics(), public.record_body_metric(text, numeric, text, timestamptz, text) to authenticated;
