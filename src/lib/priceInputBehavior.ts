import type { FocusEvent, MouseEvent } from "react";

/** Esconde setas do input numérico de preço. */
export const priceNumberNoSpinnerClass =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

/**
 * Ao sair do campo: normaliza para duas casas decimais (ex.: 33 → 33.00).
 * Vazio permanece vazio; valor inválido não é alterado.
 */
export function formatPriceInputOnBlur(raw: string): string {
  const s = raw.trim().replace(",", ".");
  if (s === "") return "";
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return raw;
  return n.toFixed(2);
}

export type PriceMoneyInputHandlersOptions = {
  /** Chamado quando o valor formatado difere do digitado (ex. acrescenta .00). */
  onCommitFormatted?: (value: string) => void;
};

/**
 * Facilita digitar preço: campo vazio → cursor no início; com valor → seleciona tudo para substituir rápido.
 * onMouseUp evita que o clique tire a seleção logo após o foco (comportamento comum no Chrome).
 */
export function priceMoneyInputHandlers(options?: PriceMoneyInputHandlersOptions) {
  return {
    onFocus: (e: FocusEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      requestAnimationFrame(() => {
        if (el.value === "") {
          try {
            el.setSelectionRange(0, 0);
          } catch {
            /* alguns browsers */
          }
        } else {
          el.select();
        }
      });
    },
    onMouseUp: (e: MouseEvent<HTMLInputElement>) => {
      e.preventDefault();
    },
    onBlur: (e: FocusEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      if (el.disabled) return;
      const next = formatPriceInputOnBlur(el.value);
      if (next !== el.value) {
        options?.onCommitFormatted?.(next);
      }
    },
  };
}
