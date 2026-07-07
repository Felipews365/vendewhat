-- Detalhes extras do produto: tags de busca, tipo de unidade, código de barras
-- (EAN) e dimensões/peso da embalagem. Todas opcionais; o formulário tem
-- fallback de coluna ausente, mas rode isto para os campos gravarem de verdade.
alter table public.products
  add column if not exists tags jsonb default '[]'::jsonb,
  add column if not exists unit_type text,
  add column if not exists barcode text,
  add column if not exists package_height numeric(8,2),
  add column if not exists package_width numeric(8,2),
  add column if not exists package_length numeric(8,2),
  add column if not exists package_weight numeric(10,3);
