"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { CRM_AUTOMATIONS, type RuleId } from "@/lib/crm/automations";

type Task = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  title: string;
  due_at: string;
  done_at: string | null;
  source: string;
};

type RuleState = { enabled: boolean; days: number };

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const today = startOfToday();
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today) / 86_400_000);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === -1) return "ontem";
  if (diff < 0) return `${Math.abs(diff)} dias atrás`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Data de hoje em YYYY-MM-DD, para o valor inicial do <input type="date">. */
function todayInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function CrmTasksClient() {
  const { showToast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [rules, setRules] = useState<Record<string, RuleState>>({});
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(todayInput());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, aRes] = await Promise.all([
        fetch("/api/crm/tasks"),
        fetch("/api/crm/automations"),
      ]);
      const tJson = (await tRes.json().catch(() => ({}))) as { tasks?: Task[] };
      const aJson = (await aRes.json().catch(() => ({}))) as {
        rules?: { rule_id: string; enabled: boolean; params: { days?: number } }[];
      };

      setTasks(tJson.tasks ?? []);

      const map: Record<string, RuleState> = {};
      for (const r of aJson.rules ?? []) {
        map[r.rule_id] = {
          enabled: Boolean(r.enabled),
          days: Number(r.params?.days ?? 0),
        };
      }
      setRules(map);
    } catch {
      showToast("Não foi possível carregar as tarefas.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function createTask() {
    setSaving(true);
    try {
      const res = await fetch("/api/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Meio-dia evita a tarefa "pular" de dia por causa do fuso.
        body: JSON.stringify({ title, dueAt: `${dueAt}T12:00:00` }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        showToast(j.error ?? "Não foi possível criar a tarefa.", "error");
        return;
      }
      setTitle("");
      showToast("Tarefa criada!");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(t: Task) {
    // Otimista: marcar tarefa precisa ser instantâneo.
    setTasks((prev) =>
      prev.map((x) =>
        x.id === t.id ? { ...x, done_at: t.done_at ? null : new Date().toISOString() } : x
      )
    );
    const res = await fetch("/api/crm/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, done: !t.done_at }),
    });
    if (!res.ok) {
      showToast("Não foi possível atualizar a tarefa.", "error");
      await load();
    }
  }

  async function removeTask(id: string) {
    setTasks((prev) => prev.filter((x) => x.id !== id));
    await fetch("/api/crm/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, remove: true }),
    });
  }

  async function saveRule(ruleId: RuleId, enabled: boolean, days?: number) {
    const prev = rules[ruleId];
    setRules((r) => ({
      ...r,
      [ruleId]: { enabled, days: days ?? prev?.days ?? 0 },
    }));
    const res = await fetch("/api/crm/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleId, enabled, days }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      showToast(j.error ?? "Não foi possível salvar.", "error");
      setRules((r) => ({ ...r, [ruleId]: prev ?? { enabled: false, days: 0 } }));
    }
  }

  const groups = useMemo(() => {
    const today = startOfToday();
    const out = {
      atrasadas: [] as Task[],
      hoje: [] as Task[],
      proximas: [] as Task[],
      concluidas: [] as Task[],
    };
    for (const t of tasks) {
      if (t.done_at) {
        out.concluidas.push(t);
        continue;
      }
      const d = new Date(t.due_at);
      d.setHours(0, 0, 0, 0);
      if (d.getTime() < today) out.atrasadas.push(t);
      else if (d.getTime() === today) out.hoje.push(t);
      else out.proximas.push(t);
    }
    return out;
  }, [tasks]);

  function Section({ label, items }: { label: string; items: Task[] }) {
    if (items.length === 0) return null;
    return (
      <section className="mt-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label} ({items.length})
        </h2>
        <ul className="mt-2 space-y-2">
          {items.map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <input
                type="checkbox"
                checked={Boolean(t.done_at)}
                onChange={() => toggleDone(t)}
                aria-label={t.done_at ? "Reabrir tarefa" : "Concluir tarefa"}
                className="mt-0.5 h-5 w-5 shrink-0 accent-landing-primary"
              />
              <div className="min-w-0 flex-1">
                <p
                  className={
                    "text-sm " +
                    (t.done_at
                      ? "text-slate-400 line-through dark:text-slate-500"
                      : "font-medium text-slate-900 dark:text-slate-100")
                  }
                >
                  {t.title}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {formatDue(t.due_at)}
                  {t.customer_name ? ` · ${t.customer_name}` : ""}
                  {t.source !== "manual" ? " · automático" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeTask(t.id)}
                aria-label="Apagar tarefa"
                className="shrink-0 text-slate-300 hover:text-rose-500 dark:text-slate-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <>
      {/* Nova tarefa */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) createTask();
            }}
            maxLength={200}
            placeholder="O que precisa ser feito?"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            aria-label="Para quando"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={createTask}
            disabled={saving || title.trim().length < 2}
            className="rounded-lg bg-landing-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      </div>

      {loading && (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Carregando…
        </p>
      )}

      {!loading && tasks.length === 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="text-4xl">✅</div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            Nenhuma tarefa. Anote o que não pode esquecer — cobrar um cliente,
            separar um pedido, ligar depois.
          </p>
        </div>
      )}

      <Section label="Atrasadas" items={groups.atrasadas} />
      <Section label="Hoje" items={groups.hoje} />
      <Section label="Próximas" items={groups.proximas} />
      <Section label="Concluídas" items={groups.concluidas.slice(0, 20)} />

      {/* Automações */}
      <section className="mt-8">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Automações
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Organizam sua base sozinhas. <strong>Nenhuma envia mensagem</strong> —
          elas só etiquetam clientes e criam tarefas para você.
        </p>

        <div className="mt-3 space-y-2">
          {CRM_AUTOMATIONS.map((rule) => {
            const state = rules[rule.id];
            const on = Boolean(state?.enabled);
            const days = state?.days || rule.daysParam?.default || 0;
            return (
              <div
                key={rule.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
              >
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => saveRule(rule.id, e.target.checked, days)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-landing-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {rule.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {rule.description}
                    </span>
                  </span>
                </label>

                {on && rule.daysParam && (
                  <div className="mt-3 flex items-center gap-2 pl-8">
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {rule.daysParam.label}:
                    </span>
                    <input
                      type="number"
                      min={rule.daysParam.min}
                      max={rule.daysParam.max}
                      value={days}
                      onChange={(e) =>
                        saveRule(rule.id, true, Number(e.target.value))
                      }
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
