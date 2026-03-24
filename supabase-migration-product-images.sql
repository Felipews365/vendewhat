-- Rode no Supabase: SQL Editor → New query → Run
-- Adiciona várias fotos por produto (mantém a coluna `image` como primeira foto para compatibilidade)

alter table public.products
  add column if not exists images jsonb default '[]'::jsonb;

-- Copia foto antiga para o array (quem já tinha só `image`)
update public.products
set images = jsonb_build_array(image)
where image is not null
  and (images is null or images = '[]'::jsonb or jsonb_array_length(images) = 0);

-- Atualiza o cache do PostgREST (API) para enxergar a coluna `images`
select pg_notify('pgrst', 'reload schema');
