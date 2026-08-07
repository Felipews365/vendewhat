"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { formatBrPhone } from "@/lib/customerPhone";
import {
  joinTag,
  splitTag,
  PALETTE_BY_ID,
  TAG_PALETTE,
  TAG_PRESETS,
} from "@/lib/crm/tags";
import { CRM_STAGES, type StageId } from "@/lib/crm/stages";

export type CrmCustomerDto = {
  id: string;
  phoneKey: string;
  phoneTail: string;
  waPhone: string;
  name: string;
  firstSeenAt: string;
  lastMessageAt: string | null;
  lastOrderAt: string | null;
  ordersCount: number;
  totalSpent: number;
  stage: StageId;
  stageChangedAt: string | null;
  tags: string[];
};

type OrderDto = {
  id: string;
  orderNumber: number;
  createdAt: string;
  subtotal: number;
  status: string;
  paymentStatus: string;
};

type MessageDto = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sender?: "customer" | "ai" | "owner";
};

type CartDto = { subtotal: number; updatedAt: string; recovered: boolean } | null;

type NoteDto = { id: string; body: string; created_at: string };
type TaskDto = { id: string; title: string; due_at: string; done_at: string | null };

/** Data de hoje em YYYY-MM-DD, para o valor inicial do <input type="date">. */
function todayInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Teto de etiquetas por conversa (mesmo do sanitizeTags no servidor). */
const MAX_TAGS = 8;

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CrmCustomerSheet({
  customerId,
  onClose,
  onChanged,
}: {
  customerId: string;
  onClose: () => void;
  /** Chamado quando algo muda (nome/etiqueta), para a lista recarregar. */
  onChanged?: () => void;
}) {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<CrmCustomerDto | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [cart, setCart] = useState<CartDto>(null);

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("blue");
  const [saving, setSaving] = useState(false);

  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [taskDraft, setTaskDraft] = useState("");
  const [taskDue, setTaskDue] = useState(todayInput());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/customer?id=${encodeURIComponent(customerId)}`);
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        customer?: Omit<CrmCustomerDto, "tags">;
        tags?: string[];
        orders?: OrderDto[];
        messages?: MessageDto[];
        cart?: CartDto;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.customer) {
        showToast(j.error ?? "Não foi possível abrir o cliente.", "error");
        onClose();
        return;
      }
      setCustomer({ ...j.customer, tags: j.tags ?? [] });
      setTags(j.tags ?? []);
      setOrders(j.orders ?? []);
      setMessages(j.messages ?? []);
      setCart(j.cart ?? null);
      setNameDraft(j.customer.name);
    } catch {
      showToast("Não foi possível abrir o cliente.", "error");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [customerId, onClose, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Anotações e lembretes vêm de rotas próprias e toleram a migration da fase
  // 4 ausente (devolvem lista vazia), então a ficha nunca deixa de abrir.
  const loadExtras = useCallback(async () => {
    const [nRes, tRes] = await Promise.all([
      fetch(`/api/crm/notes?customerId=${encodeURIComponent(customerId)}`),
      fetch(`/api/crm/tasks?customerId=${encodeURIComponent(customerId)}`),
    ]);
    const nJson = (await nRes.json().catch(() => ({}))) as { notes?: NoteDto[] };
    const tJson = (await tRes.json().catch(() => ({}))) as { tasks?: TaskDto[] };
    setNotes(nJson.notes ?? []);
    setTasks(tJson.tasks ?? []);
  }, [customerId]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  async function addNote() {
    const body = noteDraft.trim();
    if (body.length < 2) return;
    setNoteDraft("");
    const res = await fetch("/api/crm/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, body }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      showToast(j.error ?? "Não foi possível salvar a anotação.", "error");
      setNoteDraft(body);
      return;
    }
    await loadExtras();
  }

  async function removeNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await fetch("/api/crm/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, remove: true }),
    });
  }

  async function addTask() {
    const t = taskDraft.trim();
    if (t.length < 2) return;
    setTaskDraft("");
    const res = await fetch("/api/crm/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Meio-dia evita o lembrete "pular" de dia por causa do fuso.
      body: JSON.stringify({ customerId, title: t, dueAt: `${taskDue}T12:00:00` }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      showToast(j.error ?? "Não foi possível criar o lembrete.", "error");
      setTaskDraft(t);
      return;
    }
    showToast("Lembrete criado!");
    await loadExtras();
  }

  // Esc fecha; a rolagem do fundo trava enquanto a ficha está aberta.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function patch(body: { name?: string; tags?: string[]; stage?: StageId }) {
    if (!customer) return;
    setSaving(true);
    try {
      const res = await fetch("/api/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: customer.id, ...body }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        showToast(j.error ?? "Não foi possível salvar.", "error");
        return false;
      }
      onChanged?.();
      return true;
    } catch {
      showToast("Não foi possível salvar.", "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveName() {
    const clean = nameDraft.trim();
    const ok = await patch({ name: clean });
    if (ok) {
      setCustomer((c) => (c ? { ...c, name: clean } : c));
      setRenaming(false);
      showToast("Nome salvo!");
    }
  }

  async function saveTags(next: string[]) {
    const prev = tags;
    setTags(next); // otimista
    const ok = await patch({ tags: next });
    if (!ok) setTags(prev);
  }

  function addTag(name: string, colorId: string) {
    const clean = name.trim().slice(0, 22);
    if (!clean) return;
    if (tags.length >= MAX_TAGS) {
      showToast(`Máximo de ${MAX_TAGS} etiquetas por cliente.`, "error");
      return;
    }
    if (tags.some((t) => splitTag(t).name.toLowerCase() === clean.toLowerCase())) return;
    saveTags([...tags, joinTag(clean, colorId)]);
    setNewTagName("");
  }

  const phone = customer?.waPhone || customer?.phoneKey || "";

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-600/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Ficha do cliente"
      >
        {loading || !customer ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Carregando…
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="min-w-0">
                {renaming ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveName();
                        if (e.key === "Escape") {
                          setNameDraft(customer.name);
                          setRenaming(false);
                        }
                      }}
                      autoFocus
                      placeholder="Nome do cliente"
                      className="w-44 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={saveName}
                      disabled={saving}
                      className="text-sm font-semibold text-emerald-600 disabled:opacity-50"
                    >
                      Salvar
                    </button>
                  </div>
                ) : (
                  <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                    <span className="truncate">
                      {customer.name || formatBrPhone(customer.phoneKey)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRenaming(true)}
                      aria-label="Renomear cliente"
                      title="Renomear cliente"
                      className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      ✏️
                    </button>
                  </h2>
                )}
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {formatBrPhone(customer.phoneKey)} · cliente desde{" "}
                  {formatDate(customer.firstSeenAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {/* Números */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {customer.ordersCount}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    pedidos
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {formatBRL(customer.totalSpent)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    total gasto
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {customer.ordersCount > 0
                      ? formatBRL(customer.totalSpent / customer.ordersCount)
                      : "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    ticket médio
                  </div>
                </div>
              </div>

              {/* Etapa do funil — na ficha é um select (arrastar é coisa do kanban). */}
              <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  Etapa
                </span>
                <select
                  value={customer.stage}
                  onChange={async (e) => {
                    const stage = e.target.value as StageId;
                    const prev = customer.stage;
                    setCustomer((c) => (c ? { ...c, stage } : c));
                    const ok = await patch({ stage });
                    if (!ok) setCustomer((c) => (c ? { ...c, stage: prev } : c));
                  }}
                  className="ml-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {CRM_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Ações */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  href={`/dashboard/whatsapp?phone=${encodeURIComponent(phone.replace(/\D/g, ""))}`}
                  className="rounded-xl bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
                >
                  Abrir conversa
                </Link>
                <Link
                  href="/dashboard/pedidos"
                  className="rounded-xl bg-slate-100 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Ver pedidos
                </Link>
              </div>

              {/* Carrinho aberto */}
              {cart && !cart.recovered && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  🛒 Tem um carrinho de {formatBRL(cart.subtotal)} que não foi
                  finalizado ({formatDate(cart.updatedAt)}).
                </div>
              )}

              {/* Etiquetas */}
              <section className="mt-5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Etiquetas
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Só você vê. Servem para filtrar a sua base.
                </p>

                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tags.map((raw) => {
                      const { name, color } = splitTag(raw);
                      return (
                        <span
                          key={raw}
                          className={
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold " +
                            color.chip
                          }
                        >
                          <span className={"h-1.5 w-1.5 rounded-full " + color.dot} />
                          {name}
                          <button
                            type="button"
                            onClick={() => saveTags(tags.filter((t) => t !== raw))}
                            aria-label={`Remover etiqueta ${name}`}
                            className="ml-0.5 opacity-60 hover:opacity-100"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Prontas */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TAG_PRESETS.filter(
                    (p) =>
                      !tags.some(
                        (t) => splitTag(t).name.toLowerCase() === p.name.toLowerCase()
                      )
                  ).map((p) => {
                    const color = PALETTE_BY_ID[p.color];
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => addTag(p.name, p.color)}
                        className={
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold opacity-60 transition-opacity hover:opacity-100 " +
                          color.chip
                        }
                      >
                        <span className={"h-1.5 w-1.5 rounded-full " + color.dot} />+ {p.name}
                      </button>
                    );
                  })}
                </div>

                {/* Nova */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addTag(newTagName, newTagColor);
                    }}
                    maxLength={22}
                    placeholder="Nova etiqueta"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <div className="flex gap-1">
                    {TAG_PALETTE.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setNewTagColor(c.id)}
                        aria-label={`Cor ${c.id}`}
                        className={
                          "h-5 w-5 rounded-full " +
                          c.swatch +
                          (newTagColor === c.id
                            ? " ring-2 ring-slate-900 ring-offset-1 dark:ring-slate-100 dark:ring-offset-slate-900"
                            : "")
                        }
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addTag(newTagName, newTagColor)}
                    disabled={!newTagName.trim() || saving}
                    className="rounded-lg bg-landing-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Criar
                  </button>
                </div>
              </section>

              {/* Pedidos */}
              <section className="mt-6">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Pedidos ({orders.length})
                </h3>
                {orders.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Ainda não comprou. É um bom momento para oferecer algo.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {orders.slice(0, 10).map((o) => (
                      <li
                        key={o.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                      >
                        <span className="min-w-0">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            #{o.orderNumber}
                          </span>
                          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(o.createdAt)}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {o.paymentStatus === "pago" && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                              Pago
                            </span>
                          )}
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {formatBRL(o.subtotal)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Anotações — internas, nunca vão para o cliente */}
              <section className="mt-6">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Anotações
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Só você vê. O cliente nunca recebe isso.
                </p>

                <div className="mt-2 flex gap-2">
                  <input
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addNote();
                    }}
                    maxLength={2000}
                    placeholder="Ex.: prefere receber à tarde"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={addNote}
                    disabled={noteDraft.trim().length < 2}
                    className="rounded-lg bg-landing-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Salvar
                  </button>
                </div>

                {notes.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        className="flex items-start gap-2 rounded-xl bg-slate-50 p-2 text-xs dark:bg-slate-800"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                            {n.body}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-slate-400 dark:text-slate-500">
                            {formatDate(n.created_at)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeNote(n.id)}
                          aria-label="Apagar anotação"
                          className="shrink-0 text-slate-300 hover:text-rose-500 dark:text-slate-600"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Lembrete para este cliente */}
              <section className="mt-6">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Lembrete
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Aparece na aba Tarefas no dia escolhido.
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={taskDraft}
                    onChange={(e) => setTaskDraft(e.target.value)}
                    maxLength={200}
                    placeholder="Ex.: cobrar o pagamento"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <input
                    type="date"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                    aria-label="Para quando"
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={addTask}
                    disabled={taskDraft.trim().length < 2}
                    className="rounded-lg bg-landing-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Criar
                  </button>
                </div>

                {tasks.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {tasks.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"
                      >
                        <span className={t.done_at ? "line-through opacity-60" : ""}>
                          {t.title}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">
                          · {formatDate(t.due_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Conversa recente */}
              <section className="mt-6">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Conversa recente
                </h3>
                {messages.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Sem mensagens guardadas (o histórico fica por 30 dias).
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {messages.slice(-6).map((m, i) => (
                      <li
                        key={`${m.createdAt}-${i}`}
                        className={
                          "rounded-xl px-3 py-2 text-xs " +
                          (m.role === "user"
                            ? "bg-amber-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            : "bg-emerald-50 text-slate-700 dark:bg-emerald-950/30 dark:text-slate-200")
                        }
                      >
                        <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {m.role === "user"
                            ? "Cliente"
                            : m.sender === "owner"
                              ? "Você"
                              : "IA"}
                        </span>
                        <span className="line-clamp-3">{m.content}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
