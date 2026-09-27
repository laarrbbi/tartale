-- The card and a printed document, instead of printing on the cake (for now).
--
-- The card that goes with the cake comes in three designs, and the sender may
-- attach a document (a CV, a proposal…) that is printed and put in the box.
-- Nothing is printed on the cake itself: orders.has_photo, orders.cake_text,
-- order_photos, birthdays.cake_text and bakeries.prints_photos stay, unused,
-- for when it is.
--
-- Idempotent: applied from the panel (Ajustes → Base de datos) as well as here.

alter table public.orders
  add column if not exists card_design text not null default 'clasica'
    check (card_design in ('clasica', 'mano', 'color'));

alter table public.orders
  add column if not exists has_document boolean not null default false;

alter table public.birthdays
  add column if not exists card_design text not null default 'clasica'
    check (card_design in ('clasica', 'mano', 'color'));

-- The document to print, kept apart like the photo, and erased with the
-- order's people 90 days after delivery.
create table if not exists public.order_documents (
  order_id   bigint      primary key references public.orders(id) on delete cascade,
  mime       text        not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  filename   text        not null check (length(filename) between 1 and 120),
  size_bytes integer     not null check (size_bytes > 0),
  bytes      bytea       not null,
  created_at timestamptz not null default now()
);

-- The new table closes to Supabase's public API like every other.
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
