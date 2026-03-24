-- Aparência da loja (hero, cores, bullets) + produtos em promoção com preço "De"
-- Rode no Supabase → SQL Editor

alter table public.stores
  add column if not exists storefront jsonb default '{}'::jsonb;

alter table public.products
  add column if not exists is_promotion boolean default false not null;

alter table public.products
  add column if not exists compare_at_price decimal(10, 2);

comment on column public.stores.storefront is 'JSON: heroSubtitle, heroTitle, heroCtaLabel, heroCtaHref, heroImages[], heroImage (legado), infoBullets[], themePrimary, themeSecondary, searchPlaceholder, instagramUrl, facebookUrl, tiktokUrl';
comment on column public.products.is_promotion is 'Se true, aparece na seção Promoções na loja';
comment on column public.products.compare_at_price is 'Preço anterior (riscado) quando em promoção';

select pg_notify('pgrst', 'reload schema');
