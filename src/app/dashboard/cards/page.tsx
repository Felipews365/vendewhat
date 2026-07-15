"use client";

/**
 * Página dedicada dos CARDS PROMOCIONAIS (a faixa colorida logo abaixo do
 * banner na loja pública). Ficava misturada com o editor do banner
 * (/dashboard/banner); virou aba própria porque é outra decisão do lojista —
 * o banner é a vitrine, os cards são atalhos de oferta.
 *
 * Toda loja já nasce com 3 cards prontos (`DEFAULT_PROMO_CARDS` em
 * storefront.ts): o lojista só troca os textos ou desmarca "Mostrar na loja".
 * Como lista vazia renasce com os modelos (`promoCardsFromDb`), apagar todos
 * NÃO esconde a faixa — quem some com ela é o interruptor `promoCardsEnabled`.
 *
 * Tudo mora no JSONB `stores.storefront`, sem migration.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_STOREFRONT,
  MAX_PROMO_CARDS,
  PROMO_CARD_COLORS,
  PROMO_CARD_PRESETS,
  type PromoCard,
  type StorefrontSettings,
  storefrontFromDb,
  storefrontToDb,
} from "@/lib/storefront";
import { AnnouncementText } from "@/components/storefront/AnnouncementBar";
import { useToast } from "@/components/Toast";

export default function PromoCardsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [sf, setSf] = useState<StorefrontSettings>(DEFAULT_STOREFRONT);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: store } = await supabase
        .from("stores")
        .select("id, storefront")
        .eq("user_id", user.id)
        .single();
      if (!store) {
        router.push("/dashboard");
        return;
      }
      setStoreId(store.id);
      setSf(storefrontFromDb(store.storefront));
      setLoading(false);
    }
    load();
  }, [router]);

  const cards = sf.promoCards;

  const addCard = (card: PromoCard) =>
    setSf((s) =>
      s.promoCards.length >= MAX_PROMO_CARDS
        ? s
        : { ...s, promoCards: [...s.promoCards, { ...card }] }
    );
  const patchCard = (i: number, patch: Partial<PromoCard>) =>
    setSf((s) => ({
      ...s,
      promoCards: s.promoCards.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    }));
  const removeCard = (i: number) =>
    setSf((s) => ({ ...s, promoCards: s.promoCards.filter((_, j) => j !== i) }));
  const moveCard = (i: number, dir: -1 | 1) =>
    setSf((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.promoCards.length) return s;
      const next = [...s.promoCards];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { ...s, promoCards: next };
    });

  async function save() {
    if (!storeId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("stores")
        .update({ storefront: storefrontToDb(sf) })
        .eq("id", storeId);
      if (error) {
        showToast("Erro ao salvar: " + error.message, "error");
        return;
      }
      showToast("Cards salvos!");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-500 dark:text-slate-400">
        Carregando…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Cards abaixo do banner
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          A faixa de cartões coloridos que aparece logo abaixo do banner da loja. Já vem
          pronta: troque os textos para o que a sua loja oferece, ou desmarque “Mostrar na
          loja” para escondê-la.
        </p>
      </div>

      {/* Prévia — mesma regra de cor da loja (com tema, gradiente do tema). */}
      <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-800/60">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Como fica na loja
        </p>
        {sf.promoCardsEnabled && cards.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {cards.map((c, i) => (
              <span
                key={i}
                className="relative flex min-h-[90px] flex-col justify-end overflow-hidden rounded-2xl p-3 sm:min-h-[110px] sm:p-5"
                style={{
                  backgroundImage: sf.themeId
                    ? `linear-gradient(135deg, ${sf.themeSecondary}, ${sf.themePrimary})`
                    : `linear-gradient(135deg, ${c.from}, ${c.to})`,
                }}
              >
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.15)_0%,transparent_50%)]" />
                <span className="relative z-10 block">
                  {c.eyebrow && (
                    <span className="mb-0.5 block text-[0.55rem] font-bold uppercase tracking-widest text-white/75 sm:text-[0.65rem]">
                      {c.eyebrow}
                    </span>
                  )}
                  <span className="block text-xs font-bold leading-snug text-white sm:text-base">
                    <AnnouncementText text={c.title} />
                  </span>
                  {c.subtitle && (
                    <span className="block text-[0.65rem] font-medium text-white/90 sm:text-sm">
                      {c.subtitle}
                    </span>
                  )}
                  {c.ctaLabel && (
                    <span className="mt-1 block text-[0.6rem] text-white/70 sm:text-xs">
                      {c.ctaLabel} →
                    </span>
                  )}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-white/70 p-4 text-center text-xs text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
            {sf.promoCardsEnabled
              ? "Nenhum card ainda — escolha um modelo abaixo."
              : "A faixa está escondida na loja."}
          </p>
        )}
      </div>

      {/* Interruptor: é AQUI que a loja diz "não quero" — apagar os cards não
          resolve, a lista vazia renasce com os modelos (`promoCardsFromDb`). */}
      <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <input
          type="checkbox"
          checked={sf.promoCardsEnabled}
          onChange={(e) => setSf((s) => ({ ...s, promoCardsEnabled: e.target.checked }))}
          className="h-5 w-5 accent-landing-primary"
        />
        <span>
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
            Mostrar os cards na loja
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            Desmarque se a sua loja não quer essa faixa.
          </span>
        </span>
      </label>

      {/* Modelos prontos + edição de cada card */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Seus cards ({cards.length}/{MAX_PROMO_CARDS})
        </p>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Toque num modelo pronto para adicionar mais um.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {PROMO_CARD_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addCard(p.card)}
              disabled={cards.length >= MAX_PROMO_CARDS}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span
                className="h-4 w-4 rounded"
                style={{ backgroundImage: `linear-gradient(135deg, ${p.card.from}, ${p.card.to})` }}
              />
              + {p.label}
            </button>
          ))}
        </div>

        {cards.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Nenhum card ainda. Escolha um modelo acima para começar.
          </p>
        ) : (
          <div className="space-y-4">
            {cards.map((card, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                    style={{ backgroundImage: `linear-gradient(135deg, ${card.from}, ${card.to})` }}
                  >
                    {card.title || card.eyebrow || `Card ${i + 1}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveCard(i, -1)}
                      disabled={i === 0}
                      className="h-7 w-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
                      aria-label="Subir"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCard(i, 1)}
                      disabled={i === cards.length - 1}
                      className="h-7 w-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
                      aria-label="Descer"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCard(i)}
                      className="h-7 w-7 rounded border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900"
                      aria-label="Remover"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Cor:</span>
                  {PROMO_CARD_COLORS.map((col) => {
                    const active = card.from === col.from && card.to === col.to;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => patchCard(i, { from: col.from, to: col.to })}
                        className={`h-6 w-6 rounded ${active ? "ring-2 ring-landing-primary ring-offset-1" : ""}`}
                        style={{ backgroundImage: `linear-gradient(135deg, ${col.from}, ${col.to})` }}
                        aria-label={`Cor ${col.id}`}
                      />
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field label="Etiqueta" value={card.eyebrow} placeholder="🔥 Imperdível" onChange={(v) => patchCard(i, { eyebrow: v })} />
                  <Field
                    label="Título"
                    value={card.title}
                    placeholder="Camisetas & Polos"
                    hint="Escreva **assim** para deixar um trecho em dourado. Ex.: Até **50% OFF**"
                    onChange={(v) => patchCard(i, { title: v })}
                  />
                  <Field label="Frase" value={card.subtitle} placeholder="A partir de R$ 39" onChange={(v) => patchCard(i, { subtitle: v })} />
                  <Field label="Texto do link" value={card.ctaLabel} placeholder="Explorar" onChange={(v) => patchCard(i, { ctaLabel: v })} />
                  <Field label="Link" value={card.href} placeholder="#catalogo" mono onChange={(v) => patchCard(i, { href: v })} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <Link
          href="/dashboard/configuracoes"
          className="flex-1 rounded-xl bg-slate-100 py-3 text-center font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
        >
          Voltar
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-xl bg-landing-primary py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  hint,
  mono = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 ${
          mono ? "font-mono" : ""
        }`}
      />
      {hint && (
        <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>
      )}
    </label>
  );
}
