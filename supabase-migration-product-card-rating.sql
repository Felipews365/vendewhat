-- Estrelinhas decorativas do produto no card da loja, POR PRODUTO.
-- 0 = esconder as estrelas só deste produto; 1..5 = quantas estrelas mostrar;
-- NULL = usa o padrão da loja (5 estrelas, quando storefront.cardShowRatings está ligado).
-- As estrelas são decorativas (não são reviews reais).
alter table products
  add column if not exists card_rating smallint
  check (card_rating is null or (card_rating >= 0 and card_rating <= 5));
