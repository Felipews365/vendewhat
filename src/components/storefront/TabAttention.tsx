"use client";

import { useEffect, useRef } from "react";

/** Tempo que cada frase fica na aba antes de trocar. */
const ROTATE_MS = 2000;

/**
 * Enquanto o cliente está com a loja em OUTRA aba, o título fica alternando
 * frases (chamando de volta). Ao voltar para a aba, restaura o título real.
 *
 * `messages` precisa ter identidade estável (useMemo no pai), senão o efeito
 * remonta a cada render e o rodízio reinicia.
 */
export function TabAttention({ messages }: { messages: string[] }) {
  /** Título real da página, guardado no momento em que a aba é escondida. */
  const originalRef = useRef("");

  useEffect(() => {
    if (messages.length === 0 || typeof document === "undefined") return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let idx = 0;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const restore = () => {
      stop();
      if (originalRef.current) document.title = originalRef.current;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        // Guarda o título de agora (e não o do mount): se a página passar a
        // montar títulos dinâmicos, o que volta continua sendo o certo.
        originalRef.current = document.title;
        idx = 0;
        document.title = messages[0];
        stop();
        timer = setInterval(() => {
          idx = (idx + 1) % messages.length;
          document.title = messages[idx];
        }, ROTATE_MS);
      } else {
        restore();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      restore();
    };
  }, [messages]);

  return null;
}
