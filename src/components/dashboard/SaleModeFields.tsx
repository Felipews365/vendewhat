"use client";

import type { SaleMode, PriceDisplay } from "@/lib/saleMode";

export type SaleModeValue = {
  saleMode: SaleMode;
  /** Strings porque vêm de <input>; convertidas ao salvar. */
  packSize: string;
  minQuantity: string;
  priceDisplay: PriceDisplay;
};

export const INITIAL_SALE_MODE: SaleModeValue = {
  saleMode: "unit",
  packSize: "",
  minQuantity: "",
  priceDisplay: "unit",
};

const OPTIONS: { value: SaleMode; title: string; desc: string }[] = [
  {
    value: "unit",
    title: "Por unidade",
    desc: "Venda normal, o cliente compra de 1 em 1.",
  },
  {
    value: "pack",
    title: "Só em fardo fechado",
    desc: "O cliente compra em múltiplos do fardo (ex.: 10, 20, 30…).",
  },
  {
    value: "min",
    title: "Quantidade mínima",
    desc: "Define um mínimo (ex.: 10) e depois vai de 1 em 1.",
  },
];

export function SaleModeFields({
  value,
  onChange,
}: {
  value: SaleModeValue;
  onChange: (patch: Partial<SaleModeValue>) => void;
}) {
  const numInputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-landing-primary/35";

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
        Tipo de venda
      </label>
      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const selected = value.saleMode === o.value;
          return (
            <label
              key={o.value}
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                selected
                  ? "border-landing-primary bg-teal-50/50 dark:border-violet-500 dark:bg-violet-950/30"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
              }`}
            >
              <input
                type="radio"
                name="vw-sale-mode"
                checked={selected}
                onChange={() => onChange({ saleMode: o.value })}
                className="mt-0.5 text-landing-primary focus:ring-landing-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {o.title}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  {o.desc}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {value.saleMode === "pack" && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Unidades por fardo
            </label>
            <input
              type="number"
              min={2}
              step={1}
              inputMode="numeric"
              value={value.packSize}
              onChange={(e) =>
                onChange({ packSize: e.target.value.replace(/\D/g, "") })
              }
              placeholder="Ex.: 10"
              className={numInputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Mostrar preço como
            </label>
            <select
              value={value.priceDisplay}
              onChange={(e) =>
                onChange({ priceDisplay: e.target.value as PriceDisplay })
              }
              className={numInputClass}
            >
              <option value="unit">Por unidade (R$/un.)</option>
              <option value="pack">Por fardo (total)</option>
            </select>
          </div>
          <p className="sm:col-span-2 text-[11px] text-slate-400">
            O <strong>preço</strong> que você digitou acima é sempre por unidade. O
            fardo é calculado (preço × unidades).
          </p>
        </div>
      )}

      {value.saleMode === "min" && (
        <div className="mt-3 max-w-[12rem]">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            Quantidade mínima
          </label>
          <input
            type="number"
            min={2}
            step={1}
            inputMode="numeric"
            value={value.minQuantity}
            onChange={(e) =>
              onChange({ minQuantity: e.target.value.replace(/\D/g, "") })
            }
            placeholder="Ex.: 10"
            className={numInputClass}
          />
        </div>
      )}
    </div>
  );
}

/** Converte os campos do formulário em colunas do banco (snake_case). */
export function saleModeToDbColumns(v: SaleModeValue): {
  sale_mode: SaleMode;
  pack_size: number | null;
  min_quantity: number | null;
  price_display: PriceDisplay;
} {
  const packSize = Math.max(2, parseInt(v.packSize || "0", 10) || 0);
  const minQuantity = Math.max(2, parseInt(v.minQuantity || "0", 10) || 0);
  if (v.saleMode === "pack") {
    return {
      sale_mode: "pack",
      pack_size: packSize,
      min_quantity: null,
      price_display: v.priceDisplay === "pack" ? "pack" : "unit",
    };
  }
  if (v.saleMode === "min") {
    return {
      sale_mode: "min",
      pack_size: null,
      min_quantity: minQuantity,
      price_display: "unit",
    };
  }
  return {
    sale_mode: "unit",
    pack_size: null,
    min_quantity: null,
    price_display: "unit",
  };
}
