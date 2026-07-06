"use client";

import { useMemo } from "react";
import {
  buildVariantCombinations,
  variantStockKey,
} from "@/lib/productVariants";
import { hexForColorLabel, swatchNeedsStrongBorder } from "@/lib/colorSwatch";

/**
 * Grade de estoque: cada combinação cor × tamanho com quantidade própria.
 * Com cor E tamanho, agrupa por tamanho (mais fácil preencher "quantas de cada
 * cor" naquele tamanho). Com só uma dimensão, vira uma lista simples.
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

  const qtyFor = (color: string, size: string) =>
    value[variantStockKey(color, size)] ?? 0;

  const total = combos.reduce(
    (s, { color, size }) => s + qtyFor(color, size),
    0
  );

  const grouped = colors.length > 0 && sizes.length > 0;

  // Funções que retornam JSX (chamadas inline, NÃO usadas como <Componente/>)
  // para não criar um novo tipo de componente a cada render — o que remontaria
  // o <input> e faria ele perder o foco a cada dígito.

  /** Campo de quantidade reutilizado nos dois layouts. */
  const qtyInput = (color: string, size: string) => (
    <div className="flex items-center gap-2 shrink-0">
      <label className="text-xs text-slate-500 whitespace-nowrap">Qtd</label>
      <input
        type="number"
        min={0}
        value={qtyFor(color, size)}
        onChange={(e) => setQty(color, size, e.target.value)}
        className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm text-right focus:ring-2 focus:ring-whatsapp focus:border-transparent"
      />
    </div>
  );

  /** Bolinha da cor + nome (nos grupos por tamanho). */
  const colorLabel = (color: string) => {
    const swatch = hexForColorLabel(color);
    return (
      <span className="flex items-center gap-2 min-w-0">
        <span
          className={`h-4 w-4 rounded-full shrink-0 ${
            swatchNeedsStrongBorder(swatch) ? "border border-slate-300" : ""
          }`}
          style={{ background: swatch }}
        />
        <span className="text-sm text-slate-700 font-medium truncate">
          {color}
        </span>
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">
        Estoque por cor e tamanho
      </h3>
      <p className="text-xs text-slate-500 mt-1 mb-3 leading-relaxed">
        Informe quantas unidades você tem de cada combinação. Ex.: no tamanho P,
        Preto = 5, Marrom = 3, Laranja = 2. O cliente só consegue comprar até o
        limite de cada opção.
      </p>

      {grouped ? (
        <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
          {sizes.map((size) => {
            const subtotal = colors.reduce(
              (s, color) => s + qtyFor(color, size),
              0
            );
            return (
              <div key={size}>
                <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-200">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Tamanho {size}
                  </span>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                    {subtotal} un.
                  </span>
                </div>
                <div className="space-y-1.5">
                  {colors.map((color) => (
                    <div
                      key={`${size}-${color}`}
                      className="flex items-center justify-between gap-3"
                    >
                      {colorLabel(color)}
                      {qtyInput(color, size)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {combos.map(({ color, size }) => {
            const k = variantStockKey(color, size);
            const name = color || size || "—";
            return (
              <div
                key={k}
                className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0"
              >
                {color ? (
                  colorLabel(color)
                ) : (
                  <span className="text-sm text-slate-700 font-medium truncate min-w-0">
                    {name}
                  </span>
                )}
                {qtyInput(color, size)}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-3">
        Total geral:{" "}
        <span className="font-semibold text-slate-600">{total} un.</span>
      </p>
    </div>
  );
}
