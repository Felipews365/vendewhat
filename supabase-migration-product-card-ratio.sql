-- Formato da foto do produto no card da loja, POR PRODUTO.
-- "1:1" (quadrado) ou "3:4" (retrato); NULL/vazio = usa o padrão da loja
-- (storefront.productCardRatio). Sem isso, o formato era só global.
alter table products add column if not exists card_ratio text;
