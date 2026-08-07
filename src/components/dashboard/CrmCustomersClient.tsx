"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { formatBrPhone } from "@/lib/customerPhone";
import { CRM_SEGMENTS, CRM_SORTS, segmentById, type SegmentId, type SortId } from "@/lib/crm/segments";
import { avatarText, normalizeSearch, splitTag } from "@/lib/crm/tags";
import { stageById } from "@/lib/crm/stages";
import CrmTabs from "@/components/dashboard/CrmTabs";
import CrmCharts, {
  type FunnelSlice,
  type TimelinePoint,
} from "@/components/dashboard/CrmCharts";
import CrmCustomerSheet, { type CrmCustomerDto } from "@/components/dashboard/CrmCustomerSheet";

type Stats = {
  total: number;
  novos30d: number;
  compradores: number;
  receita: number;
  ticketMedio: number;
  semTelefone: number;
};

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Valores grandes viram "R$ 12,4 mil" — o card é estreito no celular. */
function formatBRLCompact(v: number): string {
  if (v >= 1000) {
    const mil = v / 1000;
    return `R$ ${mil.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return formatBRL(v);
}

/** "hoje" / "ontem" / "há 12 dias" / "—". */
function sinceLabel(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(months / 12);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

/** A atividade mais recente do cliente (comprou ou falou). */
function lastActivity(c: CrmCustomerDto): string | null {
  const a = c.lastOrderAt ? new Date(c.lastOrderAt).getTime() : 0;
  const b = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
  const max = Math.max(a, b);
  return max > 0 ? new Date(max).toISOString() : null;
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      {hint && (
        <div className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
          {hint}
        </div>
      )}
    </div>
  );
}

/** Esqueleto de carregamento: mantém a altura da lista, sem "pulo" de layout. */
function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3.5 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
      </div>
      <div className="h-4 w-16 shrink-0 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

export default function CrmCustomersClient() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  const [customers, setCustomers] = useState<CrmCustomerDto[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelSlice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [segment, setSegment] = useState<SegmentId>("todos");
  const [sort, setSort] = useState<SortId>("recentes");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);

  // Deep link `?phone=` (do painel de conversas ou de Pedidos). Roda uma vez
  // só, para o recarregamento da lista não puxar o lojista de volta.
  const deepLinkRef = useRef(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/stats");
      const j = (await res.json().catch(() => ({}))) as {
        stats?: Stats | null;
        timeline?: TimelinePoint[];
        funnel?: FunnelSlice[];
      };
      setStats(j.stats ?? null);
      setTimeline(j.timeline ?? []);
      setFunnel(j.funnel ?? []);
    } catch {
      setStats(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ segment, sort });
      if (query.trim()) params.set("q", query.trim());
      if (tagFilter.length > 0) params.set("tags", tagFilter.join(","));

      const res = await fetch(`/api/crm/customers?${params}`);
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        customers?: CrmCustomerDto[];
        total?: number;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        showToast(j.error ?? "Não foi possível carregar os clientes.", "error");
        return;
      }
      setCustomers(j.customers ?? []);
      setTotal(j.total ?? 0);
    } catch {
      showToast("Não foi possível carregar os clientes.", "error");
    } finally {
      setLoading(false);
    }
  }, [segment, sort, query, tagFilter, showToast]);

  // A busca digita rápido: espera o lojista parar antes de bater na API.
  useEffect(() => {
    const t = setTimeout(load, query.trim() ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (deepLinkRef.current) return;
    const phone = searchParams.get("phone");
    if (!phone) return;
    deepLinkRef.current = true;
    (async () => {
      const res = await fetch(`/api/crm/customers?phone=${encodeURIComponent(phone)}`);
      const j = (await res.json().catch(() => ({}))) as { customers?: CrmCustomerDto[] };
      const hit = (j.customers ?? [])[0];
      if (hit) setOpenId(hit.id);
      else showToast("Esse contato ainda não está na sua base de clientes.", "error");
    })();
  }, [searchParams, showToast]);

  async function resync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/crm/sync", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        total?: number;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        showToast(j.error ?? "Não foi possível atualizar a base.", "error");
        return;
      }
      showToast(`Base atualizada: ${j.total ?? 0} cliente(s).`);
      await Promise.all([load(), loadStats()]);
    } catch {
      showToast("Não foi possível atualizar a base.", "error");
    } finally {
      setSyncing(false);
    }
  }

  // Etiquetas em uso, para os chips de filtro (na cor em que foram salvas).
  const tagOptions = useMemo(() => {
    // Acumula num array (em vez de espalhar o iterador do Map) porque o target
    // de TS do projeto não tem downlevelIteration.
    const seen = new Set<string>();
    const out: { name: string; color: ReturnType<typeof splitTag>["color"] }[] = [];
    for (const c of customers) {
      for (const raw of c.tags) {
        const { name, color } = splitTag(raw);
        if (name && !seen.has(name)) {
          seen.add(name);
          out.push({ name, color });
        }
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [customers]);

  function toggleTag(name: string) {
    const key = normalizeSearch(name);
    setTagFilter((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
    );
  }

  const filtering = query.trim().length > 0 || tagFilter.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Clientes</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Quem já comprou ou conversou com a sua loja, com o total gasto e o
            histórico num lugar só.
          </p>
        </div>
        <button
          type="button"
          onClick={resync}
          disabled={syncing}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {syncing ? "Atualizando…" : "Atualizar base"}
        </button>
      </div>

      <div className="mt-4">
        <CrmTabs />
      </div>

      {/* Números da base */}
      {stats && stats.total > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Clientes" value={String(stats.total)} />
          <StatCard
            label="Novos (30 dias)"
            value={String(stats.novos30d)}
            hint={stats.novos30d > 0 ? "entraram este mês" : undefined}
          />
          <StatCard
            label="Já compraram"
            value={String(stats.compradores)}
            hint={
              stats.total > 0
                ? `${Math.round((stats.compradores / stats.total) * 100)}% da base`
                : undefined
            }
          />
          <StatCard
            label="Receita"
            value={formatBRLCompact(stats.receita)}
            hint={
              stats.ticketMedio > 0
                ? `ticket ${formatBRL(stats.ticketMedio)}`
                : undefined
            }
          />
        </div>
      )}

      {/* Gráficos — só fazem sentido com base cadastrada */}
      {stats && stats.total > 0 && (
        <CrmCharts timeline={timeline} funnel={funnel} />
      )}

      {/* Busca + ordenação, na mesma linha */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            aria-label="Buscar cliente"
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-primary/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>

        {tagOptions.length > 0 && (
          <button
            type="button"
            onClick={() => setTagsOpen((v) => !v)}
            aria-expanded={tagsOpen}
            className={
              "shrink-0 rounded-full border px-3 py-2 text-sm font-semibold " +
              (tagFilter.length > 0
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800")
            }
          >
            🏷️{tagFilter.length > 0 ? ` ${tagFilter.length}` : ""}
          </button>
        )}

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortId)}
          aria-label="Ordenar clientes"
          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {CRM_SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Etiquetas (recolhidas por padrão, para não engolir a lista) */}
      {tagsOpen && tagOptions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          {tagOptions.map(({ name, color }) => {
            const on = tagFilter.includes(normalizeSearch(name));
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleTag(name)}
                aria-pressed={on}
                className={
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-opacity " +
                  color.chip +
                  (on ? " ring-2 ring-landing-primary/50" : " opacity-70 hover:opacity-100")
                }
              >
                <span className={"h-1.5 w-1.5 rounded-full " + color.dot} />
                {name}
              </button>
            );
          })}
          {tagFilter.length > 0 && (
            <button
              type="button"
              onClick={() => setTagFilter([])}
              className="ml-1 text-xs font-semibold text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Limpar
            </button>
          )}
        </div>
      )}

      {/* Segmentos — quebram linha em vez de rolar: barra de rolagem sob os
          chips fica feia e esconde as últimas opções de quem não arrasta. */}
      <div className="mt-3">
        <div className="flex flex-wrap gap-2">
          {CRM_SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSegment(s.id)}
              aria-pressed={segment === s.id}
              className={
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors " +
                (segment === s.id
                  ? "bg-landing-primary text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800")
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contagem / dica do segmento */}
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {loading
            ? "Carregando…"
            : `${total} cliente${total === 1 ? "" : "s"} · ${segmentById(segment).hint}`}
        </p>
        {/* Explica por que a conta não bate com a tela de Pedidos. */}
        {stats && stats.semTelefone > 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {stats.semTelefone} pedido{stats.semTelefone === 1 ? "" : "s"} sem
            telefone não entra{stats.semTelefone === 1 ? "" : "m"} aqui
          </p>
        )}
      </div>

      {/* Lista */}
      <div className="mt-2 space-y-2">
        {loading && customers.length === 0 && (
          <>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </>
        )}

        {!loading && customers.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="text-4xl">👥</div>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              {filtering
                ? "Nenhum cliente com esse filtro."
                : "Sua base ainda está vazia. Assim que alguém comprar na loja ou falar com você no WhatsApp, aparece aqui."}
            </p>
            {filtering ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setTagFilter([]);
                }}
                className="mt-4 text-sm font-semibold text-landing-primary underline"
              >
                Limpar busca e filtros
              </button>
            ) : (
              <button
                type="button"
                onClick={resync}
                disabled={syncing}
                className="mt-4 text-sm font-semibold text-landing-primary underline disabled:opacity-50"
              >
                Já tenho pedidos antigos — trazer para cá
              </button>
            )}
          </div>
        )}

        {customers.map((c) => {
          const activity = lastActivity(c);
          const stage = stageById(c.stage);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpenId(c.id)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-primary/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-slate-700 dark:text-emerald-300">
                {avatarText(c.name, c.phoneKey)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                    {c.name || formatBrPhone(c.phoneKey)}
                  </span>
                  {/* A etapa do funil diz mais que "recorrente": o nº de pedidos
                      logo abaixo já mostra a recompra. */}
                  <span
                    className={
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " +
                      stage.chip
                    }
                  >
                    {stage.label}
                  </span>
                </span>

                <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                  {/* Sem nome salvo, o título JÁ é o telefone — repetir aqui
                      só duplicaria a linha. */}
                  {c.name ? `${formatBrPhone(c.phoneKey)} · ` : ""}
                  {c.ordersCount} pedido{c.ordersCount === 1 ? "" : "s"} ·{" "}
                  {sinceLabel(activity)}
                </span>

                {c.tags.length > 0 && (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {c.tags.map((raw) => {
                      const { name, color } = splitTag(raw);
                      return (
                        <span
                          key={raw}
                          className={
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                            color.chip
                          }
                        >
                          <span className={"h-1.5 w-1.5 rounded-full " + color.dot} />
                          {name}
                        </span>
                      );
                    })}
                  </span>
                )}
              </span>

              <span className="shrink-0 text-right">
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                  {c.totalSpent > 0 ? formatBRL(c.totalSpent) : "—"}
                </span>
                <span className="block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  total gasto
                </span>
              </span>

              <span
                aria-hidden
                className="hidden shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 sm:block dark:text-slate-600"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </button>
          );
        })}
      </div>

      {openId && (
        <CrmCustomerSheet
          customerId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            load();
            loadStats();
          }}
        />
      )}
    </div>
  );
}
