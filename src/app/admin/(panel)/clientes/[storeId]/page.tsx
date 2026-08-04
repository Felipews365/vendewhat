import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllPlans,
  getAiUsageSummary,
  getClient,
  getStoreVerification,
  type AdminStoreWhatsapp,
  type AiUsageSummary,
} from "@/lib/adminData";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { loadCredits, TOKENS_PER_CONVERSATION } from "@/lib/aiCredits";
import { formatBrlCost } from "@/lib/aiPricing";
import { formatBrPhone, toWhatsAppNumber } from "@/lib/customerPhone";
import ClientForm from "./ClientForm";
import AiCreditsCard from "./AiCreditsCard";
import VerificationCard from "./VerificationCard";
import ResetConversationCard from "./ResetConversationCard";
import OpenDashboardCard from "./OpenDashboardCard";

export const dynamic = "force-dynamic";

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  trial: { label: "Em teste", cls: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" },
  active: { label: "Ativo", cls: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  vitalicio: { label: "Vitalício", cls: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  past_due: { label: "Atrasado", cls: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  canceled: { label: "Cancelado", cls: "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" },
  expired: { label: "Expirado", cls: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR");
}

/** Medição real do consumo da IA desta loja (últimos 30 dias). */
function StoreAiUsage({ usage }: { usage: AiUsageSummary }) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Consumo real da IA (últimos {usage.days} dias)
        </h2>
        {usage.measured && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {fmtInt(usage.responses)} respostas · {fmtInt(usage.conversations)} conversas
          </span>
        )}
      </div>
      {usage.measured ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tokens por conversa (média)</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {fmtInt(usage.avgTokensPerConversation)}
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {usage.usageVsBudgetPct}% dos 80 mil reservados
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tokens por resposta (média)</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {fmtInt(usage.avgTokensPerResponse)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Custo no período</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {formatBrlCost(usage.cost.brl)}
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {formatBrlCost(usage.avgCostPerConversationBrl)} por conversa ·{" "}
                {fmtInt(usage.totalTokens)} tokens
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Conversas por 80 mi (nesta média)
              </p>
              <p className="mt-1 text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {fmtInt(usage.conversationsPer80M)}
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">no ritmo desta loja</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {usage.usageVsBudgetPct <= 100
              ? `Esta loja usa em média ${usage.usageVsBudgetPct}% da franquia de 80 mil tokens por conversa — dentro do previsto.`
              : `Atenção: esta loja gasta em média ${fmtInt(usage.avgTokensPerConversation)} tokens/conversa, acima dos 80 mil reservados. Conversas mais longas/pesadas que a média.`}
          </p>
          {usage.cost.byModel.length > 0 && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Por modelo:{" "}
              {usage.cost.byModel
                .map((m) => `${m.model} ${formatBrlCost(m.brl)} (${fmtInt(m.responses)} resp.)`)
                .join(" · ")}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Ainda sem dados medidos para esta loja nos últimos {usage.days} dias.
        </p>
      )}
    </div>
  );
}

/**
 * WhatsApp de atendimento da loja (o número conectado na Evolution, onde a IA e
 * o lojista falam com os clientes) — não confundir com `stores.phone`, que é o
 * telefone que o DONO digitou no cadastro.
 */
function StoreWhatsapp({ whatsapp }: { whatsapp: AdminStoreWhatsapp | null }) {
  const number = whatsapp?.number ?? null;
  if (!number) {
    return (
      <span className="text-slate-400 dark:text-slate-500">
        {whatsapp ? "não conectado" : "nunca conectou"}
      </span>
    );
  }
  const connected = whatsapp?.status === "connected";
  return (
    <>
      <a
        href={`https://wa.me/${toWhatsAppNumber(number)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
      >
        {formatBrPhone(number)}
      </a>
      <span
        className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
          connected
            ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
        }`}
      >
        {connected ? (whatsapp?.aiEnabled ? "IA ligada" : "IA desligada") : "Desconectado"}
      </span>
    </>
  );
}

export default async function AdminClientePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const [client, plans, aiUsage, verification] = await Promise.all([
    getClient(storeId),
    getAllPlans(),
    getAiUsageSummary({ days: 30, storeId }),
    getStoreVerification(storeId),
  ]);

  if (!client) notFound();

  // Saldo de créditos da IA da loja (para o card de crédito manual).
  const db = createAdminSupabase();
  const credits = db ? await loadCredits(db, storeId) : null;

  const { store, ownerEmail, subscription, payments, whatsapp } = client;
  const planTitle = subscription?.plan_id
    ? plans.find((p) => p.id === subscription.plan_id)?.title ?? subscription.plan_id
    : null;
  const statusInfo =
    STATUS_INFO[subscription?.status ?? ""] ?? { label: "Sem plano", cls: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400" };
  const isTrial = subscription?.status === "trial";
  const isVitalicio = subscription?.status === "vitalicio";

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm font-semibold text-slate-500 dark:text-slate-400 transition hover:text-slate-900 dark:hover:text-slate-100"
      >
        ← Voltar para clientes
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{store.name}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {ownerEmail ?? "—"}
            {store.phone ? ` · ${store.phone}` : ""}
          </p>
          <p className="mt-1 text-sm">
            <span className="text-slate-400 dark:text-slate-500">WhatsApp do atendimento: </span>
            <StoreWhatsapp whatsapp={whatsapp} />
          </p>
        </div>
        <Link
          href={`/loja/${store.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Ver loja ↗
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Plano</p>
          <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">{planTitle ?? "Sem plano"}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Situação</p>
          <span
            className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusInfo.cls}`}
          >
            {statusInfo.label}
          </span>
        </div>
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {isVitalicio ? "Acesso" : isTrial ? "Teste até" : "Vencimento"}
          </p>
          <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">
            {isVitalicio ? "Nunca vence" : formatDate(subscription?.expires_at ?? null)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Valor</p>
          <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">
            {subscription?.amount != null ? `R$ ${Number(subscription.amount).toFixed(2).replace(".", ",")}` : "—"}
          </p>
        </div>
      </div>

      <OpenDashboardCard storeId={store.id} storeName={store.name} ownerEmail={ownerEmail} />

      {verification && <VerificationCard storeId={store.id} detail={verification} />}

      {credits && (
        <AiCreditsCard
          storeId={store.id}
          conversationsLeft={credits.conversationsLeft}
          creditConversations={Math.floor(credits.creditTokens / TOKENS_PER_CONVERSATION)}
          includedConversations={Math.floor(credits.includedTokens / TOKENS_PER_CONVERSATION)}
          usedConversations={Math.floor(credits.usedTokens / TOKENS_PER_CONVERSATION)}
        />
      )}

      <ResetConversationCard storeId={store.id} />

      <StoreAiUsage usage={aiUsage} />

      <ClientForm
        storeId={store.id}
        subscription={subscription}
        plans={plans}
        payments={payments}
      />
    </div>
  );
}
