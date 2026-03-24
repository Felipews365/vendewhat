"use client";

import { useMemo } from "react";
import {
  buildVariantCombinations,
  variantStockKey,
} from "@/lib/productVariants";

/**
 * Grade de estoque: cada combinação cor × tamanho com quantidade própria.
 */
export function VariantStockEditor({
  colors,
  sizes,
  value,
  onChange,
}: {
  colors: string[];
  sizes: string[];
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const combos = useMemo(
    () => buildVariantCombinations(colors, sizes),
    [colors, sizes]
  );

  if (combos.length === 0) return null;

  function setQty(color: string, size: string, raw: string) {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    const k = variantStockKey(color, size);
    onChange({ ...value, [k]: n });
  }

  function label(color: string, size: string) {
    const parts: string[] = [];
    if (color) parts.push(color);
    if (size) parts.push(size);
    return parts.join(" · ") || "—";
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">
        Estoque por cor e tamanho
      </h3>
      <p className="text-xs text-slate-500 mt-1 mb-3 leading-relaxed">
        Informe quantas unidades você tem de cada combinação. Ex.: Preto + P =
        5, Preto + M = 3, Preto + G = 2. O cliente só consegue comprar até o
        limite de cada opção.
      </p>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {combos.map(({ color, size }) => {
          const k = variantStockKey(color, size);
          const q = value[k] ?? 0;
          return (
            <div
              key={k}
              className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0"
            >
              <span className="text-sm text-slate-700 font-medium truncate min-w-0">
                {label(color, size)}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs text-slate-500 whitespace-nowrap">
                  Qtd
                </label>
                <input
                  type="number"
                  min={0}
                  value={q}
                  onChange={(e) => setQty(color, size, e.target.value)}
                  className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-right focus:ring-2 focus:ring-whatsapp focus:border-transparent"
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Total geral:{" "}
        <span className="font-semibold text-slate-600">
          {combos.reduce((s, { color, size }) => {
            const k = variantStockKey(color, size);
            return s + (value[k] ?? 0);
          }, 0)}{" "}
          un.
        </span>
      </p>
    </div>
  );
}
