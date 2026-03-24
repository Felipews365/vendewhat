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

export const PRODUCT_REFERENCE_MIGRATION_HINT =
  "Referência do produto: no Supabase → SQL Editor, rode supabase-migration-product-reference.sql e aguarde o reload do schema.";

export const COLOR_HEXES_MIGRATION_HINT =
  "Tom da bolinha por cor: rode supabase-migration-product-color-hexes.sql no SQL Editor e aguarde o reload do schema.";

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
  "No Supabase → SQL Editor, execute supabase-migration-orders.sql: faz ALTER (order_number, cliente) antes dos índices e corrige o 42703 se orders já existia. Depois: select pg_notify('pgrst', 'reload schema'); e configure SUPABASE_SERVICE_ROLE_KEY. Alternativa mínima: supabase-migration-orders-customer-number.sql e o bloco de índices/RLS do ficheiro principal.";
