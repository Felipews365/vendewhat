/**
 * BLOCO: Cupom / Oferta
 * Finalidade: destacar um código de desconto que o cliente usa no pedido.
 * Visual de "cupom recortado" (borda tracejada), sem imagem.
 */
import type { CouponOfferConfig } from "./types";
import { limitText, BLOCK_LIMITS } from "./types";
import { BlockContainer } from "./primitives";

const L = BLOCK_LIMITS.couponOffer;

export function CouponOfferBlock({
  config,
  editing = false,
}: {
  config: CouponOfferConfig;
  editing?: boolean;
}) {
  // 🖊️ Lojista edita:
  const title = limitText(config.title, L.title.max) || "Oferta especial";
  const description = limitText(config.description, L.description.max);
  const code = limitText(config.code, L.code.max).toUpperCase();

  // Sem código não há cupom — na loja pública, ocultamos.
  if (!code) {
    if (!editing) return null;
    return (
      <BlockContainer tone="muted">
        <p className="text-center text-sm text-stone-500">
          Bloco de cupom — informe o código de desconto para exibir.
        </p>
      </BlockContainer>
    );
  }

  return (
    <BlockContainer tone="muted">
      <div
        className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-6 text-center sm:flex-row sm:justify-between sm:text-left"
        style={{ borderColor: "var(--store-primary)" }}
      >
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-bold text-stone-900 sm:text-2xl">
            {title}
          </h2>
          {description && (
            <p className="mt-1 line-clamp-2 text-sm text-stone-600">
              {description}
            </p>
          )}
        </div>
        {/* "Ticket" com o código — grande e fácil de copiar visualmente */}
        <div
          className="shrink-0 rounded-xl px-6 py-3 text-center text-white shadow-md"
          style={{ backgroundColor: "var(--store-primary)" }}
        >
          <span className="block text-[10px] font-semibold uppercase tracking-widest opacity-80">
            Cupom
          </span>
          <span className="text-lg font-black tracking-wider sm:text-xl">
            {code}
          </span>
        </div>
      </div>
    </BlockContainer>
  );
}
