/**
 * Peças compartilhadas por TODOS os blocos da loja.
 *
 * Por que existir: mantém o espaçamento, a largura, o tratamento de imagem e
 * os estados vazios idênticos entre blocos — o lojista pode empilhar qualquer
 * combinação que o layout continua consistente e mobile-first.
 *
 * Nada aqui usa hooks/estado: os blocos funcionam como Server Components.
 */
import Image from "next/image";
import type { ReactNode } from "react";

/** Formata preço em R$ (pt-BR). Local para os blocos serem autossuficientes. */
export function formatMoneyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}

/**
 * Container padrão: mesma largura e respiro para todo bloco.
 * `tone`:
 *  - "plain"  → fundo branco (padrão)
 *  - "muted"  → fundo levemente cinza (para separar seções)
 *  - "brand"  → cor secundária da loja (texto claro)
 */
export function BlockContainer({
  children,
  tone = "plain",
  className = "",
}: {
  children: ReactNode;
  tone?: "plain" | "muted" | "brand";
  className?: string;
}) {
  const toneClass =
    tone === "brand"
      ? "text-white"
      : tone === "muted"
        ? "bg-stone-50"
        : "bg-white";
  const brandStyle =
    tone === "brand" ? { backgroundColor: "var(--store-secondary)" } : undefined;
  return (
    <section
      className={`w-full ${toneClass} ${className}`}
      style={brandStyle}
    >
      {/* Largura e padding iguais em todos os blocos → alinhamento consistente */}
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10 md:px-6 md:py-12">
        {children}
      </div>
    </section>
  );
}

/** Título de seção padronizado (usado por vitrine de categorias, grade, etc.). */
export function BlockHeading({
  title,
  align = "left",
}: {
  title?: string;
  align?: "left" | "center";
}) {
  if (!title?.trim()) return null;
  return (
    <h2
      className={`font-serif text-xl font-bold leading-tight text-stone-900 sm:text-2xl ${
        align === "center" ? "text-center" : ""
      }`}
    >
      {title.trim()}
    </h2>
  );
}

/**
 * Imagem com fallback embutido.
 * - Se `src` existir, usa next/image cobrindo o container (o pai define o tamanho).
 * - Sem `src`, mostra um placeholder bonito (gradiente + emoji) — nunca "quebra".
 * O container-pai DEVE ser `relative` com altura/aspect definido.
 */
export function BlockImage({
  src,
  alt = "",
  emoji = "🖼️",
  rounded = "",
  priority = false,
}: {
  src?: string | null;
  alt?: string;
  emoji?: string;
  rounded?: string;
  priority?: boolean;
}) {
  if (src && src.trim()) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        className={`object-cover ${rounded}`}
        priority={priority}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-stone-200 via-stone-100 to-stone-300 ${rounded}`}
    >
      <span className="text-4xl opacity-40 sm:text-5xl">{emoji}</span>
    </div>
  );
}

/**
 * Estado vazio padrão (quando o bloco não tem conteúdo suficiente para render).
 * Aparece SÓ na prévia do editor — na loja pública o bloco vazio é ocultado.
 */
export function BlockEmpty({
  emoji = "✨",
  title,
  hint,
}: {
  emoji?: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center">
      <span className="text-3xl opacity-50">{emoji}</span>
      <p className="mt-2 text-sm font-semibold text-stone-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

/**
 * Botão/link no estilo da loja. Usado por vários blocos para manter o CTA igual.
 * `variant`:
 *  - "primary"   → cor principal
 *  - "secondary" → cor secundária
 *  - "onDark"    → para fundos escuros (usa a cor principal, texto branco)
 */
export function BlockButton({
  href = "#catalogo",
  children,
  variant = "primary",
  className = "",
}: {
  href?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "onDark";
  className?: string;
}) {
  const bg =
    variant === "secondary" ? "var(--store-secondary)" : "var(--store-primary)";
  return (
    <a
      href={href || "#catalogo"}
      className={`inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-md transition-opacity hover:opacity-90 ${className}`}
      style={{ backgroundColor: bg }}
    >
      {children}
    </a>
  );
}

/** Selo pequeno reutilizável (badge de produto, "Modo teste", etc.). */
export function BlockBadge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}
