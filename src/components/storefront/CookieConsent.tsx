"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "vw-cookie-consent";

/**
 * Aviso de cookies da loja pública ("Você aceita nossos cookies?").
 * Aparece na 1.ª visita e some depois que o cliente aceita/recusa (guardado no
 * localStorage). Fica acima da barra de navegação inferior no celular.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function decide(value: "accepted" | "declined") {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignora storage indisponível */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-[60] px-3 pb-2 md:bottom-0 md:px-4 md:pb-4">
      <div className="mx-auto flex max-w-[1000px] flex-col gap-3 rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-2xl ring-1 ring-black/5 backdrop-blur sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <p className="flex-1 text-sm leading-relaxed text-stone-700">
          <span className="mr-1.5 text-base" aria-hidden>
            🍪
          </span>
          Usamos cookies para melhorar sua experiência de navegação. Você aceita
          nossos cookies?
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => decide("declined")}
            className="rounded-full px-4 py-2 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-stone-700"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
