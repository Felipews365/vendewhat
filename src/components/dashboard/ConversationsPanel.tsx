"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";

type RecentCustomer = {
  customerPhone: string;
  lastMessage: string;
  lastAt: string;
  /** Nome salvo do cliente (de um pedido anterior), ou "" se ainda sem cadastro. */
  customerName?: string;
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

// --- Cores das etiquetas -----------------------------------------------------
// Cada etiqueta pode ter uma cor escolhida pelo lojista. A cor é guardada
// dentro da própria string ("Nome¦corId") — sem migration, pois a coluna já é
// uma lista de strings. Etiquetas antigas (sem separador) caem numa cor
// determinística pelo nome (hash), então nada quebra.
type TagColor = { id: string; dot: string; chip: string; swatch: string };

const TAG_PALETTE: TagColor[] = [
  { id: "red", dot: "bg-rose-500", chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300", swatch: "bg-rose-500" },
  { id: "orange", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", swatch: "bg-amber-500" },
  { id: "green", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300", swatch: "bg-emerald-500" },
  { id: "teal", dot: "bg-teal-500", chip: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300", swatch: "bg-teal-500" },
  { id: "blue", dot: "bg-sky-500", chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300", swatch: "bg-sky-500" },
  { id: "violet", dot: "bg-violet-500", chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300", swatch: "bg-violet-500" },
  { id: "pink", dot: "bg-fuchsia-500", chip: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300", swatch: "bg-fuchsia-500" },
  { id: "gray", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", swatch: "bg-slate-400" },
];

const PALETTE_BY_ID: Record<string, TagColor> = Object.fromEntries(
  TAG_PALETTE.map((c) => [c.id, c])
);

// Etiquetas prontas (nome + cor), no estilo da referência.
const TAG_PRESETS: { name: string; color: string }[] = [
  { name: "Urgente", color: "red" },
  { name: "Cliente novo", color: "green" },
  { name: "Interessado", color: "blue" },
  { name: "Aguardando pagamento", color: "orange" },
  { name: "Pago", color: "teal" },
  { name: "Sem resposta", color: "gray" },
];

const TAG_SEP = "¦"; // separador nome¦cor (não digitável no teclado comum)

// Até esta quantidade os chips do filtro ficam à mostra; acima disso eles se
// recolhem atrás do botão "Filtrar por etiqueta" para não engolir a lista.
const TAG_FILTER_INLINE_MAX = 5;

// Durações da pausa da IA (minutes null = até o lojista reativar).
const PAUSE_DURATIONS: { label: string; minutes: number | null }[] = [
  { label: "15 minutos", minutes: 15 },
  { label: "30 minutos", minutes: 30 },
  { label: "1 hora", minutes: 60 },
  { label: "3 horas", minutes: 180 },
  { label: "1 dia", minutes: 1440 },
  { label: "Até eu reativar", minutes: null },
];

function hashColorId(t: string): string {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length].id;
}

/** Separa a string guardada em { nome, cor }. */
function splitTag(raw: string): { name: string; color: TagColor } {
  const i = raw.lastIndexOf(TAG_SEP);
  if (i === -1) return { name: raw, color: PALETTE_BY_ID[hashColorId(raw)] };
  const name = raw.slice(0, i);
  const colorId = raw.slice(i + 1);
  return { name, color: PALETTE_BY_ID[colorId] ?? PALETTE_BY_ID[hashColorId(name)] };
}

/** Monta a string guardada a partir do nome + cor. */
function joinTag(name: string, colorId: string): string {
  return `${name}${TAG_SEP}${colorId}`;
}

/** Minúsculas e sem acento, para a busca casar "João" com "joao". */
function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Formata o telefone (dígitos) para leitura: (11) 99999-9999. */
function formatPhone(digits: string): string {
  let d = digits.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

/** Iniciais para o avatar: do nome, ou os 2 últimos dígitos do telefone. */
function avatarText(name: string, phone: string): string {
  const n = name.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    const s = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
    if (s) return s.toUpperCase();
  }
  return phone.replace(/\D/g, "").slice(-2) || "?";
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

/** Data curta para a lista de conversas: "Hoje" / "Ontem" / "08 de jul.". */
function formatListDay(iso: string): string {
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
    month: "short",
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
  const [query, setQuery] = useState("");
  // Etiquetas marcadas no filtro da lista (por nome).
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  // Chips do filtro à mostra (só importa quando há muitas etiquetas).
  const [tagsShown, setTagsShown] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);

  // Tags por telefone (dígitos). Cada valor é a string guardada ("Nome¦corId").
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("blue");
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);

  // Nome renomeado pelo lojista (sobrepõe o nome vindo de pedidos). Override
  // local para refletir na hora, antes do recarregamento do pai.
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Nome do contato por telefone (dígitos), a partir das conversas recebidas.
  const nameByPhone: Record<string, string> = {};
  for (const c of conversations) {
    if (c.customerName) nameByPhone[c.customerPhone] = c.customerName;
  }
  // Nome exibido: override local (renomeação recente) tem prioridade.
  const nameFor = (phone: string): string =>
    (nameOverrides[phone] ?? nameByPhone[phone] ?? "").trim();

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
          const next = data.messages as ConversationMessage[];
          // Só rola para o fim quando chegam mensagens novas (ou no 1º load) —
          // assim o polling frequente não atrapalha quem está lendo o histórico.
          setMessages((prev) => {
            if (!silent || next.length > prev.length) scrollToBottom();
            return next;
          });
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
    setTagMenuOpen(false);
    setNewTagName("");
    setNewTagColor("blue");
    setPauseMenuOpen(false);
    setRenaming(false);
    setRenameValue("");
    if (!selected) {
      setMessages([]);
      return;
    }
    loadThread(selected);
    // Atualiza a conversa aberta a cada 4s (quase ao vivo) para o lojista
    // acompanhar/assumir o atendimento em tempo real.
    pollRef.current = setInterval(() => loadThread(selected, true), 4_000);
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
    async (phone: string, pause: boolean, minutes: number | null = null) => {
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
            minutes: pause ? minutes : null,
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
          showToast(data?.error || "Não foi possível salvar a etiqueta.", "error");
        } else if (Array.isArray(data.tags)) {
          setTagsMap((m) => ({ ...m, [phone]: data.tags as string[] }));
        }
      } catch {
        setTagsMap((m) => ({ ...m, [phone]: prev }));
        showToast("Falha de conexão ao salvar a etiqueta.", "error");
      }
    },
    [tagsMap, showToast]
  );

  const addTag = useCallback(
    (phone: string, name: string, colorId: string) => {
      // Teto de 22 p/ o nome: nome + "¦" + corId (até 6) cabe no cap de 30 do servidor.
      const clean = name.trim().slice(0, 22);
      if (!clean) return;
      const cur = tagsMap[phone] ?? [];
      if (cur.some((t) => splitTag(t).name.toLowerCase() === clean.toLowerCase())) return;
      saveTags(phone, [...cur, joinTag(clean, colorId)]);
    },
    [tagsMap, saveTags]
  );

  const removeTag = useCallback(
    (phone: string, raw: string) => {
      const cur = tagsMap[phone] ?? [];
      saveTags(
        phone,
        cur.filter((t) => t !== raw)
      );
    },
    [tagsMap, saveTags]
  );

  // Renomeia o contato (nome vazio limpa e volta a usar o do pedido/telefone).
  const saveName = useCallback(
    async (phone: string, name: string) => {
      const clean = name.trim().slice(0, 80);
      setRenameBusy(true);
      // Otimista: mostra o novo nome na hora ("" = remove o override).
      setNameOverrides((m) => ({ ...m, [phone]: clean }));
      try {
        const res = await fetch("/api/whatsapp/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, name: clean }),
        });
        const data = await res.json();
        if (!data?.ok) {
          showToast(data?.error || "Não foi possível salvar o nome.", "error");
        } else {
          setNameOverrides((m) => ({ ...m, [phone]: String(data.name ?? "") }));
          showToast(clean ? "Nome salvo!" : "Nome removido.");
          setRenaming(false);
          onSent?.();
        }
      } catch {
        showToast("Falha de conexão ao salvar o nome.", "error");
      } finally {
        setRenameBusy(false);
      }
    },
    [showToast, onSent]
  );

  // --- Busca e filtro por etiqueta --------------------------------------------
  // Etiquetas em uso nas conversas (por nome, sem repetir), para os chips do filtro.
  const tagFilterOptions = useMemo(() => {
    const byName = new Map<string, TagColor>();
    for (const c of conversations) {
      for (const raw of tagsMap[c.customerPhone] ?? []) {
        const { name, color } = splitTag(raw);
        if (name && !byName.has(name)) byName.set(name, color);
      }
    }
    const out: { name: string; color: TagColor }[] = [];
    byName.forEach((color, name) => out.push({ name, color }));
    return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [conversations, tagsMap]);

  const manyTags = tagFilterOptions.length > TAG_FILTER_INLINE_MAX;

  // Casa por nome, telefone (dígitos ou formatado), última mensagem e etiquetas.
  // O filtro de etiquetas é "E" com a busca, e "OU" entre as etiquetas marcadas.
  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    return conversations.filter((c) => {
      const tagNames = (tagsMap[c.customerPhone] ?? []).map((t) => splitTag(t).name);
      if (tagFilter.size > 0 && !tagNames.some((t) => tagFilter.has(t))) return false;
      if (!q) return true;
      const name = (nameOverrides[c.customerPhone] ?? c.customerName ?? "").trim();
      const haystack = normalizeSearch(
        [name, formatPhone(c.customerPhone), c.lastMessage, ...tagNames].join(" ")
      );
      if (haystack.includes(q)) return true;
      // Telefone: compara só os dígitos, então "8199" acha "(81) 99999-…".
      const qDigits = q.replace(/\D/g, "");
      return qDigits.length > 0 && c.customerPhone.replace(/\D/g, "").includes(qDigits);
    });
  }, [conversations, query, tagFilter, nameOverrides, tagsMap]);

  // --- Lista de conversas -----------------------------------------------------
  const list = (
    <div
      className={`${
        selected ? "hidden lg:flex" : "flex"
      } w-full lg:w-96 lg:shrink-0 flex-col border-stone-200 dark:border-slate-800 lg:border-r`}
    >
      <div className="border-b border-stone-100 px-4 py-3 dark:border-slate-800">
        <p className="text-sm font-semibold text-stone-700 dark:text-slate-200">
          Conversas
        </p>

        {/* Busca: nome, telefone, última mensagem e etiquetas */}
        <div className="relative mt-2">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-slate-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar conversa"
            aria-label="Pesquisar conversa"
            className="w-full rounded-full border border-stone-200 bg-stone-50 py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-stone-400 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-200 hover:text-stone-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            >
              ×
            </button>
          )}
        </div>

        {/* Filtro por etiqueta: chips à mostra; muitos, recolhidos num botão */}
        {tagFilterOptions.length === 0 ? (
          // Sem etiqueta em nenhuma conversa não há o que filtrar — mas sem esta
          // dica o recurso fica invisível e parece que não existe.
          <p className="mt-2 text-[11px] text-stone-400 dark:text-slate-500">
            Sem etiquetas ainda. Abra uma conversa e use o 🏷️ no topo para criar
            — depois elas viram filtro aqui.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {manyTags ? (
              <button
                type="button"
                onClick={() => setTagsShown((v) => !v)}
                aria-expanded={tagsShown}
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition " +
                  (tagFilter.size > 0
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-stone-200 text-stone-500 hover:bg-stone-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800")
                }
              >
                <span aria-hidden>🏷️</span>
                Filtrar por etiqueta
                {tagFilter.size > 0 && ` (${tagFilter.size})`}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={tagsShown ? "rotate-180" : ""}
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                Filtrar:
              </span>
            )}

            {(!manyTags || tagsShown) &&
              tagFilterOptions.map(({ name, color }) => {
                const on = tagFilter.has(name);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setTagFilter((prev) => {
                        const next = new Set(prev);
                        if (next.has(name)) next.delete(name);
                        else next.add(name);
                        return next;
                      })
                    }
                    className={
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition " +
                      color.chip +
                      " " +
                      (on
                        ? "ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-slate-900"
                        : "opacity-70 hover:opacity-100")
                    }
                  >
                    <span className={`h-2 w-2 rounded-full ${color.dot}`} />
                    {name}
                  </button>
                );
              })}

            {tagFilter.size > 0 && (
              <button
                type="button"
                onClick={() => setTagFilter(new Set())}
                className="rounded-full px-2 py-1 text-[11px] font-semibold text-stone-500 transition hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Limpar filtro
              </button>
            )}
          </div>
        )}
      </div>
      {filtered.length > 0 ? (
        <ul className="flex-1 divide-y divide-stone-100 overflow-y-auto dark:divide-slate-800">
          {filtered.map((c) => {
            const active = c.customerPhone === selected;
            const paused = pausedPhones.has(c.customerPhone);
            const tags = tagsMap[c.customerPhone] ?? [];
            const name = nameFor(c.customerPhone);
            const title = name || formatPhone(c.customerPhone);
            return (
              <li key={c.customerPhone}>
                <button
                  onClick={() => setSelected(c.customerPhone)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                    active
                      ? "bg-emerald-50 dark:bg-slate-800"
                      : "hover:bg-stone-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-slate-700 dark:text-emerald-300">
                    {avatarText(name, c.customerPhone)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-stone-800 dark:text-slate-100">
                        {title}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-stone-400 dark:text-slate-500">
                        {formatListDay(c.lastAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          name
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                        }`}
                      >
                        {name ? "Nome definido" : "A confirmar"}
                      </span>
                      {name && (
                        <span className="truncate text-[11px] text-stone-400 dark:text-slate-500">
                          {formatPhone(c.customerPhone)}
                        </span>
                      )}
                      {paused && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          IA pausada
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-xs text-stone-500 dark:text-slate-400">
                      {c.lastMessage || "—"}
                    </span>
                    {tags.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {tags.map((raw) => {
                          const { name: tn, color } = splitTag(raw);
                          return (
                            <span
                              key={raw}
                              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${color.chip}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
                              {tn}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-stone-500 dark:text-slate-400">
          {query || tagFilter.size > 0 ? (
            <>
              <p>
                {query
                  ? `Nenhuma conversa encontrada para “${query}”.`
                  : "Nenhuma conversa com essas etiquetas."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setTagFilter(new Set());
                }}
                className="text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Limpar busca e filtros
              </button>
            </>
          ) : (
            <p>
              Nenhuma conversa ainda. Quando um cliente falar com a loja, ela
              aparece aqui.
            </p>
          )}
        </div>
      )}
    </div>
  );

  // --- Thread da conversa -----------------------------------------------------
  const selectedTags = selected ? tagsMap[selected] ?? [] : [];
  const selectedPaused = selected ? pausedPhones.has(selected) : false;
  const selectedName = selected ? nameFor(selected) : "";
  const selectedTitle = selected ? selectedName || formatPhone(selected) : "";

  const thread = (
    <div
      className={`${
        selected ? "flex" : "hidden lg:flex"
      } min-w-0 flex-1 flex-col`}
    >
      {selected ? (
        <>
          {/* Cabeçalho */}
          <div className="flex items-center gap-2.5 border-b border-stone-100 px-3 py-2.5 dark:border-slate-800">
            <button
              onClick={() => setSelected(null)}
              className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-slate-700 dark:text-emerald-300">
              {avatarText(selectedName, selected)}
            </span>
            <div className="min-w-0 flex-1">
              {renaming ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveName(selected, renameValue);
                      } else if (e.key === "Escape") {
                        setRenaming(false);
                      }
                    }}
                    autoFocus
                    maxLength={80}
                    placeholder="Nome do contato"
                    className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2.5 py-1 text-sm text-slate-900 placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <button
                    onClick={() => saveName(selected, renameValue)}
                    disabled={renameBusy}
                    className="shrink-0 rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => setRenaming(false)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 transition hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-100">
                      {selectedTitle}
                    </p>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                        selectedName
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                      }`}
                    >
                      {selectedName ? "Nome definido" : "A confirmar"}
                    </span>
                    <button
                      onClick={() => {
                        setRenameValue(selectedName);
                        setTagMenuOpen(false);
                        setPauseMenuOpen(false);
                        setRenaming(true);
                      }}
                      className="shrink-0 rounded p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                      title="Renomear contato"
                      aria-label="Renomear contato"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  </div>
                  <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                    {selectedName ? `${formatPhone(selected)} · ` : ""}
                    {selectedPaused ? "Você está atendendo" : "Bot ativo"}
                  </p>
                </>
              )}
            </div>

            {selectedPaused ? (
              <button
                onClick={() => togglePause(selected, false)}
                disabled={pauseBusy}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                title="Reativar a IA para este cliente"
              >
                Reativar IA
              </button>
            ) : (
              <div className="relative shrink-0">
                <button
                  onClick={() => {
                    setTagMenuOpen(false);
                    setPauseMenuOpen((v) => !v);
                  }}
                  disabled={pauseBusy}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-60 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
                  title="Pausar a IA e atender você mesmo"
                >
                  Pausar IA
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {pauseMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setPauseMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-30 mt-2 w-52 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                        Pausar a IA por
                      </p>
                      {PAUSE_DURATIONS.map((d) => (
                        <button
                          key={d.label}
                          onClick={() => {
                            togglePause(selected, true, d.minutes);
                            setPauseMenuOpen(false);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Etiquetas (popover) */}
            <div className="relative shrink-0">
              <button
                onClick={() => {
                  setPauseMenuOpen(false);
                  setTagMenuOpen((v) => !v);
                }}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                  tagMenuOpen
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-stone-200 text-stone-500 hover:bg-stone-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
                aria-label="Etiquetas da conversa"
                title="Etiquetas da conversa"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
                  <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
                </svg>
              </button>

              {tagMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setTagMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">
                      Etiquetas da conversa
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-500 dark:text-slate-400">
                      Só no painel — não aparecem no WhatsApp do celular.
                    </p>

                    <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                      Sugestões — clique para criar
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {TAG_PRESETS.filter(
                        (p) =>
                          !selectedTags.some(
                            (t) => splitTag(t).name.toLowerCase() === p.name.toLowerCase()
                          )
                      ).map((p) => {
                        const color = PALETTE_BY_ID[p.color];
                        return (
                          <button
                            key={p.name}
                            onClick={() => addTag(selected, p.name, p.color)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition hover:brightness-95 ${color.chip}`}
                          >
                            <span className={`h-2 w-2 rounded-full ${color.dot}`} />
                            {p.name}
                          </button>
                        );
                      })}
                    </div>

                    <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                      Nova etiqueta
                    </p>
                    <input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag(selected, newTagName, newTagColor);
                          setNewTagName("");
                        }
                      }}
                      maxLength={22}
                      placeholder="Nome da etiqueta"
                      className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-slate-900 placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {TAG_PALETTE.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setNewTagColor(c.id)}
                          className={`h-6 w-6 rounded-full ${c.swatch} transition ${
                            newTagColor === c.id
                              ? "ring-2 ring-stone-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900"
                              : "opacity-80 hover:opacity-100"
                          }`}
                          aria-label={`Cor ${c.id}`}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        addTag(selected, newTagName, newTagColor);
                        setNewTagName("");
                      }}
                      disabled={!newTagName.trim()}
                      className="mt-3 w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Criar e aplicar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Barra de etiquetas aplicadas */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-100 px-3 py-2 dark:border-slate-800">
              {selectedTags.map((raw) => {
                const { name: tn, color } = splitTag(raw);
                return (
                  <span
                    key={raw}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${color.chip}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${color.dot}`} />
                    {tn}
                    <button
                      onClick={() => removeTag(selected, raw)}
                      className="opacity-70 hover:opacity-100"
                      aria-label={`Remover etiqueta ${tn}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
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
                            ? "rounded-br-sm bg-[#d9fdd3] text-stone-800 dark:bg-emerald-900/80 dark:text-emerald-50"
                            : "rounded-bl-sm border border-orange-100 bg-orange-50 text-stone-800 dark:border-orange-900/40 dark:bg-orange-950/40 dark:text-orange-50"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        <p
                          className={`mt-1 text-right text-[10px] ${
                            mine
                              ? "text-emerald-700/60 dark:text-emerald-200/60"
                              : "text-orange-700/60 dark:text-orange-200/50"
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
                className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-stone-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                onClick={handleSend}
                disabled={!connected || sending || !text.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600 disabled:opacity-50"
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
    <section className="h-full overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-full">
        {list}
        {thread}
      </div>
    </section>
  );
}
