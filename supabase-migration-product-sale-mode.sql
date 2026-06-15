-- Modo de venda do produto: unidade, fardo (pacote fechado) ou quantidade mínima.
-- Supabase → SQL Editor: cole e execute TODO este ficheiro.
--
-- Permite vender por atacado/fardo (ex.: Bomba dália R$12/un, só em fardo de 10)
-- mantendo produtos normais por unidade na mesma loja. Tudo configurável por produto.

alter table public.products
  add column if not exists sale_mode text not null default 'unit';

alter table public.products
  add column if not exists pack_size integer;

alter table public.products
  add column if not exists min_quantity integer;

alter table public.products
  add column if not exists price_display text not null default 'unit';

-- Valores válidos (defensivo; ignora se já existir)
do $$
begin
  alter table public.products
    add constraint products_sale_mode_chk
    check (sale_mode in ('unit', 'pack', 'min'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.products
    add constraint products_price_display_chk
    check (price_display in ('unit', 'pack'));
exception
  when duplicate_object then null;
end $$;

comment on column public.products.sale_mode is 'unit = avulso; pack = só em fardo fechado (múltiplos de pack_size); min = quantidade mínima';
comment on column public.products.pack_size is 'Unidades por fardo quando sale_mode = pack';
comment on column public.products.min_quantity is 'Quantidade mínima quando sale_mode = min';
comment on column public.products.price_display is 'unit = mostra preço por unidade; pack = mostra preço do fardo';

select pg_notify('pgrst', 'reload schema');
