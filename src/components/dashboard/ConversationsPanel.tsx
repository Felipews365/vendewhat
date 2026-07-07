"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";

type RecentCustomer = {
  customerPhone: string;
  lastMessage: string;
  lastAt: string;
};

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Props = {
  conversations: RecentCustomer[];
  /** Telefones (dígitos) com a IA pausada agora. */
  pausedPhones: Set<string>;
  /** WhatsApp da loja conectado (necessário para enviar). */
  connected: boolean;
  /** Chamado após enviar/pausar (para atualizar as pausas no pai). */
  onSent?: () => void;
};

// Tags prontas que aparecem como sugestão ao rotular a conversa.
const TAG_PRESETS = [
  "Novo",
  "Interessado",
  "Aguardando pagamento",
  "Pago",
  "Enviado",
  "VIP",
  "Sem resposta",
  "Problema",
];

const TAG_COLORS = [
  "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
];

function tagColor(t: string): string {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

/** Formata o telefone (dígitos) para leitura: (11) 99999-9999. */
function formatPhone(digits: string): string {
  let d = digits.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, today)) return "Hoje";
  if (same(d, yest)) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ConversationsPanel({
  conversations,
  pausedPhones,
  connected,
  onSent,
}: Props) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);

  // Tags por telefone (dígitos).
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});
  const [tagEditor, setTagEditor] = useState(false);
  const [newTag, setNewTag] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Carrega as tags de todas as conversas uma vez.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/whatsapp/tags", { cache: "no-store" });
        const data = await res.json();
        if (data?.ok && data.tags && typeof data.tags === "object") {
          setTagsMap(data.tags as Record<string, string[]>);
        }
      } catch {
        /* silencioso */
      }
    })();
  }, []);

  const loadThread = useCallback(
    async (phone: string, silent = false) => {
      if (!silent) setLoadingThread(true);
      try {
        const res = await fetch(
          `/api/whatsapp/conversation?phone=${encodeURIComponent(phone)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (data?.ok && Array.isArray(data.messages)) {
          setMessages(data.messages as ConversationMessage[]);
          scrollToBottom();
        }
      } catch {
        /* silencioso */
      } finally {
        if (!silent) setLoadingThread(false);
      }
    },
    [scrollToBottom]
  );

  // Ao selecionar um contato: carrega e começa a atualizar a cada 12s.
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setTagEditor(false);
    setNewTag("");
    if (!selected) {
      setMessages([]);
      return;
    }
    loadThread(selected);
    pollRef.current = setInterval(() => loadThread(selected, true), 12_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selected, loadThread]);

  const handleSend = useCallback(async () => {
    const phone = selected;
    const body = text.trim();
    if (!phone || !body || sending) return;
    if (!connected) {
      showToast("Conecte o WhatsApp da loja primeiro.", "error");
      return;
    }
    setSending(true);
    // Otimista.
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: body, createdAt: new Date().toISOString() },
    ]);
    setText("");
    scrollToBottom();
    try {
      const res = await fetch("/api/whatsapp/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, text: body }),
      });
      const data = await res.json();
      if (!data?.ok) {
        showToast(data?.error || "Não foi possível enviar.", "error");
        setText(body); // devolve o texto para reenviar
      } else {
        onSent?.();
        loadThread(phone, true);
      }
    } catch {
      showToast("Falha de conexão ao enviar.", "error");
      setText(body);
    } finally {
      setSending(false);
    }
  }, [selected, text, sending, connected, showToast, onSent, loadThread, scrollToBottom]);

  // Pausar / reativar a IA para o contato selecionado (até reativar).
  const togglePause = useCallback(
    async (phone: string, pause: boolean) => {
      if (pauseBusy) return;
      setPauseBusy(true);
      try {
        const res = await fetch("/api/whatsapp/pause", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: pause ? "pause" : "resume",
            scope: "customer",
            phone,
            minutes: null,
          }),
        });
        const data = await res.json();
        if (!data?.ok) {
          showToast(data?.error || "Não foi possível atualizar.", "error");
        } else {
          showToast(pause ? "IA pausada para este cliente." : "IA reativada.");
          onSent?.();
        }
      } catch {
        showToast("Falha de conexão.", "error");
      } finally {
        setPauseBusy(false);
      }
    },
    [pauseBusy, showToast, onSent]
  );

  // Salva as tags de uma conversa (otimista, com reversão em erro).
  const saveTags = useCallback(
    async (phone: string, tags: string[]) => {
      const prev = tagsMap[phone] ?? [];
      setTagsMap((m) => ({ ...m, [phone]: tags }));
      try {
        const res = await fetch("/api/whatsapp/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, tags }),
        });
        const data = await res.json();
        if (!data?.ok) {
          setTagsMap((m) => ({ ...m, [phone]: prev }));
          showToast(data?.error || "Não foi possível salvar a tag.", "error");
        } else if (Array.isArray(data.tags)) {
          setTagsMap((m) => ({ ...m, [phone]: data.tags as string[] }));
        }
      } catch {
        setTagsMap((m) => ({ ...m, [phone]: prev }));
        showToast("Falha de conexão ao salvar a tag.", "error");
      }
    },
    [tagsMap, showToast]
  );

  const addTag = useCallback(
    (phone: string, raw: string) => {
      const tag = raw.trim().slice(0, 30);
      if (!tag) return;
      const cur = tagsMap[phone] ?? [];
      if (cur.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
      saveTags(phone, [...cur, tag]);
    },
    [tagsMap, saveTags]
  );

  const removeTag = useCallback(
    (phone: string, tag: string) => {
      const cur = tagsMap[phone] ?? [];
      saveTags(
        phone,
        cur.filter((t) => t !== tag)
      );
    },
    [tagsMap, saveTags]
  );

  // --- Lista de conversas -----------------------------------------------------
  const list = (
    <div
      className={`${
        selected ? "hidden lg:flex" : "flex"
      } w-full lg:w-80 lg:shrink-0 flex-col border-stone-200 dark:border-slate-800 lg:border-r`}
    >
      <div className="border-b border-stone-100 px-4 py-3 dark:border-slate-800">
        <p className="text-sm font-semibold text-stone-700 dark:text-slate-200">
          Conversas
        </p>
      </div>
      {conversations.length > 0 ? (
        <ul className="flex-1 divide-y divide-stone-100 overflow-y-auto dark:divide-slate-800">
          {conversations.map((c) => {
            const active = c.customerPhone === selected;
            const paused = pausedPhones.has(c.customerPhone);
            const tags = tagsMap[c.customerPhone] ?? [];
            return (
              <li key={c.customerPhone}>
                <button
                  onClick={() => setSelected(c.customerPhone)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                    active
                      ? "bg-violet-50 dark:bg-slate-800"
                      : "hover:bg-stone-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700 dark:bg-slate-700 dark:text-violet-300">
                    {formatPhone(c.customerPhone).replace(/\D/g, "").slice(-2) || "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-stone-800 dark:text-slate-100">
                        {formatPhone(c.customerPhone)}
                      </span>
                      {paused && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                          você
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {c.lastMessage || "—"}
                    </span>
                    {tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tagColor(t)}`}
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-stone-500 dark:text-slate-400">
          Nenhuma conversa ainda. Quando um cliente falar com a loja, ela aparece
          aqui.
        </div>
      )}
    </div>
  );

  // --- Thread da conversa -----------------------------------------------------
  const selectedTags = selected ? tagsMap[selected] ?? [] : [];
  const selectedPaused = selected ? pausedPhones.has(selected) : false;

  const thread = (
    <div
      className={`${
        selected ? "flex" : "hidden lg:flex"
      } min-w-0 flex-1 flex-col`}
    >
      {selected ? (
        <>
          {/* Cabeçalho */}
          <div className="flex items-center gap-2 border-b border-stone-100 px-3 py-2.5 dark:border-slate-800">
            <button
              onClick={() => setSelected(null)}
              className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-100">
                {formatPhone(selected)}
              </p>
              <p className="text-xs text-stone-500 dark:text-slate-400">
                {selectedPaused
                  ? "IA pausada — você está atendendo"
                  : "IA atendendo"}
              </p>
            </div>
            <button
              onClick={() => togglePause(selected, !selectedPaused)}
              disabled={pauseBusy}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                selectedPaused
                  ? "bg-violet-600 text-white hover:bg-violet-700"
                  : "border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
              }`}
              title={
                selectedPaused
                  ? "Reativar a IA para este cliente"
                  : "Pausar a IA e atender você mesmo"
              }
            >
              {selectedPaused ? "Reativar IA" : "Pausar IA"}
            </button>
          </div>

          {/* Barra de tags */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-100 px-3 py-2 dark:border-slate-800">
            {selectedTags.map((t) => (
              <span
                key={t}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tagColor(t)}`}
              >
                {t}
                <button
                  onClick={() => removeTag(selected, t)}
                  className="opacity-70 hover:opacity-100"
                  aria-label={`Remover tag ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              onClick={() => setTagEditor((v) => !v)}
              className="rounded-full border border-dashed border-stone-300 px-2 py-0.5 text-[11px] font-medium text-stone-500 hover:bg-stone-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              {tagEditor ? "Fechar" : "+ Tag"}
            </button>
          </div>

          {tagEditor && (
            <div className="space-y-2 border-b border-stone-100 bg-stone-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex flex-wrap gap-1.5">
                {TAG_PRESETS.filter(
                  (t) => !selectedTags.some((x) => x.toLowerCase() === t.toLowerCase())
                ).map((t) => (
                  <button
                    key={t}
                    onClick={() => addTag(selected, t)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold opacity-80 transition hover:opacity-100 ${tagColor(t)}`}
                  >
                    + {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(selected, newTag);
                      setNewTag("");
                    }
                  }}
                  maxLength={30}
                  placeholder="Criar uma tag…"
                  className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-slate-900 placeholder:text-stone-400 focus:border-violet-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <button
                  onClick={() => {
                    addTag(selected, newTag);
                    setNewTag("");
                  }}
                  disabled={!newTag.trim()}
                  className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  Adicionar
                </button>
              </div>
            </div>
          )}

          {/* Mensagens */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-2 overflow-y-auto bg-stone-50 px-3 py-4 dark:bg-slate-950/40"
          >
            {loadingThread ? (
              <p className="py-8 text-center text-sm text-stone-400 dark:text-slate-500">
                Carregando…
              </p>
            ) : messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-400 dark:text-slate-500">
                Sem mensagens nesta conversa.
              </p>
            ) : (
              messages.map((m, i) => {
                const mine = m.role === "assistant";
                const prevDay = i > 0 ? formatDay(messages[i - 1].createdAt) : "";
                const day = formatDay(m.createdAt);
                const showDay = day && day !== prevDay;
                return (
                  <div key={i}>
                    {showDay && (
                      <div className="my-2 flex justify-center">
                        <span className="rounded-full bg-stone-200 px-3 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-slate-800 dark:text-slate-300">
                          {day}
                        </span>
                      </div>
                    )}
                    <div
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          mine
                            ? "rounded-br-sm bg-violet-600 text-white"
                            : "rounded-bl-sm bg-white text-stone-800 dark:bg-slate-800 dark:text-slate-100"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        <p
                          className={`mt-1 text-right text-[10px] ${
                            mine ? "text-violet-200" : "text-stone-400 dark:text-slate-500"
                          }`}
                        >
                          {formatTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Campo de envio */}
          <div className="border-t border-stone-100 p-3 dark:border-slate-800">
            {!connected && (
              <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                Conecte o WhatsApp da loja (aba Conexão) para responder.
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder="Escreva uma mensagem…"
                disabled={!connected || sending}
                className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-stone-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-stone-400 focus:border-violet-500 focus:outline-none disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                onClick={handleSend}
                disabled={!connected || sending || !text.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-50"
                aria-label="Enviar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-stone-400 dark:text-slate-500">
              Ao responder, a IA pausa para este cliente (você assumiu a conversa).
            </p>
          </div>
        </>
      ) : (
        <div className="hidden flex-1 items-center justify-center p-6 text-center text-sm text-stone-500 lg:flex dark:text-slate-400">
          Selecione uma conversa para ver as mensagens e responder.
        </div>
      )}
    </div>
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-[70vh] min-h-[26rem]">
        {list}
        {thread}
      </div>
    </section>
  );
}
