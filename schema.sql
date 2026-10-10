-- =====================================================================
-- Система за пътни листа: схема на базата данни (Supabase / PostgreSQL)
-- Изпълнява се веднъж: Supabase → SQL Editor → New query → Run
-- =====================================================================

-- ---------- Регистри ----------

-- Данни за фирмата (винаги един ред, id = 1)
create table company (
  id      int  primary key default 1 check (id = 1),
  name    text not null,
  eik     text not null,
  address text not null,
  mol     text not null
);

create table vehicles (
  id               bigint generated always as identity primary key,
  make             text not null,
  model            text not null,
  reg_number       text not null unique,
  fuel_type        text not null,
  consumption_l100 numeric(5,2) not null check (consumption_l100 > 0),
  start_odometer   integer not null check (start_odometer >= 0),
  created_at       timestamptz not null default now()
);

create table drivers (
  id         bigint generated always as identity primary key,
  full_name  text not null,
  position   text,
  created_at timestamptz not null default now()
);

-- Дестинации: клиенти, обекти, доставчици. Точно една е базата (офисът).
create table destinations (
  id         bigint generated always as identity primary key,
  name       text not null,
  address    text not null,
  purpose    text,                       -- цел по подразбиране, напр. "Среща с клиент"
  lat        double precision,
  lon        double precision,
  is_base    boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index destinations_one_base on destinations (is_base) where is_base;

-- Таблица с разстояния (от OpenStreetMap/OSRM или въведени ръчно)
create table distances (
  from_id bigint not null references destinations(id) on delete cascade,
  to_id   bigint not null references destinations(id) on delete cascade,
  km      numeric(7,1) not null check (km > 0),
  source  text not null default 'osrm' check (source in ('osrm', 'manual', 'estimate')),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);

-- ---------- Пътни листа ----------

create table waybills (
  id               bigint generated always as identity primary key,
  number           integer unique,                 -- празно, докато е чернова
  status           text not null default 'draft' check (status in ('draft', 'issued')),
  vehicle_id       bigint not null references vehicles(id),
  driver_id        bigint not null references drivers(id),
  period_from      date not null,
  period_to        date not null,
  start_odometer   integer not null check (start_odometer >= 0),
  requested_km     integer not null check (requested_km > 0),  -- въведените от потребителя км
  end_odometer     integer,                        -- реален край = начало + сума на маршрутите
  consumption_l100 numeric(5,2) not null,          -- нормата към момента на издаване
  issue_date       date,
  created_at       timestamptz not null default now(),
  check (period_to >= period_from),
  check (end_odometer is null or end_odometer >= start_odometer),
  check ((status = 'issued') = (number is not null))
);

create table trips (
  id             bigint generated always as identity primary key,
  waybill_id     bigint not null references waybills(id) on delete cascade,
  seq            integer not null,               -- пореден ред в листа
  trip_date      date not null,
  route          text not null,                  -- "Офис – Клиент А – Клиент Б – Офис"
  purpose        text not null,
  km             integer not null check (km > 0),
  start_odometer integer not null,
  end_odometer   integer not null,
  is_personal    boolean not null default false, -- лично ползване се отчита отделно
  unique (waybill_id, seq),
  check (end_odometer = start_odometer + km)
);

create table refuelings (
  id             bigint generated always as identity primary key,
  waybill_id     bigint not null references waybills(id) on delete cascade,
  refuel_date    date not null,
  liters         numeric(6,2) not null check (liters > 0),
  invoice_number text
);

-- ---------- Поредна номерация без пропуски ----------

-- Брояч с един ред. Номерът се взима само при издаване, в една транзакция.
-- (Обикновена sequence в PostgreSQL може да "изгуби" номер при грешка,
--  затова не я използваме.)
create table waybill_counter (
  id          int primary key default 1 check (id = 1),
  last_number integer not null default 0
);
insert into waybill_counter (id, last_number) values (1, 0);

create or replace function issue_waybill(p_waybill_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wb       waybills%rowtype;
  v_sum      integer;
  v_prev_end integer;
  v_veh_odo  integer;
  v_number   integer;
begin
  select * into v_wb from waybills where id = p_waybill_id for update;
  if not found then
    raise exception 'Пътният лист не съществува';
  end if;
  if v_wb.status = 'issued' then
    raise exception 'Пътният лист вече е издаден с № %', v_wb.number;
  end if;

  -- 1) Има маршрути и сумата им е в толеранса ±1 км
  select coalesce(sum(km), 0) into v_sum from trips where waybill_id = p_waybill_id;
  if v_sum = 0 then
    raise exception 'Пътният лист няма маршрути';
  end if;
  if abs(v_sum - v_wb.requested_km) > 1 then
    raise exception 'Сумата на маршрутите (% км) се различава от въведените (% км) с повече от 1 км',
      v_sum, v_wb.requested_km;
  end if;
  if v_wb.end_odometer is distinct from v_wb.start_odometer + v_sum then
    raise exception 'Крайният километраж не съвпада със сумата на маршрутите';
  end if;

  -- 2) Свързан километраж: започваме точно откъдето е свършил предишният лист
  select end_odometer into v_prev_end
    from waybills
   where vehicle_id = v_wb.vehicle_id and status = 'issued'
   order by period_to desc, number desc
   limit 1;
  if v_prev_end is null then
    select start_odometer into v_veh_odo from vehicles where id = v_wb.vehicle_id;
    if v_wb.start_odometer <> v_veh_odo then
      raise exception 'Първият лист трябва да започва от началния километраж на автомобила (%)', v_veh_odo;
    end if;
  elsif v_wb.start_odometer <> v_prev_end then
    raise exception 'Началният километраж (%) не съвпада с крайния на предходния лист (%)',
      v_wb.start_odometer, v_prev_end;
  end if;

  -- 3) Без застъпващи се периоди за същия автомобил
  if exists (
    select 1 from waybills
     where vehicle_id = v_wb.vehicle_id and status = 'issued'
       and period_from <= v_wb.period_to and period_to >= v_wb.period_from
  ) then
    raise exception 'За този автомобил вече има издаден лист в този период';
  end if;

  -- 4) Следващ номер. Редът на брояча се заключва, така двама потребители
  --    едновременно не могат да получат един и същ номер.
  update waybill_counter set last_number = last_number + 1
   where id = 1
   returning last_number into v_number;

  update waybills
     set number = v_number, status = 'issued', issue_date = current_date
   where id = p_waybill_id;

  return v_number;
