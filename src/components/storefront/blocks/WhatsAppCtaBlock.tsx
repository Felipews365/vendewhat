/**
 * BLOCO: Chamada para WhatsApp
 * Finalidade: botão grande que abre a conversa no WhatsApp da loja.
 * É o coração do VendeWhat — venda acontece na conversa.
 */
import type { WhatsAppCtaConfig } from "./types";
import { limitText, BLOCK_LIMITS } from "./types";
import { BlockContainer } from "./primitives";

const L = BLOCK_LIMITS.whatsappCta;

/** Ícone do WhatsApp (inline, sem dependência externa). */
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.695.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884z" />
    </svg>
  );
}

export function WhatsAppCtaBlock({
  config,
  editing = false,
}: {
  config: WhatsAppCtaConfig;
  editing?: boolean;
}) {
  // 🖊️ Lojista edita:
  const title = limitText(config.title, L.title.max) || "Fale com a gente";
  const message =
    limitText(config.message, L.message.max) ||
    "Tire dúvidas e faça seu pedido pelo WhatsApp.";
  const buttonLabel =
    limitText(config.buttonLabel, L.buttonLabel.max) || "Chamar no WhatsApp";
  const phone = (config.phone ?? "").replace(/\D/g, "");

  // Sem telefone o botão não funciona — na loja pública, ocultamos o bloco.
  if (!phone) {
    if (!editing) return null;
    return (
      <BlockContainer tone="brand">
        <p className="text-center text-sm text-white/85">
          Chamada de WhatsApp — informe o número da loja para ativar o botão.
        </p>
      </BlockContainer>
    );
  }

  const waHref = `https://wa.me/${phone}${
    config.prefill?.trim()
      ? `?text=${encodeURIComponent(config.prefill.trim())}`
      : ""
  }`;

  return (
    <BlockContainer tone="brand">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <h2 className="font-serif text-2xl font-bold leading-tight sm:text-3xl">
          {title}
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-white/85 sm:text-base">
          {message}
        </p>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-7 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.03] sm:text-base"
        >
          <WhatsAppIcon />
          {buttonLabel}
        </a>
      </div>
    </BlockContainer>
  );
}
