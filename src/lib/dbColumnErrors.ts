/**
 * Erro do PostgREST/Supabase: coluna inexistente ou schema cache desatualizado.
 * Não usa só `includes("images")` — evita confusão com textos que citam "product-images" etc.
 */
export function isMissingColumnError(
  message: string,
  column: string,
  code?: string | null
): boolean {
  const m = (message || "").toLowerCase();
  const c = column.toLowerCase();
  if (!m.includes(c)) return false;

  const structural =
    m.includes("schema cache") ||
    (m.includes("column") && m.includes(c)) ||
    m.includes("does not exist") ||
    m.includes("could not find");

  if (!structural) return false;
  return true;
}

export const IMAGES_MIGRATION_HINT =
  "Ative várias fotos: Supabase → SQL Editor → cole o conteúdo de supabase-migration-product-images.sql e execute. No final do script o schema da API é recarregado. Se o erro continuar: Settings → General → Restart project.";

export const OPTIONS_MIGRATION_HINT =
  "Ative cor e tamanho: Supabase → SQL Editor → rode supabase-migration-product-options.sql (inclui reload do schema). Confirme que é o MESMO projeto do .env (URL da API).";

export const VARIANT_STOCK_MIGRATION_HINT =
  "Ative estoque por variação: rode supabase-migration-variant-stock.sql e depois select pg_notify('pgrst', 'reload schema');";

/** Colunas de opções / grade ausentes na API */
export function isMissingOptionsOrVariantStockColumn(
  message: string,
  code?: string | null
): boolean {
  return (
    isMissingColumnError(message, "colors", code) ||
    isMissingColumnError(message, "sizes", code) ||
    isMissingColumnError(message, "variant_stock", code)
  );
}

/** RLS bloqueou insert/update (política ausente ou sessão sem login). */
export function isRlsPolicyError(message: string, code?: string | null): boolean {
  const m = (message || "").toLowerCase();
  if (code === "42501" || code === "PGRST301") return true;
  if (m.includes("row-level security") || m.includes("violates row-level"))
    return true;
  if (m.includes("permission denied")) return true;
  return false;
}

export const PRODUCTS_RLS_INSERT_HINT =
  "Permissão negada ao salvar produto (segurança do banco). No Supabase → SQL Editor, rode o arquivo supabase-fix-products-insert-rls.sql do projeto. Confirme que está logado na loja e que a loja é sua.";

/** `select` sem `product_reference` quando a API ainda não recarregou o schema (PGRST / schema cache). Sem `color_hexes` para não falhar em bases antigas. */
export const PRODUCTS_SELECT_WITHOUT_PRODUCT_REFERENCE =
  "id, store_id, name, description, price, image, images, colors, sizes, variant_stock, stock, active, is_promotion, compare_at_price, category, image_object_position, created_at, updated_at";

export const PRODUCT_REFERENCE_MIGRATION_HINT =
  "Referência do produto — checklist: (1) No Supabase, confirme que o URL do projeto é o mesmo de NEXT_PUBLIC_SUPABASE_URL no .env. (2) SQL Editor: cole supabase-migration-product-reference.sql inteiro e Run (mensagem «Success» mesmo sem linhas é normal). (3) Rode: select column_name from information_schema.columns where table_schema='public' and table_name='products' and column_name='product_reference'; — tem de devolver 1 linha. (4) Settings → API → Reload schema (ou reinicie o projeto). (5) Atualize o painel com Ctrl+Shift+R. O erro de schema cache some quando o passo 3 e 4 estiverem OK.";

export const COLOR_HEXES_MIGRATION_HINT =
  "Tom da bolinha por cor: rode supabase-migration-product-color-hexes.sql no SQL Editor e aguarde o reload do schema.";

export const PRODUCT_CATEGORY_MIGRATION_HINT =
  "Categoria do produto: no Supabase → SQL Editor, rode supabase-migration-product-category.sql e aguarde o reload do schema.";

export const PRODUCT_IMAGE_POSITION_MIGRATION_HINT =
  "Enquadramento da foto no catálogo: rode supabase-migration-product-image-position.sql no SQL Editor e recarregue o schema da API.";

/** Pedidos: tabela antiga sem order_number / cliente (erro SQL 42703 ou PostgREST equivalente). */
export function isMissingOrdersColumnError(
  message: string,
  code?: string | null
): boolean {
  return (
    isMissingColumnError(message, "order_number", code) ||
    isMissingColumnError(message, "customer_name", code) ||
    isMissingColumnError(message, "customer_phone", code)
  );
}

export const ORDERS_MIGRATION_HINT =
  "Pedidos (erro 42703 em order_number ou store_id): a tabela orders já existia sem essas colunas. No SQL Editor execute primeiro supabase-migration-orders-repair.sql, depois o ficheiro supabase-migration-orders.sql completo (do início ao fim, sem saltar o bloco ALTER). Confirme que store_id está na definição da tabela antes de criar índices. Depois: pg_notify / reload schema se necessário e SUPABASE_SERVICE_ROLE_KEY na API.";
