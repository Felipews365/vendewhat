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
export function ProductOptionsEditor({
  title,
  description,
  items,
  onItemsChange,
  placeholder = "Digite e adicione",
  addButtonLabel = "Adicionar",
}: {
  title: string;
  description: string;
  items: string[];
  onItemsChange: (next: string[]) => void;
  placeholder?: string;
  addButtonLabel?: string;
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
          className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-transparent"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 px-4 py-2.5 rounded-lg bg-slate-100 text-slate-800 text-sm font-medium hover:bg-slate-200 transition-colors"
        >
          {addButtonLabel}
        </button>
      </div>

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
