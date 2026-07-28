import Image from "next/image";
import { DEFAULT_OFFLINE_MESSAGE } from "@/lib/storefront";

/**
 * TELA DE MANUTENÇÃO da loja pública (quando `storefront.storeOffline` está
 * ligado). Substitui a vitrine inteira por um aviso amigável enquanto o lojista
 * atualiza o catálogo — assim o cliente não vê preços/estoque pela metade.
 *
 * É um server component estático (só um `<a>` para o WhatsApp, sem JS): renderizado
 * direto na página da loja, então nem carregamos o catálogo quando a loja está off.
 */
export function StoreOfflineScreen({
  storeName,
  logo,
  message,
  whatsappPhone,
  pageBackground,
  primary,
}: {
  storeName: string;
  logo: string | null;
  message: string;
  /** Telefone do WhatsApp da loja (só dígitos, com DDI) — vazio esconde o botão. */
  whatsappPhone: string | null;
  pageBackground: string;
  primary: string;
}) {
  const text = message.trim() || DEFAULT_OFFLINE_MESSAGE;
  const phone = (whatsappPhone ?? "").replace(/\D/g, "");
  const waHref = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(
        `Olá! Vi que a loja ${storeName} está atualizando o catálogo e queria falar com vocês.`
      )}`
    : "";

  return (
    <main
      className="min-h-[100dvh] flex items-center justify-center px-6 py-16"
      style={{ background: pageBackground }}
    >
      <div className="w-full max-w-md text-center">
        {logo ? (
          <Image
            src={logo}
            alt={storeName}
            width={96}
            height={96}
            className="mx-auto mb-6 h-24 w-24 rounded-full object-cover ring-1 ring-black/10 shadow-sm"
          />
        ) : (
          <div
            className="mx-auto mb-6 grid h-24 w-24 place-items-center rounded-full text-3xl font-bold text-white shadow-sm"
            style={{ background: primary }}
          >
            {storeName.trim().charAt(0).toUpperCase() || "🛍️"}
          </div>
        )}

        <h1 className="text-2xl font-bold text-slate-800">{storeName}</h1>

        <span
          className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-white"
          style={{ background: primary }}
        >
          <span aria-hidden>🛠️</span> Loja em atualização
        </span>

        <p className="mt-5 text-base leading-relaxed text-slate-600 whitespace-pre-line">
          {text}
        </p>

        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#1ebe5a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 fill-current"
              aria-hidden
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413" />
            </svg>
            Falar no WhatsApp
          </a>
        )}
      </div>
    </main>
  );
}
