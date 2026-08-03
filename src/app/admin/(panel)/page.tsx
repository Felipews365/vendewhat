import Link from "next/link";
import {
  getClients,
  getAiUsageSummary,
  summarize,
  type AdminClient,
  type AiUsageSummary,
} from "@/lib/adminData";
import { formatBRL } from "@/lib/plans";
import { formatBrlCost } from "@/lib/aiPricing";
import { VERIFICATION_STATUS_LABEL, type VerificationStatus } from "@/lib/storeVerification";

export const dynamic = "force-dynamic";

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const s = VERIFICATION_STATUS_LABEL[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const diff = new Date(dateIso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateIso: string | null): string {
  if (!dateIso) return "—";
  return new Date(dateIso).toLocaleDateString("pt-BR");
}

function VencimentoBadge({ expiresAt }: { expiresAt: string | null }) {
  const d = daysUntil(expiresAt);
  if (d == null) {
    return <span className="text-slate-400 dark:text-slate-500">—</span>;
  }
  let cls = "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  let label = formatDate(expiresAt);
  if (d < 0) {
    cls = "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300";
    label = `Vencido há ${Math.abs(d)}d`;
  } else if (d <= 7) {
    cls = "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300";
    label = `Vence em ${d}d`;
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  trial: { label: "Teste", cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" },
  active: { label: "Ativo", cls: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  vitalicio: { label: "Vitalício", cls: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  past_due: { label: "Atrasado", cls: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  canceled: { label: "Cancelado", cls: "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" },
  expired: { label: "Expirado", cls: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300" },
};

function StatusBadge({ status }: { status: string | undefined }) {
  const s = STATUS_LABEL[status ?? ""] ?? { label: status ?? "Sem plano", cls: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${accent}`}>{value}</p>
    </div>
  );
}

function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR");
}

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-4 w-4",
  "aria-hidden": true,
} as const;

function EditIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  );
}

/** Bloco de MEDIÇÃO REAL do consumo da IA (valida "1 conversa ≈ 80 mil tokens"). */
function AiUsageMeasurement({ usage }: { usage: AiUsageSummary }) {
  if (!usage.measured) {
    return (
      <div className="mt-8 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Consumo real da IA (últimos {usage.days} dias)
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Ainda sem dados medidos. A medição começa automaticamente assim que a IA
          responder clientes. Se acabou de ativar, aplique a migration{" "}
          <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-xs text-slate-700 dark:text-slate-300">
            supabase-migration-ai-usage-events.sql
          </code>{" "}
          no Supabase para registrar o consumo.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-8 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Consumo real da IA (últimos {usage.days} dias)
        </h2>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {fmtInt(usage.responses)} respostas · {fmtInt(usage.conversations)} conversas medidas
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tokens por conversa (média)</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            {fmtInt(usage.avgTokensPerConversation)}
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {usage.usageVsBudgetPct}% dos 80 mil reservados
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Custo por conversa (média)</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            {formatBrlCost(usage.avgCostPerConversationBrl)}
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {fmtInt(usage.avgTokensPerResponse)} tokens/resposta
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Conversas por 80 mi (IA Completo)
          </p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {fmtInt(usage.conversationsPer80M)}
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            pela média real (promessa: ~1.000)
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Custo no período</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            {formatBrlCost(usage.cost.brl)}
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{fmtInt(usage.totalTokens)} tokens</p>
        </div>
      </div>
      {usage.cost.byModel.length > 0 && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Por modelo:{" "}
          {usage.cost.byModel
            .map((m) => `${m.model} ${formatBrlCost(m.brl)} (${fmtInt(m.responses)} resp.)`)
            .join(" · ")}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {usage.usageVsBudgetPct <= 100
          ? `Cada conversa real usa em média ${usage.usageVsBudgetPct}% da franquia de 80 mil tokens — a margem está segura e a promessa de ~1.000 conversas se sustenta (dá para ${fmtInt(usage.conversationsPer80M)}).`
          : `Atenção: a média real (${fmtInt(usage.avgTokensPerConversation)} tokens/conversa) está acima dos 80 mil reservados — reveja a franquia ou o número prometido de conversas.`}
      </p>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        Custo estimado pela tabela de preços da OpenAI, convertido a{" "}
        <strong className="text-slate-500 dark:text-slate-400">
          R$ {usage.usd.rate.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </strong>{" "}
        por dólar
        {usage.usd.source === "api" && usage.usd.spot != null ? (
          <>
            {" "}
            (dólar hoje R${" "}
            {usage.usd.spot.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} + IOF e spread do
            cartão)
          </>
        ) : (
          <>
            {" "}
            (cotação do dia indisponível — usando o valor fixo de{" "}
            <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-slate-600 dark:text-slate-300">AI_USD_BRL</code>)
          </>
        )}
        . Confira os preços vigentes da OpenAI antes de decidir preço de plano ou de pacote.
      </p>
    </div>
  );
}

/** Editar o cliente + abrir a vitrine. Usado na tabela (desktop) e nos cartões (celular). */
function ClientActions({ client, compact }: { client: AdminClient; compact?: boolean }) {
  const box = compact ? "h-8 w-8" : "h-10 w-10";
  const base = `inline-flex ${box} items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`;
  return (
    <div className="flex items-center gap-1.5">
      <Link
        href={`/admin/clientes/${client.store.id}`}
        title="Editar cliente"
        aria-label={`Editar ${client.store.name}`}
        className={`${base} hover:border-landing-primary hover:text-landing-primary focus-visible:outline-landing-primary`}
      >
        <EditIcon />
      </Link>
      <a
        href={`/loja/${client.store.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`Ver a loja /${client.store.slug}`}
        aria-label={`Abrir a loja ${client.store.name} em nova aba`}
        className={`${base} hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-emerald-500`}
      >
        <ExternalIcon />
      </a>
    </div>
  );
}

/** Saldo de conversas + gasto do mês + custo dos 30 dias. */
function AiSummary({ client }: { client: AdminClient }) {
  const ai = client.ai;
  if (!ai) return <span className="text-slate-400 dark:text-slate-500">—</span>;
  const tone =
    ai.conversationsLeft <= 0
      ? "text-red-600 dark:text-red-400"
      : ai.conversationsLeft <= 20
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className="flex flex-col leading-tight">
      <span className={`font-semibold ${tone}`}>{fmtInt(ai.conversationsLeft)} conv.</span>
      <span className="text-xs text-slate-400 dark:text-slate-500">
        {fmtInt(ai.usedConversations)} no mês
        {client.aiCost ? ` · ${formatBrlCost(client.aiCost.brl)} (30d)` : ""}
      </span>
    </div>
  );
}

function planLine(client: AdminClient): { title: string; amount: string } {
  const sub = client.subscription;
  const amount = sub?.amount != null ? Number(sub.amount) : null;
  return {
    title: client.planTitle ?? sub?.plan_id ?? "—",
    amount: amount != null ? `R$ ${formatBRL(amount)}/mês` : "—",
  };
}

/** Cartão de um cliente — versão de celular da tabela. */
function ClientCard({ client }: { client: AdminClient }) {
  const sub = client.subscription;
  const plan = planLine(client);
  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/clientes/${client.store.id}`}
            className="block truncate text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            {client.store.name}
          </Link>
          <div className="truncate text-xs text-slate-400 dark:text-slate-500">/{client.store.slug}</div>
        </div>
        <ClientActions client={client} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={sub?.status} />
        {sub?.status === "vitalicio" ? (
          <span className="inline-flex items-center rounded-full bg-purple-100 dark:bg-purple-500/15 px-2.5 py-1 text-xs font-semibold text-purple-700 dark:text-purple-300">
            Nunca vence
          </span>
        ) : (
          <VencimentoBadge expiresAt={sub?.expires_at ?? null} />
        )}
        <VerificationBadge status={client.verificationStatus} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Plano</dt>
          <dd className="truncate text-slate-700 dark:text-slate-300">{plan.title}</dd>
          <dd className="text-xs text-slate-400 dark:text-slate-500">{plan.amount}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">IA</dt>
          <dd>
            <AiSummary client={client} />
          </dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Dono</dt>
          <dd className="truncate text-slate-700 dark:text-slate-300">{client.ownerEmail ?? "—"}</dd>
          {client.store.phone && (
            <dd className="text-xs text-slate-400 dark:text-slate-500">{client.store.phone}</dd>
          )}
        </div>
      </dl>
    </li>
  );
}

export default async function AdminClientesPage() {
  const [clients, aiUsage] = await Promise.all([getClients(), getAiUsageSummary({ days: 30 })]);
  const { total, active, expired, mrr, aiUsed, aiLeft } = summarize(clients);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Clientes</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Todas as lojas da plataforma, com plano, status, vencimento e consumo da IA.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Clientes" value={String(total)} accent="text-slate-900 dark:text-slate-100" />
        <SummaryCard label="Ativos" value={String(active)} accent="text-emerald-600 dark:text-emerald-400" />
        <SummaryCard label="Vencidos / atrasados" value={String(expired)} accent="text-red-600 dark:text-red-400" />
        <SummaryCard label="Receita mensal (ativos)" value={`R$ ${formatBRL(mrr)}`} accent="text-landing-primary" />
        <SummaryCard label="Conversas IA (mês)" value={fmtInt(aiUsed)} accent="text-slate-900 dark:text-slate-100" />
        <SummaryCard label="Saldo IA (total)" value={fmtInt(aiLeft)} accent="text-emerald-600 dark:text-emerald-400" />
      </div>

      <AiUsageMeasurement usage={aiUsage} />

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        {/* Celular: um cartão por cliente (a tabela de 7 colunas não cabe). */}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 lg:hidden">
          {clients.length === 0 && (
            <li className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">
              Nenhuma loja encontrada.
            </li>
          )}
          {clients.map((c: AdminClient) => (
            <ClientCard key={c.store.id} client={c} />
          ))}
        </ul>

        <table className="hidden w-full table-fixed text-left text-sm lg:table">
          <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="w-[19%] px-4 py-3 font-semibold">Loja</th>
              <th className="w-[21%] px-4 py-3 font-semibold">Dono</th>
              <th className="w-[14%] px-4 py-3 font-semibold">Plano</th>
              <th className="w-[14%] px-4 py-3 font-semibold">Status</th>
              <th className="w-[11%] px-4 py-3 font-semibold">Verificação</th>
              <th className="w-[13%] px-4 py-3 font-semibold">IA</th>
              <th className="w-[8%] px-4 py-3 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">
                  Nenhuma loja encontrada.
                </td>
              </tr>
            )}
            {clients.map((c: AdminClient) => {
              const sub = c.subscription;
              const plan = planLine(c);
              return (
                <tr key={c.store.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/clientes/${c.store.id}`}
                      title={c.store.name}
                      className="block truncate font-semibold text-slate-900 dark:text-slate-100 hover:text-landing-primary"
                    >
                      {c.store.name}
                    </Link>
                    <div className="truncate text-xs text-slate-400 dark:text-slate-500">/{c.store.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="truncate text-slate-700 dark:text-slate-300" title={c.ownerEmail ?? undefined}>
                      {c.ownerEmail ?? "—"}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{c.store.phone ?? ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="truncate text-slate-700 dark:text-slate-300">{plan.title}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{plan.amount}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={sub?.status} />
                      {sub?.status === "vitalicio" ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Nunca vence</span>
                      ) : (
                        <VencimentoBadge expiresAt={sub?.expires_at ?? null} />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <VerificationBadge status={c.verificationStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <AiSummary client={c} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <ClientActions client={c} compact />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
