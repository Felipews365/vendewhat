-- Tom da bolinha por nome da cor (vitrine). Mapa: { "Azul marinho": "#1e3a5f", ... }
-- Rode no Supabase → SQL Editor

alter table public.products
  add column if not exists color_hexes jsonb default '{}'::jsonb not null;

comment on column public.products.color_hexes is 'JSON objeto: nome da cor (igual ao item em colors[]) -> #rrggbb para a bolinha na loja';

select pg_notify('pgrst', 'reload schema');
