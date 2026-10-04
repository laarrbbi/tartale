-- Invoices.
--
-- Tartame's own details move into the settings row, so the owner fills them
-- in from Ajustes (they print on every invoice and on the legal pages), with
-- the VAT rate of the cakes. Customers who want an invoice in their
-- company's name leave its fiscal details with the order (order_billing,
-- erased with the order's people after 90 days: the invoice keeps its own
-- copy); companies with birthday lists get theirs on the company.
--
-- Invoices are numbered per series and year without gaps (invoice_counters)
-- and are final: a trigger refuses any change or deletion. A mistake or a
-- refund is corrected with another invoice, a rectificativa (series R).
--
-- Idempotent: applied from the panel (Ajustes → Base de datos) as well as here.

alter table public.settings add column if not exists legal_name text;
alter table public.settings add column if not exists tax_id text;
alter table public.settings add column if not exists legal_address text;
alter table public.settings add column if not exists legal_postal_code text;
alter table public.settings add column if not exists legal_city text;
alter table public.settings add column if not exists legal_email text;
alter table public.settings add column if not exists legal_registry text;
alter table public.settings
  add column if not exists vat_rate_bp integer check (vat_rate_bp between 0 and 10000);
alter table public.settings add column if not exists invoice_note text;

alter table public.companies add column if not exists tax_name text;
alter table public.companies add column if not exists tax_id text;
alter table public.companies add column if not exists tax_address text;
alter table public.companies add column if not exists tax_postal_code text;
alter table public.companies add column if not exists tax_city text;

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
