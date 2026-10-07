-- ===========================================================================
-- Tartame — the whole schema, as it stands after every migration.
--
-- A fresh database gets this file once (Supabase SQL editor, or the connector)
-- and then supabase/seed.sql. Later changes arrive as files in
-- supabase/migrations/ and as entries in src/server/services/schema-updates.ts,
-- which the owner applies from Ajustes → Base de datos. tests/schema.test.ts
-- checks that the three describe the same database.
--
-- The app connects to Postgres directly as the database owner. Supabase's
-- REST API (PostgREST, reachable with the public anon key) is never used, so
-- it gets nothing: row-level security on every table with no policies, and
-- every grant to `anon` and `authenticated` revoked (last block).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The team: panel accounts, sessions, the activity log, rate limits
-- ---------------------------------------------------------------------------

create table if not exists public.admin_users (
  id                   bigint generated always as identity primary key,
  email                text        not null,
  password_hash        text        not null,
  display_name         text        not null,
  role                 text        not null default 'staff' check (role in ('owner', 'staff')),
  is_active            boolean     not null default true,
  must_change_password boolean     not null default false,
  failed_attempts      integer     not null default 0,
  locked_until         timestamptz,
  last_login_at        timestamptz,
  password_changed_at  timestamptz,
  totp_secret          text,
  totp_enabled_at      timestamptz,
  totp_last_step       bigint,
  created_at           timestamptz not null default now()
);
create unique index if not exists admin_users_email_idx on public.admin_users (lower(email));

create table if not exists public.sessions (
  id           bigint generated always as identity primary key,
  user_id      bigint      not null references public.admin_users(id) on delete cascade,
  token_hash   text        not null unique,
  csrf_hash    text        not null,
  ip_hash      text,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index if not exists sessions_user_idx on public.sessions (user_id);

-- Append-only: the app has no update or delete for it, only the retention sweep.
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    bigint      references public.admin_users(id) on delete set null,
  actor_email text,
  action      text        not null,
  target      text,
  detail      text,
  ip_hash     text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_target_idx on public.audit_log (target) where target is not null;
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);

create table if not exists public.rate_limits (
  bucket_key   text    not null,
  window_start bigint  not null,
  hits         integer not null default 0,
  primary key (bucket_key, window_start)
);

-- ---------------------------------------------------------------------------
-- Settings: one row
-- ---------------------------------------------------------------------------

