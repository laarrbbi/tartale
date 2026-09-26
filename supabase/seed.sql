-- ===========================================================================
-- Tartale — starting data, applied once after schema.sql. Safe to re-run:
-- nothing is inserted twice and nothing already edited is overwritten.
--
-- The first partner bakery and its menu, as Levadura Madre prices it on its
-- own cake list (the same list leva shows at levaduramadre's "Regala una
-- tarta"). Its zone is Alicante city, 03001–03016 and 03540, with delivery at
-- 10 €. Everything here is edited from the panel afterwards (Pastelerías).
-- ===========================================================================

insert into public.bakeries (slug, name, city, address, phone, whatsapp, prints_photos, notes)
values (
  'levadura-madre',
  'Levadura Madre',
  'Alicante',
  'Gran Vía, Alicante',
  '+34 663 82 32 96',
  '+34 663 82 32 96',
  true,
  'Primera pastelería asociada. Hornea, imprime la foto y reparte.'
)
on conflict (slug) do nothing;

insert into public.zones (bakery_id, name, city, postal_codes, delivery_cents)
select b.id, 'Alicante', 'Alicante',
       array['03001','03002','03003','03004','03005','03006','03007','03008',
             '03009','03010','03011','03012','03013','03014','03015','03016','03540'],
       1000
  from public.bakeries b
 where b.slug = 'levadura-madre'
   and not exists (select 1 from public.zones z where z.bakery_id = b.id);

insert into public.cakes (bakery_id, name, photo, price_pequena_cents, price_mediana_cents, price_grande_cents, sort_order)
select b.id, c.name, c.photo, c.p, c.m, c.g, c.sort_order
  from public.bakeries b
 cross join (values
   ('Chocolate',                                 '/cakes/chocolate.jpg',       2900, 4250, 5000, 10),
   ('Cheesecake',                                '/cakes/cheesecake.jpg',      2900, 4250, 5000, 20),
   ('Lotus',                                     '/cakes/lotus.jpg',           3335, 4600, 5635, 30),
   ('Red Velvet',                                '/cakes/red-velvet.jpg',      2900, 4250, 5000, 40),
   ('Carrot Cake',                               '/cakes/carrot-cake.jpg',     2900, 4250, 5000, 50),
   ('Limón y Arándanos',                         '/cakes/limon-arandanos.jpg', 2900, 4250, 5000, 60),
   ('Guinness (sin alcohol)',                    null,                         2900, 4250, 5000, 70),
   ('Tarta de Cumpleaños con productos Kinder®', '/cakes/kinder.jpg',          3680, 4945, 5980, 80)
 ) as c(name, photo, p, m, g, sort_order)
 where b.slug = 'levadura-madre'
on conflict (bakery_id, lower(name)) do nothing;
