"use client";

import { useState, useCallback } from "react";

function normalizeAdd(raw: string, existing: string[]): string | null {
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (existing.some((x) => x.toLowerCase() === lower)) return null;
  return t;
}

/**
 * Vendedor monta a lista de cores ou tamanhos; o cliente vê só listas na loja.
 */
/** Grupo de opções prontas para adicionar com 1 clique (ex.: tamanhos comuns). */
export type OptionPresetGroup = { label: string; values: string[] };

/** Tamanhos prontos para o vendedor montar rápido (letras, números e único). */
export const SIZE_PRESET_GROUPS: OptionPresetGroup[] = [
  { label: "Letras", values: ["PP", "P", "M", "G", "GG", "XG", "XGG"] },
  {
    label: "Números",
    values: ["36", "38", "40", "42", "44", "46", "48", "50"],
  },
  { label: "Único", values: ["Tamanho único"] },
];

export function ProductOptionsEditor({
  title,
  description,
  items,
  onItemsChange,
  placeholder = "Digite e adicione",
  addButtonLabel = "Adicionar",
  presetGroups,
}: {
  title: string;
  description: string;
  items: string[];
  onItemsChange: (next: string[]) => void;
  placeholder?: string;
  addButtonLabel?: string;
  /** Se informado, mostra chips prontos (clique adiciona/remove aquela opção). */
  presetGroups?: OptionPresetGroup[];
}) {
  const [draft, setDraft] = useState("");

  const add = useCallback(() => {
    const v = normalizeAdd(draft, items);
    if (!v) {
      setDraft("");
      return;
    }
    onItemsChange([...items, v]);
    setDraft("");
  }, [draft, items, onItemsChange]);

  const remove = useCallback(
    (index: number) => {
      onItemsChange(items.filter((_, i) => i !== index));
    },
    [items, onItemsChange]
  );

  /** Adiciona (se não existe) ou remove (se já existe) uma opção pronta. */
  const togglePreset = useCallback(
    (value: string) => {
      const lower = value.toLowerCase();
      const existsAt = items.findIndex((x) => x.toLowerCase() === lower);
      if (existsAt >= 0) {
        onItemsChange(items.filter((_, i) => i !== existsAt));
      } else {
        onItemsChange([...items, value]);
      }
    },
    [items, onItemsChange]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-transparent"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 px-4 py-2.5 rounded-lg bg-slate-100 text-slate-800 text-sm font-medium hover:bg-slate-200 transition-colors"
        >
          {addButtonLabel}
        </button>
      </div>

      {presetGroups && presetGroups.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-500">
            Ou toque em uma opção pronta para adicionar:
          </p>
          {presetGroups.map((group) => (
            <div key={group.label} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-400 mr-1">
                {group.label}:
              </span>
              {group.values.map((value) => {
                const active = items.some(
                  (x) => x.toLowerCase() === value.toLowerCase()
                );
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => togglePreset(value)}
                    aria-pressed={active}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-whatsapp text-white border-whatsapp"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {items.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-whatsapp/10 text-slate-800 text-sm border border-whatsapp/20"
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="w-7 h-7 rounded-full hover:bg-red-100 text-slate-500 hover:text-red-600 text-lg leading-none font-light"
                aria-label={`Remover ${item}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-slate-400 italic">
          Nenhuma opção ainda — o cliente não verá este campo na loja.
        </p>
      )}
    </div>
  );
}
