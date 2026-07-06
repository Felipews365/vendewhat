"use client";

import { useCallback, useState } from "react";
import {
  defaultPickerHex,
  hexForColorLabel,
  swatchNeedsStrongBorder,
} from "@/lib/colorSwatch";
import { normalizeHex } from "@/lib/productColorHexes";

export type ColorOptionEntry = {
  name: string;
  hex: string;
};

/** Cores prontas para o vendedor adicionar com 1 clique (bolinha na cor certa). */
const COLOR_PRESETS: string[] = [
  "Preto",
  "Branco",
  "Cinza",
  "Bege",
  "Nude",
  "Marrom",
  "Vermelho",
  "Vinho",
  "Rosa",
  "Laranja",
  "Amarelo",
  "Verde",
  "Verde militar",
  "Azul",
  "Azul marinho",
  "Roxo",
];

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

  /** Adiciona (com a bolinha na cor certa) ou remove uma cor pronta. */
  const togglePreset = useCallback(
    (name: string) => {
      const lower = name.toLowerCase();
      const at = entries.findIndex((e) => e.name.toLowerCase() === lower);
      if (at >= 0) {
        onEntriesChange(entries.filter((_, i) => i !== at));
      } else {
        onEntriesChange([...entries, { name, hex: defaultPickerHex(name) }]);
      }
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
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-transparent"
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

      <div className="mt-3">
        <p className="text-xs text-slate-500 mb-2">
          Ou toque em uma cor pronta (a bolinha já vem na cor certa; dá para
          ajustar o tom depois):
        </p>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_PRESETS.map((name) => {
            const active = entries.some(
              (e) => e.name.toLowerCase() === name.toLowerCase()
            );
            const swatch = hexForColorLabel(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => togglePreset(name)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? "bg-whatsapp text-white border-whatsapp"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`h-4 w-4 rounded-full shrink-0 ${
                    swatchNeedsStrongBorder(swatch)
                      ? "border border-slate-300"
                      : ""
                  }`}
                  style={{ background: swatch }}
                />
                {name}
              </button>
            );
          })}
        </div>
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
                className="flex-1 min-w-[120px] px-2 py-1.5 rounded border border-slate-300 text-sm bg-white text-slate-900"
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
