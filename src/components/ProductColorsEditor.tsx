"use client";

import { useCallback, useState } from "react";
import { defaultPickerHex } from "@/lib/colorSwatch";
import { normalizeHex } from "@/lib/productColorHexes";

export type ColorOptionEntry = {
  name: string;
  hex: string;
};

/**
 * Cores do produto: nome + tom exato da bolinha na vitrine (<input type="color">).
 */
export function ProductColorsEditor({
  entries,
  onEntriesChange,
}: {
  entries: ColorOptionEntry[];
  onEntriesChange: (next: ColorOptionEntry[]) => void;
}) {
  const [draftName, setDraftName] = useState("");
  const [draftHex, setDraftHex] = useState("#64748b");

  const add = useCallback(() => {
    const name = draftName.trim();
    if (!name) return;
    const lower = name.toLowerCase();
    if (entries.some((e) => e.name.toLowerCase() === lower)) return;
    const hex = normalizeHex(draftHex);
    onEntriesChange([...entries, { name, hex }]);
    setDraftName("");
    setDraftHex("#64748b");
  }, [draftName, draftHex, entries, onEntriesChange]);

  const remove = useCallback(
    (index: number) => {
      onEntriesChange(entries.filter((_, i) => i !== index));
    },
    [entries, onEntriesChange]
  );

  const setEntryHex = useCallback(
    (index: number, hex: string) => {
      const next = entries.map((e, i) =>
        i === index ? { ...e, hex: normalizeHex(hex) } : e
      );
      onEntriesChange(next);
    },
    [entries, onEntriesChange]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">
          Cores disponíveis
        </h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Para cada cor, escolha o <strong>nome</strong> (como o cliente vê) e a{" "}
          <strong>tonalidade da bolinha</strong> na loja. Use o seletor para
          acertar o tom (ex.: vários beges ou azuis).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Nome da cor
          </label>
          <input
            type="text"
            value={draftName}
            onChange={(e) => {
              setDraftName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Ex.: Azul marinho"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-transparent"
          />
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Tom da bolinha
          </label>
          <div className="flex items-center gap-2 h-[42px]">
            <input
              type="color"
              value={normalizeHex(draftHex)}
              onChange={(e) => setDraftHex(normalizeHex(e.target.value))}
              className="h-10 w-14 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
              title="Escolher cor"
            />
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">
              {normalizeHex(draftHex)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!draftName.trim()) return;
            setDraftHex(defaultPickerHex(draftName.trim()));
          }}
          className="shrink-0 px-3 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50"
          title="Sugere um tom a partir do nome"
        >
          Sugerir
        </button>
        <button
          type="button"
          onClick={add}
          className="shrink-0 px-4 py-2.5 rounded-lg bg-slate-100 text-slate-800 text-sm font-medium hover:bg-slate-200 transition-colors"
        >
          Adicionar cor
        </button>
      </div>

      {entries.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {entries.map((entry, i) => (
            <li
              key={`${i}-${entry.name}`}
              className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
            >
              <input
                type="color"
                value={normalizeHex(entry.hex)}
                onChange={(e) => setEntryHex(i, e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-0.5 shrink-0"
                title="Tom na vitrine"
                aria-label={`Cor da bolinha para ${entry.name}`}
              />
              <input
                type="text"
                value={entry.name}
                onChange={(e) => {
                  const v = e.target.value;
                  onEntriesChange(
                    entries.map((row, j) =>
                      j === i ? { ...row, name: v } : row
                    )
                  );
                }}
                onBlur={() => {
                  const t = entry.name.trim();
                  if (!t) return;
                  const lower = t.toLowerCase();
                  if (
                    entries.some(
                      (e, j) =>
                        j !== i && e.name.trim().toLowerCase() === lower
                    )
                  ) {
                    return;
                  }
                  onEntriesChange(
                    entries.map((row, j) =>
                      j === i ? { ...row, name: t } : row
                    )
                  );
                }}
                className="flex-1 min-w-[120px] px-2 py-1.5 rounded border border-slate-200 text-sm bg-white"
                aria-label="Nome da cor"
              />
              <span className="text-[10px] font-mono text-slate-400 hidden md:inline">
                {normalizeHex(entry.hex)}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-auto w-8 h-8 rounded-full hover:bg-red-100 text-slate-500 hover:text-red-600 text-lg leading-none font-light shrink-0"
                aria-label={`Remover ${entry.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-slate-400 italic">
          Nenhuma cor — o cliente não escolhe cor neste produto.
        </p>
      )}
    </div>
  );
}
