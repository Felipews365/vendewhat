"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { storefrontFromDb } from "@/lib/storefront";

const CATEGORY_SPLIT_RE = /[,;/|]+/;

function mergeCategoryPool(fromProducts: string[], fromStorefront: string[]) {
  const map = new Map<string, string>();
  for (const raw of [...fromStorefront, ...fromProducts]) {
    const t = raw.trim();
    if (!t) continue;
    const k = t.toLocaleLowerCase("pt");
    if (!map.has(k)) map.set(k, t);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.localeCompare(b, "pt", { sensitivity: "base" })
  );
}

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  storeId: string | null;
  /** Incrementar após guardar categoria no modal para voltar a carregar sugestões. */
  suggestionsRefresh?: number;
  onOpenAdvanced: () => void;
  placeholder?: string;
};

export function CategoryAutocompleteField({
  id,
  value,
  onChange,
  storeId,
  suggestionsRefresh = 0,
  onOpenAdvanced,
  placeholder = "Digite ou escolha uma categoria",
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [pool, setPool] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!storeId) {
      setPool([]);
      return;
    }
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const fromProd = new Set<string>();

      const q = await supabase
        .from("products")
        .select("category")
        .eq("store_id", storeId)
        .limit(800);

      if (
        !q.error &&
        Array.isArray(q.data)
      ) {
        for (const row of q.data) {
          const c = (row as { category?: string | null }).category?.trim();
          if (!c) continue;
          for (const part of c.split(CATEGORY_SPLIT_RE)) {
            const t = part.trim();
            if (t) fromProd.add(t);
          }
        }
      }

      let fromSf: string[] = [];
      const storeRes = await supabase
        .from("stores")
        .select("storefront")
        .eq("id", storeId)
        .maybeSingle();

      if (!cancelled && storeRes.data) {
        try {
          const sf = storefrontFromDb(
            (storeRes.data as { storefront?: unknown }).storefront
          );
          fromSf = sf.categories.map((c) => c.label.trim()).filter(Boolean);
        } catch {
          fromSf = [];
        }
      }

      if (!cancelled) {
        setPool(mergeCategoryPool(Array.from(fromProd), fromSf));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storeId, suggestionsRefresh]);

  const filtered = useMemo(() => {
    const q = value.trim().toLocaleLowerCase("pt");
    if (!q) return pool.slice(0, 14);
    const hits = pool.filter((s) =>
      s.toLocaleLowerCase("pt").includes(q)
    );
    hits.sort((a, b) => {
      const al = a.toLocaleLowerCase("pt");
      const bl = b.toLocaleLowerCase("pt");
      const as = al.startsWith(q) ? 0 : 1;
      const bs = bl.startsWith(q) ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.localeCompare(b, "pt", { sensitivity: "base" });
    });
    return hits.slice(0, 20);
  }, [pool, value]);

  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  const pick = useCallback(
    (label: string) => {
      onChange(label);
      setOpen(false);
      setHighlight(0);
    },
    [onChange]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open || filtered.length === 0) {
        if (e.key === "ArrowDown" && pool.length > 0) {
          setOpen(true);
          setHighlight(0);
          e.preventDefault();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        pick(filtered[highlight]!);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [open, filtered, highlight, pick, pool.length]
  );

  /** Fecha só se o foco não foi para um botão da lista (evita perder o clique antes do click). */
  const closeIfFocusLeft = useCallback(() => {
    window.setTimeout(() => {
      const root = rootRef.current;
      const ae = document.activeElement;
      if (root && ae instanceof Node && root.contains(ae)) return;
      setOpen(false);
    }, 0);
  }, []);

  return (
    <div className="flex gap-2 items-stretch">
      <div ref={rootRef} className="relative flex-1 min-w-0">
        <input
          id={id}
          type="text"
          name="category"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={closeIfFocusLeft}
          onKeyDown={onKeyDown}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open && filtered.length > 0}
          aria-controls={listId}
          placeholder={placeholder}
          className="w-full rounded-full border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-landing-primary/35 focus:border-landing-primary"
        />
        {open && filtered.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-52 w-full touch-manipulation overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            {filtered.map((opt, i) => (
              <li key={`${opt}-${i}`} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  className={`w-full px-3 py-2 text-left text-sm ${
                    i === highlight
                      ? "bg-teal-50 text-landing-primary font-medium"
                      : "text-slate-800 hover:bg-slate-50"
                  }`}
                  onPointerDown={(e) => {
                    if (e.button !== 0 && e.button !== -1) return;
                    e.preventDefault();
                    pick(opt);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                >
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onOpenAdvanced}
        className="shrink-0 h-[42px] w-[42px] rounded-full bg-landing-primary text-white text-xl font-light leading-none shadow-md hover:opacity-90 transition-opacity flex items-center justify-center"
        title="Categoria com foto e hierarquia (loja)"
      >
        +
      </button>
    </div>
  );
}
