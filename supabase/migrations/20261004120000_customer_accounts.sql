-- Customer accounts: sign in with Google, Apple or Microsoft.
--
-- No passwords are stored. The provider vouches for the person; we keep its
-- id for them (customer_identities), the email address it gave, and the
-- details the customer chooses to save for their next order. Their sessions
-- have a table of their own, apart from the team's. An order placed while
-- signed in is linked to the account; deleting the account unlinks it, and an
-- account nobody signs in to for two years is deleted by the nightly sweep.
--
-- Idempotent: applied from the panel (Ajustes → Base de datos) as well as here.

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

-- Supabase's public API gets nothing, on these tables too.
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
