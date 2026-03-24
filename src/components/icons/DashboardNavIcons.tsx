import type { SVGProps } from "react";

/** Traço grosso, só contorno — estilo “app roxo” (ícones brancos sobre fundo violeta). */
const s = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2.35,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export type NavGlyphProps = SVGProps<SVGSVGElement>;

function Shell({ className, children, ...rest }: NavGlyphProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Painel — grade 2×2 */
export function NavIconPainel(props: NavGlyphProps) {
  return (
    <Shell {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.75" {...s} />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.75" {...s} />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.75" {...s} />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.75" {...s} />
    </Shell>
  );
}

/** Loja / vitrine — toldo + fachada (inspirado no referencial) */
export function NavIconLoja(props: NavGlyphProps) {
  return (
    <Shell {...props}>
      <path
        d="M3 10.5c1.6-1.8 3.2-1.8 4.8 0s3.2-1.8 4.8 0 3.2-1.8 4.8 0 3.2-1.8 4.8 0"
        {...s}
      />
      <path d="M3 10.5h18v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 21.5v-11z" {...s} />
      <path d="M9 21.5v-6h6v6" {...s} />
    </Shell>
  );
}

/** Compartilhar — avião de papel */
export function NavIconCompartilhar(props: NavGlyphProps) {
  return (
    <Shell {...props}>
      <path d="M22 2 11 13" {...s} />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" {...s} />
    </Shell>
  );
}

/** Pedidos — prancheta com linhas */
export function NavIconPedidos(props: NavGlyphProps) {
  return (
    <Shell {...props}>
      <path
        d="M9 5h-.5a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 8.5 22h7a1.5 1.5 0 0 0 1.5-1.5v-14A1.5 1.5 0 0 0 15.5 5H15"
        {...s}
      />
      <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1H9V5z" {...s} />
      <circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="16" r="1.1" fill="currentColor" stroke="none" />
      <path d="M12.5 12H19M12.5 16H19" {...s} />
    </Shell>
  );
}

/** Conta — utilizador */
export function NavIconConta(props: NavGlyphProps) {
  return (
    <Shell {...props}>
      <circle cx="12" cy="8.5" r="4" {...s} />
      <path d="M5.5 21.5v-.5a6.5 6.5 0 0 1 13 0v.5" {...s} />
    </Shell>
  );
}

export const DASH_NAV_ICONS = {
  painel: NavIconPainel,
  loja: NavIconLoja,
  compartilhar: NavIconCompartilhar,
  pedidos: NavIconPedidos,
  conta: NavIconConta,
} as const;

export type DashNavIconKey = keyof typeof DASH_NAV_ICONS;
