-- NoMoreNarrowRoom production-oriented starter schema
-- Core rule: the primary room-size metric shown to users is the minimum size of the cheapest/base room currently sold.

create table if not exists hotels (
  id bigserial primary key,
  slug text unique not null,
  name_ko text not null,
  name_en text,
  city text not null,
  area text,
  address text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  official_url text,
  ota_url text,
  status text not null default 'open',
  public_bath boolean,
  sauna boolean,
  laundry boolean,
  bath_toilet_separate boolean,
  station_walk_minutes integer,
  max_guests integer,
  price_band_krw integer,
  min_room_sqm numeric(6,2),
  min_room_name text,
  min_room_basis text not null default 'cheapest_current_base_room',
  min_room_verified_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists room_types (
  id bigserial primary key,
  hotel_id bigint not null references hotels(id) on delete cascade,
  room_name text not null,
  room_name_ko text,
  sqm numeric(6,2),
  min_guests integer,
  max_guests integer,
  bed_type text,
  bath_toilet_separate boolean,
  is_base_room boolean not null default false,
  usually_cheapest boolean not null default false,
  official_room_url text,
  verified_at timestamptz,
  unique(hotel_id, room_name)
);

create table if not exists source_records (
  id bigserial primary key,
  hotel_id bigint references hotels(id) on delete cascade,
  room_type_id bigint references room_types(id) on delete cascade,
  source_type text not null,
  source_url text,
  source_title text,
  observed_value text,
  observed_at timestamptz not null default now(),
  notes text
);

create table if not exists popularity_signals (
  id bigserial primary key,
  hotel_id bigint not null references hotels(id) on delete cascade,
  source_name text not null,
  signal_date date not null,
  mention_count integer not null default 0,
  unique_authors integer,
  review_count integer,
  recommendation_count integer,
  recency_weight numeric(6,3),
  raw_score numeric(10,3),
  notes text,
  unique(hotel_id, source_name, signal_date)
);

create index if not exists idx_hotels_city_area on hotels(city, area);
create index if not exists idx_hotels_min_room_sqm on hotels(min_room_sqm);
create index if not exists idx_hotels_public_bath on hotels(public_bath);
create index if not exists idx_room_types_hotel_sqm on room_types(hotel_id, sqm);
create index if not exists idx_popularity_hotel_date on popularity_signals(hotel_id, signal_date desc);

-- Recalculate each hotel's minimum room size from room-type data.
-- In production, only currently sold base-room inventory should be eligible.
create or replace view hotel_room_minimums as
select
  h.id as hotel_id,
  h.slug,
  min(rt.sqm) filter (where rt.usually_cheapest = true and rt.sqm is not null) as cheapest_room_min_sqm,
  min(rt.sqm) filter (where rt.is_base_room = true and rt.sqm is not null) as base_room_min_sqm,
  min(rt.sqm) filter (where rt.sqm is not null) as all_room_min_sqm
from hotels h
left join room_types rt on rt.hotel_id = h.id
group by h.id, h.slug;
