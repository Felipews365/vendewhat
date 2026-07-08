"use client";

/**
 * BlurFade — entrada suave "surgindo do desfoque" (estilo Magic UI), portada
 * para CSS puro (sem framer-motion, igual aos demais componentes desta pasta).
 *
 * A animação em si mora no globals.css (`.vw-blur-fade` + keyframe `vw-blur-fade`)
 * e respeita `prefers-reduced-motion`. Aqui só controlamos QUANDO ela dispara:
 * - `inView` (padrão): espera o elemento entrar na tela (IntersectionObserver) —
 *   para os produtos "surgirem" conforme o cliente rola a página.
 * - `inView={false}`: anima assim que monta (bom para banners que remontam por key).
 */

import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BlurFade({
  children,
  className,
  delay = 0,
  duration = 0.4,
  yOffset = 8,
  blur = "6px",
  inView = true,
  once = true,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Atraso antes de animar, em segundos (efeito escalonado numa grade). */
  delay?: number;
  /** Duração da animação, em segundos. */
  duration?: number;
  /** Quanto sobe ao aparecer (px). */
  yOffset?: number;
  /** Desfoque inicial (ex.: "10px"). */
  blur?: string;
  /** Esperar entrar na tela para animar (padrão true). */
  inView?: boolean;
  /** Animar só uma vez (padrão true). */
  once?: boolean;
  /** Tag do wrapper (padrão div). */
  as?: React.ElementType;
}) {
  // ref genérico (a tag do wrapper é configurável), por isso `any`.
  const ref = useRef<any>(null);
  const [shown, setShown] = useState(!inView);

  useEffect(() => {
    if (!inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          if (once) io.disconnect();
        } else if (!once) {
          setShown(false);
        }
      },
      // margem igual à referência (-50px): começa a animar um pouco antes de encostar na borda.
      { rootMargin: "-50px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, once]);

  return (
    <Tag
      ref={ref}
      className={cn(shown ? "vw-blur-fade" : "opacity-0", className)}
      style={
        {
          // +0.04s de base, igual à referência (transition.delay: 0.04 + delay).
          animationDelay: `${0.04 + delay}s`,
          animationDuration: `${duration}s`,
          "--vw-bf-y": `${yOffset}px`,
          "--vw-bf-blur": blur,
        } as React.CSSProperties
      }
    >
      {children}
    </Tag>
  );
}
