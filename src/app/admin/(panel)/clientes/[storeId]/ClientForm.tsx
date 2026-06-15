"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBRL } from "@/lib/plans";
import { useToast } from "@/components/Toast";
import type { PaymentRow, PlanRow, SubscriptionRow } from "@/lib/adminData";

const STATUS_OPTIONS = [
  { value: "trial", label: "Teste (7 dias)" },
  { value: "active", label: "Ativo" },
  { value: "vitalicio", label: "Vitalício (nunca vence)" },
  { value: "past_due", label: "Atrasado" },
  { value: "canceled", label: "Cancelado" },
  { value: "expired", label: "Expirado" },
];

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function plusDaysInput(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ClientForm({
  storeId,
  subscription,
  plans,
  payments,
}: {
  storeId: string;
  subscription: SubscriptionRow | null;
  plans: PlanRow[];
  payments: PaymentRow[];
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [planId, setPlanId] = useState(subscription?.plan_id ?? "");
  const [status, setStatus] = useState(subscription?.status ?? "trial");
  const [billingCycle, setBillingCycle] = useState(subscription?.billing_cycle ?? "monthly");
  const [amount, setAmount] = useState(
    subscription?.amount != null ? String(subscription.amount) : ""
  );
  const [expiresAt, setExpiresAt] = useState(
    subscription?.expires_at
      ? toDateInput(subscription.expires_at)
      : (subscription?.status ?? "trial") === "trial"
        ? plusDaysInput(7)
        : ""
  );
  const [notes, setNotes] = useState(subscription?.notes ?? "");
  const [savingSub, setSavingSub] = useState(false);
  const [subMsg, setSubMsg] = useState<string | null>(null);

  // Pagamento manual
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("pix");
  const [payPeriodEnd, setPayPeriodEnd] = useState(plusDaysInput(30));
  const [payNotes, setPayNotes] = useState("");
  const [savingPay, setSavingPay] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);

  function onPlanChange(value: string) {
    setPlanId(value);
    const p = plans.find((x) => x.id === value);
    if (p && !amount) setAmount(String(Number(p.monthly)));
  }

  function onStatusChange(value: string) {
    setStatus(value);
    // Teste já preenche o vencimento 7 dias à frente.
    if (value === "trial") setExpiresAt(plusDaysInput(7));
    // Vitalício nunca vence: limpa a data.
    if (value === "vitalicio") setExpiresAt("");
  }

  async function saveSubscription(e: React.FormEvent) {
    e.preventDefault();
    setSavingSub(true);
    setSubMsg(null);
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          planId: planId || null,
          status,
          billingCycle,
          amount: amount === "" ? null : amount,
          expiresAt: expiresAt || null,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao salvar.");
      setSubMsg("Assinatura salva.");
      showToast("Assinatura salva!");
      router.refresh();
    } catch (err) {
      setSubMsg(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSavingSub(false);
    }
  }

  async function registerPayment(e: React.FormEvent) {
    e.preventDefault();
    setSavingPay(true);
    setPayMsg(null);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          amount: payAmount,
          method: payMethod,
          periodEnd: payPeriodEnd || null,
          notes: payNotes || null,
          extendSubscription: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao registrar.");
      setPayMsg("Pagamento registrado e vencimento atualizado.");
      showToast("Pagamento registrado!");
      setPayAmount("");
      setPayNotes("");
      if (payPeriodEnd) setExpiresAt(payPeriodEnd);
      router.refresh();
    } catch (err) {
      setPayMsg(err instanceof Error ? err.message : "Erro ao registrar.");
    } finally {
      setSavingPay(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-landing-primary focus:ring-2 focus:ring-landing-primary/20";
  const labelCls = "text-sm font-semibold text-slate-700";

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {/* Assinatura */}
      <form
        onSubmit={saveSubscription}
        className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-bold text-slate-900">Assinatura</h2>
        {subscription?.gateway === "mercadopago" && (
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
            <span className="font-semibold">Assinatura automática (Mercado Pago)</span>
            {subscription.gateway_status && (
              <span className="ml-1">· status MP: {subscription.gateway_status}</span>
            )}
            {subscription.gateway_subscription_id && (
              <div className="mt-0.5 text-sky-600">
                id: {subscription.gateway_subscription_id}
              </div>
            )}
            <div className="mt-0.5 text-sky-600">
              Renovação e vencimento são atualizados pelo webhook do MP.
            </div>
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Plano</span>
            <select value={planId} onChange={(e) => onPlanChange(e.target.value)} className={inputCls}>
              <option value="">Sem plano</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} (R$ {formatBRL(Number(p.monthly))})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Status</span>
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
              className={inputCls}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Ciclo</span>
            <select
              value={billingCycle}
              onChange={(e) => setBillingCycle(e.target.value)}
              className={inputCls}
            >
              <option value="monthly">Mensal</option>
              <option value="annual">Anual</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Valor cobrado (R$)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputCls}
              placeholder="0,00"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>
              {status === "vitalicio" ? "Vencimento (vitalício)" : "Vencimento"}
            </span>
            {status === "vitalicio" ? (
              <input
                type="text"
                value="Nunca vence"
                disabled
                className={`${inputCls} cursor-not-allowed bg-slate-100 text-slate-500`}
              />
            ) : (
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={inputCls}
              />
            )}
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Observações</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </label>
        </div>
        {subMsg && <p className="mt-3 text-sm text-slate-600">{subMsg}</p>}
        <button
          type="submit"
          disabled={savingSub}
          className="mt-4 w-full rounded-xl bg-landing-primary py-3 font-bold text-white transition hover:bg-landing-primary-hover disabled:opacity-60"
        >
          {savingSub ? "Salvando…" : "Salvar assinatura"}
        </button>
      </form>

      {/* Pagamento manual + histórico */}
      <div className="space-y-6">
        <form
          onSubmit={registerPayment}
          className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-bold text-slate-900">Registrar pagamento</h2>
          <p className="mt-1 text-sm text-slate-500">
            Estende o vencimento para a data informada e marca como ativo.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Valor (R$)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className={inputCls}
                placeholder="0,00"
              />
            </label>
            <label className="block">
              <span className={labelCls}>Método</span>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={inputCls}>
                <option value="pix">Pix</option>
                <option value="manual">Manual</option>
                <option value="mercadopago">Mercado Pago</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className={labelCls}>Válido até (novo vencimento)</span>
              <input
                type="date"
                value={payPeriodEnd}
                onChange={(e) => setPayPeriodEnd(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelCls}>Observações</span>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          {payMsg && <p className="mt-3 text-sm text-slate-600">{payMsg}</p>}
          <button
            type="submit"
            disabled={savingPay}
            className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {savingPay ? "Registrando…" : "Registrar pagamento"}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Histórico de pagamentos</h2>
          {payments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Nenhum pagamento registrado.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <span className="font-semibold text-slate-800">R$ {formatBRL(Number(p.amount))}</span>
                    <span className="ml-2 text-xs text-slate-400">{p.method ?? "manual"}</span>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>{p.paid_at ? new Date(p.paid_at).toLocaleDateString("pt-BR") : "—"}</div>
                    {p.period_end && (
                      <div className="text-slate-400">
                        até {new Date(p.period_end).toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
