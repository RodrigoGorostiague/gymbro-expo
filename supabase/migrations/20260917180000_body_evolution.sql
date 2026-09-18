-- Existing rows stay untouched. Daily entries use a stable, explicit calendar key.
alter table public.body_metrics add column if not exists record_day date;
create unique index body_metrics_daily_type_idx on public.body_metrics(owner_id, record_day, metric_type) where record_day is not null;

create function public.save_body_day(day_input date, timezone_input text, measurements_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor(); item jsonb; kind text; amount numeric; units text;
begin
  if timezone_input is null or not exists(select 1 from pg_timezone_names where name = timezone_input)
    or day_input is null then raise exception 'Invalid calendar'; end if;
  if day_input <> (now() at time zone timezone_input)::date then raise exception 'Only today can be updated'; end if;
  if jsonb_typeof(measurements_input) is distinct from 'array' or jsonb_array_length(measurements_input) not between 1 and 12 then raise exception 'Invalid measurements'; end if;
  for item in select * from jsonb_array_elements(measurements_input) loop
    kind := item->>'metricType'; amount := (item->>'value')::numeric;
    if kind is null or kind not in ('body_weight','height','neck','shoulders','chest','waist','hips','biceps_relaxed','biceps_flexed','forearm','thigh','calf')
      or amount is null or amount <= 0 or amount >= 100000 or amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid measurement'; end if;
    units := case when kind = 'body_weight' then 'kg' else 'cm' end;
    insert into public.body_metrics(owner_id, metric_type, value, unit, measured_at, source, record_day)
    values(actor, kind, amount, units, now(), 'manual', day_input)
    on conflict (owner_id, record_day, metric_type) where record_day is not null
    do update set value = excluded.value, measured_at = excluded.measured_at;
  end loop;
end;
$$;

create function public.list_body_evolution()
returns table(id uuid, metric_type text, value numeric, unit text, measured_at timestamptz, source text, notes text, record_day date)
language sql stable security definer set search_path = '' as $$
 select m.id, m.metric_type, m.value, m.unit, m.measured_at, m.source, m.notes, m.record_day
 from public.body_metrics m where m.owner_id = public.require_actor() order by m.measured_at desc, m.id;
$$;

create function public.delete_body_measurements(ids_input uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_actor();
begin
 delete from public.body_metrics where owner_id = actor and id = any(ids_input);
end;
$$;
revoke all on function public.save_body_day(date,text,jsonb), public.list_body_evolution(), public.delete_body_measurements(uuid[]) from public, anon;
grant execute on function public.save_body_day(date,text,jsonb), public.list_body_evolution(), public.delete_body_measurements(uuid[]) to authenticated;
