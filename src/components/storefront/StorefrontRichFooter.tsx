"use client";

import Link from "next/link";
import {
  type StorefrontSettings,
  normalizeInstagramUrl,
  normalizeSocialUrl,
} from "@/lib/storefront";

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

function YoutubeGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function policyHref(raw: string): string {
  const s = raw.trim();
  if (!s) return "#";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

function websiteHref(raw: string): string {
  const s = raw.trim();
  if (!s) return "#";
  return normalizeSocialUrl(s);
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
  }
}

export function StorefrontRichFooter({
  sf,
  storeSlug,
  storeName,
  whatsappHref,
}: {
  sf: StorefrontSettings;
  storeSlug: string;
  storeName: string;
  whatsappHref: string | null;
}) {
  const ig = normalizeInstagramUrl(sf.instagramUrl);
  const fb = normalizeSocialUrl(sf.facebookUrl);
  const tt = normalizeSocialUrl(sf.tiktokUrl);
  const yt = normalizeSocialUrl(sf.youtubeUrl);

  const showTopBar = Boolean(
    sf.footerShippingLine.trim() || sf.footerReturnsLine.trim()
  );
  const showContactCol = Boolean(
    whatsappHref ||
      sf.footerPhone.trim() ||
      sf.footerEmail.trim() ||
      sf.footerWebsite.trim() ||
      sf.footerHours.trim()
  );
  const showPay = sf.footerShowPix || sf.footerShowCash;
  const showSocial = Boolean(ig || fb || tt || yt);

  return (
    <section
      className="mt-2 border-t border-stone-200/90 bg-[#faf9f7]"
      aria-label="Informações da loja"
    >
      {showTopBar && (
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-stone-700 border-b border-stone-200/70">
          {sf.footerShippingLine.trim() ? (
            <div className="flex items-start gap-2 min-w-0">
              <span className="text-lg shrink-0" aria-hidden>
                🚚
              </span>
              <span className="leading-snug">{sf.footerShippingLine.trim()}</span>
            </div>
          ) : (
            <span />
          )}
          {sf.footerReturnsLine.trim() ? (
            <div className="flex items-start gap-2 min-w-0 sm:text-right sm:flex-row-reverse">
              <span className="text-lg shrink-0" aria-hidden>
                🤝
              </span>
              <span className="leading-snug sm:text-right">
                {sf.footerReturnsLine.trim()}
              </span>
            </div>
          ) : null}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-3">
            Navegação
          </p>
          <ul className="space-y-2">
            <li>
              <Link
                href={`/loja/${storeSlug}`}
                className="text-boutique-deeper hover:underline font-medium"
              >
                Página inicial
              </Link>
            </li>
            <li>
              {sf.footerPolicyUrl.trim() ? (
                <a
                  href={policyHref(sf.footerPolicyUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-boutique-deeper hover:underline font-medium"
                >
                  Políticas de devolução
                </a>
              ) : (
                <span className="text-stone-400">Políticas de devolução</span>
              )}
            </li>
            <li>
              <button
                type="button"
                onClick={() => scrollToId("loja-busca")}
                className="text-boutique-deeper hover:underline font-medium text-left"
              >
                Busca
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => scrollToId("faixa-categorias")}
                className="text-boutique-deeper hover:underline font-medium text-left"
              >
                Categorias
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => scrollToId("catalogo")}
                className="text-boutique-deeper hover:underline font-medium text-left"
              >
                Filtros e catálogo
              </button>
            </li>
          </ul>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-1 border border-emerald-200/80">
            <span aria-hidden>🔒</span>
            SITE 100% SEGURO · HTTPS
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-3">
            Contato
          </p>
          {showContactCol ? (
            <div className="space-y-4 text-stone-700">
              <div>
                <p className="text-[11px] font-semibold text-stone-500 mb-1">
                  Fale com o vendedor
                </p>
                {whatsappHref ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 font-medium hover:opacity-90"
                    style={{ color: "var(--store-primary)" }}
                  >
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-whatsapp text-white"
                      aria-hidden
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                    </span>
                    {storeName}
                  </a>
                ) : (
                  <p className="text-stone-400 text-sm">Configure o WhatsApp da loja</p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-stone-500 mb-1">
                  Atendimento ao cliente
                </p>
                <ul className="space-y-1.5">
                  {sf.footerPhone.trim() ? (
                    <li>
                      <a
                        href={`tel:${sf.footerPhone.replace(/\D/g, "")}`}
                        className="hover:underline"
                      >
                        📞 {sf.footerPhone.trim()}
                      </a>
                    </li>
                  ) : null}
                  {sf.footerEmail.trim() ? (
                    <li>
                      <a
                        href={`mailto:${sf.footerEmail.trim()}`}
                        className="hover:underline break-all"
                      >
                        ✉️ {sf.footerEmail.trim()}
                      </a>
                    </li>
                  ) : null}
                  {sf.footerWebsite.trim() ? (
                    <li>
                      <a
                        href={websiteHref(sf.footerWebsite)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline break-all"
                      >
                        🌐 {sf.footerWebsite.trim()}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </div>
              {sf.footerHours.trim() ? (
                <div>
                  <p className="text-[11px] font-semibold text-stone-500 mb-1">
                    Horário de atendimento
                  </p>
                  <p className="flex items-start gap-2">
                    <span aria-hidden>🕐</span>
                    <span>{sf.footerHours.trim()}</span>
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-stone-400 text-sm">
              Preencha telefone, e-mail ou site no painel (Rodapé da vitrine).
            </p>
          )}
        </div>

        <div>
          {(showPay || showSocial) && (
            <>
              {showPay && (
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
                    Formas de pagamento aceitas
                  </p>
                  <div className="flex flex-wrap gap-3 items-center">
                    {sf.footerShowPix && (
                      <span className="px-2 py-1 rounded bg-teal-600 text-white text-xs font-bold tracking-wide">
                        Pix
                      </span>
                    )}
                    {sf.footerShowCash && (
                      <span className="text-2xl" title="Dinheiro" aria-hidden>
                        💵
                      </span>
                    )}
                  </div>
                </div>
              )}
              {showSocial && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
                    Redes sociais
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {ig ? (
                      <a
                        href={ig}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-stone-100 hover:bg-stone-200 transition-colors"
                        style={{ color: "var(--store-primary)" }}
                        aria-label="Instagram"
                      >
                        <InstagramGlyph className="w-6 h-6" />
                      </a>
                    ) : null}
                    {fb ? (
                      <a
                        href={fb}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-stone-100 hover:bg-stone-200 text-[#1877F2] text-xl leading-none"
                        aria-label="Facebook"
                      >
                        f
                      </a>
                    ) : null}
                    {yt ? (
                      <a
                        href={yt}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-stone-100 hover:bg-stone-200 text-red-600"
                        aria-label="YouTube"
                      >
                        <YoutubeGlyph className="w-6 h-6" />
                      </a>
                    ) : null}
                    {tt ? (
                      <a
                        href={tt}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold"
                        aria-label="TikTok"
                      >
                        TT
                      </a>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          )}
          {!showPay && !showSocial && (
            <p className="text-stone-400 text-sm">
              Ative Pix/dinheiro e cadastre redes em Aparência da loja.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
