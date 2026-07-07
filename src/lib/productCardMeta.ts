/**
 * Helpers de exibição dos cards de produto no estilo "e-commerce" da loja
 * pública (VendeWhat): selo de desconto, parcelamento estimado e avaliação
 * decorativa.
 *
 * IMPORTANTE — avaliação (estrelas + nº de avaliações): é **decorativa**. A
 * plataforma não coleta reviews reais; o valor é gerado de forma
 * **determinística** a partir do id do produto (fica igual entre visitas) e só
 * aparece quando o lojista **liga** a opção no painel ("Rodapé da vitrine").
 * Não representa avaliações reais de clientes.
 *
 * O parcelamento também é uma **estimativa** (preço ÷ nº de parcelas "sem
 * juros"), não um valor de gateway.
 */

/** % de desconto (inteiro) quando há preço "de" maior que o preço atual. */
export function discountPercent(
  price: number,
  compareAt: number | null | undefined
): number | null {
  if (compareAt == null || !(compareAt > price) || price <= 0) return null;
  const pct = Math.round((1 - price / compareAt) * 100);
  return pct > 0 ? pct : null;
}

/** Valor mínimo de cada parcela sem juros (evita "12x de R$ 2"). */
const MIN_INSTALLMENT = 5;

/**
 * Melhor plano de parcelas **sem juros** até `maxInstallments`
 * (0/1 = desligado). Divide o preço no maior número de parcelas possível sem
 * que cada uma fique abaixo de `MIN_INSTALLMENT`. Retorna `null` quando não vale
 * a pena parcelar (preço baixo) ou o recurso está desligado.
 */
export function installmentPlan(
  price: number,
  maxInstallments: number
): { count: number; each: number } | null {
  const max = Math.floor(maxInstallments);
  if (max < 2 || !(price > 0)) return null;
  const count = Math.min(max, Math.floor(price / MIN_INSTALLMENT));
  if (count < 2) return null;
  return { count, each: price / count };
}

/**
 * Avaliação **decorativa** determinística a partir de uma semente (id do
 * produto). Não são reviews reais — ver aviso no topo do arquivo. Retorna nota
 * entre 4,2 e 5,0 e um número de avaliações plausível (40 a ~3.500).
 */
export function decorativeRating(seed: string): { rating: number; count: number } {
  // FNV-1a simples → hash estável para o mesmo id.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (h >>> 0) / 0xffffffff; // 0..1
  const v = (Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0) / 0xffffffff; // 0..1
  const rating = Math.round((4.2 + u * 0.8) * 10) / 10; // 4.2 .. 5.0
  const count = 40 + Math.floor(v * 3460); // 40 .. ~3500
  return { rating, count };
}
