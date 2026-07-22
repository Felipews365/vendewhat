"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";

/**
 * Botão de compartilhar de UM produto, usado no cabeçalho do detalhe
 * (`ProductDetailModal` em `LojaClient`). Ao tocar, abre um menuzinho com
 * WhatsApp · Facebook · Telegram · **Copiar link**.
 *
 * - O link aponta para o **produto específico**: `origin/loja/{slug}?p={id}`.
 *   O `LojaClient` lê esse `?p=` no carregamento e já abre o produto (deep-link).
 * - No celular, se o aparelho tiver o compartilhamento nativo
 *   (`navigator.share`), um único toque já abre a folha do sistema.
 * - "Copiar link" usa `navigator.clipboard` (com fallback pro `execCommand`) e
 *   avisa com o toast "Link copiado!" + um ✓ temporário.
 */
export function ProductShare({
  slug,
  productId,
  productName,
  storeName,
}: {
  slug: string;
  productId: string;
  productName: string;
  storeName: string;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setUrl(`${window.location.origin}/loja/${slug}?p=${productId}`);
    // Compartilhamento nativo só no celular (toque): no desktop mantemos o menu
    // com "Copiar link" em vez de deixar a folha do SO esconder essa opção.
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    setCanNativeShare(touch && typeof navigator !== "undefined" && !!navigator.share);
  }, [slug, productId]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shareText = `${productName} — ${storeName}`;

  async function copyLink() {
    if (!url) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      showToast("Link copiado!");
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      showToast("Não foi possível copiar o link", "error");
    }
  }

  async function handleTrigger() {
    // No celular com compartilhamento nativo, um toque já abre a folha do sistema.
    if (canNativeShare && url) {
      try {
        await navigator.share({ title: shareText, text: shareText, url });
        return;
      } catch {
        // Cancelou ou falhou → cai no menu manual.
      }
    }
    setOpen((v) => !v);
  }

  const enc = encodeURIComponent(url);
  const encText = encodeURIComponent(shareText);

  const links = [
    {
      key: "whatsapp",
      label: "Compartilhar no WhatsApp",
      href: `https://wa.me/?text=${encText}%20${enc}`,
      color: "#25D366",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden>
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.004c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.28.86 5.84 2.42a8.2 8.2 0 0 1 2.42 5.83c0 4.55-3.7 8.25-8.26 8.25a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.39c0-4.55 3.7-8.25 8.26-8.25Zm-3.6 4.36c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.43 1.03 2.6c.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.48-.6 1.69-1.19.21-.58.21-1.08.15-1.19-.06-.1-.23-.16-.48-.29-.25-.12-1.48-.73-1.71-.81-.23-.08-.4-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23a7.5 7.5 0 0 1-1.39-1.72c-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.55-1.36-.77-1.86-.2-.48-.4-.42-.55-.42l-.47-.01Z" />
        </svg>
      ),
    },
    {
      key: "facebook",
      label: "Compartilhar no Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc}`,
      color: "#1877F2",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden>
          <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
        </svg>
      ),
    },
    {
      key: "telegram",
      label: "Compartilhar no Telegram",
      href: `https://t.me/share/url?url=${enc}&text=${encText}`,
      color: "#229ED9",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden>
          <path d="M21.94 4.5 18.7 19.78c-.24 1.08-.88 1.35-1.79.84l-4.94-3.64-2.38 2.29c-.26.26-.49.49-1 .49l.36-5.06 9.2-8.31c.4-.36-.09-.56-.62-.2L4.75 13.03l-4.9-1.53c-1.07-.34-1.09-1.07.22-1.58l19.16-7.39c.89-.33 1.67.2 1.38 1.5Z" />
        </svg>
      ),
    },
  ];

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={handleTrigger}
        aria-label="Compartilhar este produto"
        aria-expanded={open}
        title="Compartilhar"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-300 focus-visible:ring-offset-1"
        style={{ color: "var(--store-secondary)" }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      </button>

      {open && (
        <div className="vw-pop-in absolute right-0 top-full z-30 mt-2 flex items-center gap-1.5 rounded-full bg-white px-2 py-1.5 shadow-lg ring-1 ring-black/5">
          {links.map((l) => (
            <a
              key={l.key}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={l.label}
              title={l.label}
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
              style={{ color: l.color }}
            >
              {l.icon}
            </a>
          ))}
          <button
            type="button"
            onClick={copyLink}
            aria-label="Copiar link do produto"
            title="Copiar link"
            className="flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
            style={copied ? { color: "#16a34a" } : undefined}
          >
            {copied ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden>
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