end;
$$;

-- ---------- Издаден лист не може да се променя или изтрива ----------

create or replace function protect_issued_waybill()
returns trigger language plpgsql as $$
begin
  if old.status = 'issued' then
    raise exception 'Издаден пътен лист (№ %) не може да се променя или изтрива', old.number;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger waybills_protect
  before update or delete on waybills
  for each row execute function protect_issued_waybill();

create or replace function protect_issued_children()
returns trigger language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status from waybills
   where id = coalesce(new.waybill_id, old.waybill_id);
  if v_status = 'issued' then
    raise exception 'Пътният лист е издаден; маршрутите и зарежданията му не могат да се променят';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger trips_protect
  before insert or update or delete on trips
  for each row execute function protect_issued_children();

create trigger refuelings_protect
  before insert or update or delete on refuelings
  for each row execute function protect_issued_children();

-- ---------- Достъп: само влезли потребители ----------

alter table company         enable row level security;
alter table vehicles        enable row level security;
alter table drivers         enable row level security;
alter table destinations    enable row level security;
alter table distances       enable row level security;
alter table waybills        enable row level security;
alter table trips           enable row level security;
alter table refuelings      enable row level security;
alter table waybill_counter enable row level security;  -- без политика: само през issue_waybill

create policy "auth_all" on company      for all to authenticated using (true) with check (true);
create policy "auth_all" on vehicles     for all to authenticated using (true) with check (true);
create policy "auth_all" on drivers      for all to authenticated using (true) with check (true);
create policy "auth_all" on destinations for all to authenticated using (true) with check (true);
create policy "auth_all" on distances    for all to authenticated using (true) with check (true);
create policy "auth_all" on waybills     for all to authenticated using (true) with check (true);
create policy "auth_all" on trips        for all to authenticated using (true) with check (true);
create policy "auth_all" on refuelings   for all to authenticated using (true) with check (true);

revoke execute on function issue_waybill(bigint) from public;
grant  execute on function issue_waybill(bigint) to authenticated;
