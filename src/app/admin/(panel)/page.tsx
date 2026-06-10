import Link from "next/link";
import { getClients, summarize, type AdminClient } from "@/lib/adminData";
import { formatBRL } from "@/lib/plans";

export const dynamic = "force-dynamic";

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
    return <span className="text-slate-400">—</span>;
  }
  let cls = "bg-emerald-100 text-emerald-700";
  let label = formatDate(expiresAt);
  if (d < 0) {
    cls = "bg-red-100 text-red-700";
    label = `Vencido há ${Math.abs(d)}d`;
  } else if (d <= 7) {
    cls = "bg-amber-100 text-amber-700";
    label = `Vence em ${d}d`;
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  trial: { label: "Teste", cls: "bg-slate-100 text-slate-600" },
  active: { label: "Ativo", cls: "bg-emerald-100 text-emerald-700" },
  vitalicio: { label: "Vitalício", cls: "bg-purple-100 text-purple-700" },
  past_due: { label: "Atrasado", cls: "bg-amber-100 text-amber-700" },
  canceled: { label: "Cancelado", cls: "bg-slate-200 text-slate-600" },
  expired: { label: "Expirado", cls: "bg-red-100 text-red-700" },
};

function StatusBadge({ status }: { status: string | undefined }) {
  const s = STATUS_LABEL[status ?? ""] ?? { label: status ?? "Sem plano", cls: "bg-slate-100 text-slate-500" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${accent}`}>{value}</p>
    </div>
  );
}

export default async function AdminClientesPage() {
  const clients = await getClients();
  const { total, active, expired, mrr } = summarize(clients);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clientes</h1>
      <p className="mt-1 text-sm text-slate-500">
        Todas as lojas da plataforma, com plano, status e vencimento.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Clientes" value={String(total)} accent="text-slate-900" />
        <SummaryCard label="Ativos" value={String(active)} accent="text-emerald-600" />
        <SummaryCard label="Vencidos / atrasados" value={String(expired)} accent="text-red-600" />
        <SummaryCard label="Receita mensal (ativos)" value={`R$ ${formatBRL(mrr)}`} accent="text-landing-primary" />
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Loja</th>
              <th className="px-4 py-3 font-semibold">Dono</th>
              <th className="px-4 py-3 font-semibold">Plano</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Vencimento</th>
              <th className="px-4 py-3 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Nenhuma loja encontrada.
                </td>
              </tr>
            )}
            {clients.map((c: AdminClient) => {
              const sub = c.subscription;
              const amount = sub?.amount != null ? Number(sub.amount) : null;
              return (
                <tr key={c.store.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/clientes/${c.store.id}`}
                      className="font-semibold text-slate-900 hover:text-landing-primary"
                    >
                      {c.store.name}
                    </Link>
                    <div className="text-xs text-slate-400">/{c.store.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-700">{c.ownerEmail ?? "—"}</div>
                    <div className="text-xs text-slate-400">{c.store.phone ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {c.planTitle ?? sub?.plan_id ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={sub?.status} />
                  </td>
                  <td className="px-4 py-3">
                    {sub?.status === "vitalicio" ? (
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
                        Nunca vence
                      </span>
                    ) : (
                      <VencimentoBadge expiresAt={sub?.expires_at ?? null} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">
                    {amount != null ? `R$ ${formatBRL(amount)}` : "—"}
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