create table if not exists public.settings (
  id               smallint    primary key default 1 check (id = 1),
  orders_enabled   boolean     not null default true,
  min_notice_days  smallint    not null default 1 check (min_notice_days between 0 and 30),
  max_days_ahead   smallint    not null default 365 check (max_days_ahead between 7 and 730),
  closed_weekdays  smallint[]  not null default '{}',
  whatsapp_number  text,
  updated_at       timestamptz not null default now(),
  -- Tartame's own details: on every invoice and on the legal pages (Ajustes).
  legal_name        text,
  tax_id            text,
  legal_address     text,
  legal_postal_code text,
  legal_city        text,
  legal_email       text,
  legal_registry    text,
  -- The VAT rate of the cakes, in basis points (1000 = 10 %): the owner's
  -- (or their accountant's) figure. No invoice is issued until it is set.
  vat_rate_bp       integer check (vat_rate_bp between 0 and 10000),
  -- Printed at the foot of invoices paid by transfer (bank account, terms).
  invoice_note      text
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Partner bakeries, the zones they deliver to, and their menus
-- ---------------------------------------------------------------------------

create table if not exists public.bakeries (
  id            bigint generated always as identity primary key,
  slug          text        not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text        not null,
  city          text        not null,
  address       text,
  contact_name  text,
  phone         text,
  whatsapp      text,
  email         text,
  prints_photos boolean     not null default false,
  active        boolean     not null default true,
  -- What each size means at this bakery ("Ø 18 cm"), shown under the price.
  size_notes    jsonb       not null default '{}'::jsonb,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- A zone is a set of postcodes one bakery delivers to, at one delivery price.
-- The app refuses to let two active zones share a postcode, so a postcode
-- always names exactly one bakery.
create table if not exists public.zones (
  id             bigint generated always as identity primary key,
  bakery_id      bigint      not null references public.bakeries(id) on delete restrict,
  name           text        not null,
  city           text        not null,
  postal_codes   text[]      not null default '{}',
  delivery_cents integer     not null check (delivery_cents between 0 and 20000),
  active         boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists zones_bakery_idx on public.zones (bakery_id);

create table if not exists public.cakes (
  id                  bigint generated always as identity primary key,
  bakery_id           bigint      not null references public.bakeries(id) on delete cascade,
  name                text        not null,
  description         text,
  -- A file under public/cakes/, e.g. /cakes/lotus.jpg.
  photo               text        check (photo is null or photo ~ '^/cakes/[a-z0-9-]+\.(jpg|png|webp)$'),
  price_pequena_cents integer     check (price_pequena_cents is null or price_pequena_cents between 0 and 100000),
  price_mediana_cents integer     check (price_mediana_cents is null or price_mediana_cents between 0 and 100000),
  price_grande_cents  integer     check (price_grande_cents is null or price_grande_cents between 0 and 100000),
  active              boolean     not null default true,
  sort_order          integer     not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (price_pequena_cents is not null or price_mediana_cents is not null or price_grande_cents is not null)
);
create unique index if not exists cakes_bakery_name_idx on public.cakes (bakery_id, lower(name));

-- ---------------------------------------------------------------------------
-- Companies: who pays for automatic birthdays (and, later, company accounts,
-- campaigns and volume pricing).
-- ---------------------------------------------------------------------------

create table if not exists public.companies (
  id            bigint generated always as identity primary key,
  name          text        not null,
  contact_name  text        not null,
  contact_phone text        not null,
  contact_email text,
  -- How and when they pay, and anything else about billing: free text.
  billing_notes text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Their fiscal details, for their invoices.
  tax_name        text,
  tax_id          text,
  tax_address     text,
  tax_postal_code text,
  tax_city        text
);

create table if not exists public.birthdays (
  id                bigint generated always as identity primary key,
  company_id        bigint      not null references public.companies(id) on delete cascade,
  active            boolean     not null default true,
  recipient_name    text        not null,
  recipient_company text,
  birth_day         smallint    not null check (birth_day between 1 and 31),
  birth_month       smallint    not null check (birth_month between 1 and 12),
  address_kind      text        not null default 'oficina' check (address_kind in ('oficina', 'casa')),
  address           text        not null,
  postal_code       text        not null check (postal_code ~ '^\d{5}$'),
  delivery_notes    text,
  cake_id           bigint      not null references public.cakes(id) on delete restrict,
  size              text        not null check (size in ('pequena', 'mediana', 'grande')),
  -- Both may carry {nombre}, filled in with the first name when the order is made.
  cake_text         text,
  card_message      text,
  sign_off          text,
  time_slot         text        not null default 'manana' check (time_slot in ('manana', 'tarde')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  card_design       text        not null default 'clasica' check (card_design in ('clasica', 'mano', 'color'))
);
create index if not exists birthdays_company_idx on public.birthdays (company_id);
create index if not exists birthdays_cake_idx on public.birthdays (cake_id);

-- ---------------------------------------------------------------------------
-- Orders
--
-- public_id is the sender's tracking link: random, 22 characters, and it only
-- grants reading. What the cake is, when, and what it cost stay forever (for
-- the books); the people in it are erased 90 days after delivery.
-- ---------------------------------------------------------------------------

create table if not exists public.orders (
  id                    bigint generated always as identity primary key,
  public_id             text        not null unique check (length(public_id) >= 16),
  source                text        not null default 'web' check (source in ('web', 'cumpleanos', 'panel')),
  status                text        not null default 'nuevo'
    check (status in ('nuevo', 'confirmado', 'en_horno', 'en_camino', 'entregado', 'cancelado')),
  payment_method        text        not null check (payment_method in ('stripe', 'transferencia')),
  payment_status        text        not null default 'pendiente'
    check (payment_status in ('pendiente', 'pagado', 'parcial', 'reembolsado', 'caducado')),
  occasion              text        not null
    check (occasion in ('networking', 'inversor', 'socio', 'reclutador', 'cliente', 'cumpleanos', 'equipo', 'otro')),
  bakery_id             bigint      not null references public.bakeries(id) on delete restrict,
  zone_id               bigint      references public.zones(id) on delete set null,
  cake_id               bigint      references public.cakes(id) on delete set null,
  -- What was sold, as it was sold: a later menu change does not rewrite it.
  cake_name             text        not null,
  size                  text        not null check (size in ('pequena', 'mediana', 'grande')),
  price_cents           integer     not null check (price_cents >= 0),
  delivery_cents        integer     not null check (delivery_cents >= 0),
  total_cents           integer     generated always as (price_cents + delivery_cents) stored,
  paid_cents            integer     not null default 0 check (paid_cents >= 0),
  refunded_cents        integer     not null default 0 check (refunded_cents >= 0),
  has_photo             boolean     not null default false,
  cake_text             text,
  card_message          text,
  sign_off              text,
  anonymous             boolean     not null default false,
  allergies             text,
  recipient_name        text,
  recipient_company     text,
  recipient_phone       text,
  address_kind          text        not null check (address_kind in ('oficina', 'casa')),
  address               text,
  postal_code           text,
  city                  text        not null,
  delivery_notes        text,
  deliver_on            date        not null,
  time_slot             text        not null check (time_slot in ('manana', 'tarde')),
  sender_name           text,
  sender_phone          text,
  sender_email          text,
  sender_company        text,
  company_id            bigint      references public.companies(id) on delete set null,
  birthday_id           bigint      references public.birthdays(id) on delete set null,
  -- The year of the birthday this order celebrates: one order per person per year.
  birthday_year         smallint,
  staff_note            text,
  ip_hash               text,
  stripe_session_id     text        unique,
  stripe_payment_intent text,
  paid_at               timestamptz,
  refunded_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  status_changed_at     timestamptz not null default now(),
  erased_at             timestamptz,
  -- The card's design (src/lib/cards.ts), and whether a document goes in the box.
  card_design           text        not null default 'clasica' check (card_design in ('clasica', 'mano', 'color')),
  has_document          boolean     not null default false
);
create index if not exists orders_deliver_idx on public.orders (deliver_on, status);
create index if not exists orders_bakery_idx on public.orders (bakery_id, deliver_on);
create index if not exists orders_zone_idx on public.orders (zone_id);
create index if not exists orders_cake_idx on public.orders (cake_id);
create index if not exists orders_company_idx on public.orders (company_id);
create index if not exists orders_payment_idx on public.orders (payment_status, created_at);
create unique index if not exists orders_birthday_year_idx
  on public.orders (birthday_id, birthday_year) where birthday_id is not null;

-- The photo printed on top of the cake. Its type was read from its first
-- bytes, not from what the browser claimed; erased with the order's people.
create table if not exists public.order_photos (
  order_id   bigint      primary key references public.orders(id) on delete cascade,
  mime       text        not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes      bytea       not null,
  created_at timestamptz not null default now()
);

-- A document the sender adds (a CV, a proposal…), printed and put in the box.
-- Its type was read from its first bytes; erased with the order's people.
create table if not exists public.order_documents (
  order_id   bigint      primary key references public.orders(id) on delete cascade,
  mime       text        not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  filename   text        not null check (length(filename) between 1 and 120),
  size_bytes integer     not null check (size_bytes > 0),
  bytes      bytea       not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Invoices
--
-- Numbered per series and year without gaps (invoice_counters), and final: a
-- trigger refuses any change or deletion. A refund or a mistake is corrected
-- with another invoice, a rectificativa (series R). They are kept after the
-- order's people are erased: the law asks for invoices to be kept for years.
-- ---------------------------------------------------------------------------

-- The fiscal details a customer leaves with an order for an invoice in their
-- company's name. Erased with the order's people; the invoice keeps a copy.
create table if not exists public.order_billing (
  order_id    bigint      primary key references public.orders(id) on delete cascade,
  name        text        not null check (length(name) between 1 and 120),
  tax_id      text        not null check (tax_id ~ '^[A-Z0-9]{9}$'),
  address     text        not null,
  postal_code text        not null check (postal_code ~ '^\d{5}$'),
  city        text        not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.invoice_counters (
  series   text     not null check (series in ('F', 'S', 'R')),
  year     smallint not null,
  last_seq integer  not null check (last_seq > 0),
  primary key (series, year)
);

-- F: completa (with the customer's name, NIF and address); S: simplificada;
-- R: rectificativa, which points at the invoice it corrects.
create table if not exists public.invoices (
  id               bigint generated always as identity primary key,
  public_id        text        not null unique check (length(public_id) >= 16),
  series           text        not null check (series in ('F', 'S', 'R')),
  year             smallint    not null,
  seq              integer     not null check (seq > 0),
  number           text        not null unique,
  issued_on        date        not null,
  operation_on     date,
  issuer_name      text        not null,
  issuer_tax_id    text        not null,
  issuer_address   text        not null,
  customer_name    text,
  customer_tax_id  text,
  customer_address text,
  replaces_id      bigint      references public.invoices(id),
  rectifies_id     bigint      references public.invoices(id),
  reason           text,
  company_id       bigint      references public.companies(id) on delete set null,
  payment_note     text,
  base_cents       integer     not null,
  vat_cents        integer     not null,
  total_cents      integer     not null,
  created_by       bigint      references public.admin_users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (series, year, seq),
  check ((series = 'R') = (rectifies_id is not null)),
  check (series <> 'F' or (customer_name is not null and customer_tax_id is not null and customer_address is not null)),
  check (base_cents + vat_cents = total_cents)
);
create index if not exists invoices_issued_idx on public.invoices (issued_on);
create index if not exists invoices_company_idx on public.invoices (company_id) where company_id is not null;
create index if not exists invoices_rectifies_idx on public.invoices (rectifies_id) where rectifies_id is not null;
create index if not exists invoices_replaces_idx on public.invoices (replaces_id) where replaces_id is not null;

create table if not exists public.invoice_lines (
  invoice_id  bigint   not null references public.invoices(id),
  position    smallint not null check (position > 0),
  order_id    bigint   references public.orders(id),
  description text     not null,
  quantity    integer  not null default 1 check (quantity > 0),
  vat_rate_bp integer  not null check (vat_rate_bp between 0 and 10000),
  base_cents  integer  not null,
  vat_cents   integer  not null,
  total_cents integer  not null,
  primary key (invoice_id, position),
  check (base_cents + vat_cents = total_cents)
);
create index if not exists invoice_lines_order_idx on public.invoice_lines (order_id) where order_id is not null;

-- The order's current invoice (simplificada or completa): what the customer's link shows.
alter table public.orders add column if not exists invoice_id bigint references public.invoices(id);
create index if not exists orders_invoice_idx on public.orders (invoice_id) where invoice_id is not null;

-- An issued invoice is never changed or deleted. The only change let through
-- is the database clearing a link to a company or an account that was deleted.
create or replace function public.invoices_are_final() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'invoices'
     and (to_jsonb(new) - 'company_id' - 'created_by') = (to_jsonb(old) - 'company_id' - 'created_by') then
    return new;
  end if;
  raise exception 'Una factura emitida no se cambia ni se borra: se corrige con una rectificativa.';
end $$;

drop trigger if exists invoices_are_final on public.invoices;
create trigger invoices_are_final before update or delete on public.invoices
  for each row execute function public.invoices_are_final();

drop trigger if exists invoice_lines_are_final on public.invoice_lines;
create trigger invoice_lines_are_final before update or delete on public.invoice_lines
  for each row execute function public.invoices_are_final();

-- Stripe events already handled, so a retried webhook is applied once.
create table if not exists public.stripe_events (
  id          text        primary key,
  type        text        not null,
  received_at timestamptz not null default now()
);

-- People who ticked "novedades por email". Consent, separate from any order,
-- with the exact wording they agreed to.
create table if not exists public.marketing_contacts (
  id           bigint generated always as identity primary key,
  email        text        not null,
  name         text,
  consent_text text        not null,
  source       text        not null default 'pedido',
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create unique index if not exists marketing_contacts_email_idx on public.marketing_contacts (lower(email));

-- ---------------------------------------------------------------------------
-- Customer accounts
--
-- Sign in with Google, Apple or Microsoft; no passwords are stored. The
-- provider vouches for the person and we keep its id for them, the address it
-- gave, and the details the customer saves for their next order. An account
-- nobody signs in to for two years is deleted by the nightly sweep; deleting
-- one unlinks its orders, which follow the order rules like any other.
-- ---------------------------------------------------------------------------

create table if not exists public.customers (
  id             bigint generated always as identity primary key,
  email          text,
  email_verified boolean     not null default false,
  name           text,
  phone          text,
  company        text,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);
-- One account per address a provider vouched for: Google and Apple with the
-- same address are one account. Addresses nobody vouched for may repeat.
create unique index if not exists customers_verified_email_idx on public.customers (lower(email)) where email_verified;
create index if not exists customers_last_seen_idx on public.customers (last_seen_at);

create table if not exists public.customer_identities (
  provider     text        not null check (provider in ('google', 'apple', 'microsoft')),
  subject      text        not null check (length(subject) between 1 and 255),
  customer_id  bigint      not null references public.customers(id) on delete cascade,
  email        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  primary key (provider, subject)
);
create index if not exists customer_identities_customer_idx on public.customer_identities (customer_id);

-- A customer's sessions, apart from the team's.
create table if not exists public.customer_sessions (
  id           bigint generated always as identity primary key,
  customer_id  bigint      not null references public.customers(id) on delete cascade,
  token_hash   text        not null unique,
  ip_hash      text,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index if not exists customer_sessions_customer_idx on public.customer_sessions (customer_id);

-- The fiscal details a customer saves for invoices in their company's name.
create table if not exists public.customer_billing (
  customer_id bigint      primary key references public.customers(id) on delete cascade,
  name        text        not null check (length(name) between 1 and 120),
  tax_id      text        not null check (tax_id ~ '^[A-Z0-9]{9}$'),
  address     text        not null,
  postal_code text        not null check (postal_code ~ '^\d{5}$'),
  city        text        not null,
  updated_at  timestamptz not null default now()
);

alter table public.orders add column if not exists customer_id bigint references public.customers(id) on delete set null;
create index if not exists orders_customer_idx on public.orders (customer_id) where customer_id is not null;

-- ---------------------------------------------------------------------------
-- Close Supabase's public API: RLS on everything (no policies means no rows),
-- and no grants for the API roles, now or on tables created later. The two
-- roles exist only on Supabase, hence the check.
-- ---------------------------------------------------------------------------

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and not rowsecurity loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all sequences in schema public from anon, authenticated;
    revoke all on all functions in schema public from anon, authenticated;
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke all on sequences from anon, authenticated;
    alter default privileges in schema public revoke all on functions from anon, authenticated;
  end if;
end $$;
