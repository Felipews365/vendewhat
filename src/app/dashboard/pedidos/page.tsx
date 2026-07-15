"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import {
  isMissingOrdersColumnError,
  ORDERS_MIGRATION_HINT,
} from "@/lib/dbColumnErrors";
import { shippingModeLabel } from "@/lib/shippingModes";
import { paymentMethodLabel } from "@/lib/paymentMethods";
import { storefrontFromDb } from "@/lib/storefront";
import {
  SALE_SOUNDS,
  type SaleSoundId,
  readSaleSoundId,
  readSaleVolume,
  playSaleSound,
  SOUND_ID_KEY,
  SOUND_VOLUME_KEY,
  DEFAULT_SALE_SOUND_ID,
  DEFAULT_SALE_VOLUME,
} from "@/lib/saleSounds";

type StoreInfo = {
  name: string;
  logoUrl: string | null;
  phone: string;
  email: string;
  website: string;
  address: string;
};

type PayloadLine = {
  productId: string;
  name: string;
  quantity: number;
  color: string;
  size: string;
  unitPrice: number;
  lineTotal: number;
  productReference?: string | null;
  barcode?: string | null;
};

type OrderRow = {
  id: string;
  created_at: string;
  order_number: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  status: string;
  payment_status: string | null;
  payment_provider: string | null;
  paid_at: string | null;
  notes: string | null;
  payload: {
    lines?: PayloadLine[];
    subtotal?: number;
    customerName?: string;
    customerPhone?: string;
    orderNumber?: number;
    shippingMode?: string;
    shippingModeLabel?: string;
    excursionName?: string;
    carrierName?: string;
    paymentMethod?: string;
    customerAddress?: string;
  } | null;
};

function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Só a hora (para o card, já que o dia vira cabeçalho do grupo). */
function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(
      new Date(iso)
    );
  } catch {
    return iso;
  }
}

const DAY_MS = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Rótulo amigável do dia do pedido: "Hoje", "Ontem" ou a data por extenso. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  const s = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Data local do pedido no formato YYYY-MM-DD (para comparar com o seletor de dia). */
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Um pedido está "finalizado" quando o lojista marcou; o resto fica "em aberto". */
function isFinalized(o: { status: string }): boolean {
  return o.status === "finalizado";
}

function paymentProviderLabel(provider: string | null | undefined) {
  switch ((provider ?? "").toLowerCase()) {
    case "mercadopago":
      return "Mercado Pago";
    default:
      return provider?.trim() || null;
  }
}

type PaymentInfo = {
  /** Texto curto para selo/linha, ex.: "Pago pelo Mercado Pago". */
  label: string;
  /** "pago" | "falhou" | "pendente" — define a cor do selo. */
  tone: string;
};

/**
 * Só retorna algo quando o pedido tem um provedor de pagamento (gateway ou
 * confirmação manual da loja). Pedidos só de WhatsApp sem confirmação ficam com
 * payment_status "pendente" por padrão e não mostram selo (evita poluir a lista).
 */
function paymentInfo(
  provider: string | null | undefined,
  status: string | null | undefined
): PaymentInfo | null {
  const tone = (status ?? "pendente").toLowerCase();
  if ((provider ?? "").toLowerCase() === "manual") {
    return { label: "Pago (confirmado pela loja)", tone: "pago" };
  }
  const prov = paymentProviderLabel(provider);
  if (!prov) return null;
  const label =
    tone === "pago"
      ? `Pago pelo ${prov}`
      : tone === "falhou"
      ? `Pagamento ${prov} falhou`
      : `Pagamento ${prov} pendente`;
  return { label, tone };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type PrintData = {
  num: number | null;
  client: string | null;
  phone: string | null;
  shipping: string | null;
  excursion: string | null;
  carrier: string | null;
  paymentMethod: string | null;
  deliveryAddress: string | null;
  date: string;
  total: string;
  status: string;
  payment: string | null;
  notes: string | null;
  lines: PayloadLine[];
};

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    margin: 0;
    padding: 24px;
    background: #f1f5f9;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    justify-content: center;
    gap: 10px;
    margin: -24px -24px 24px;
    padding: 14px 24px;
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
  }
  .toolbar button {
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 10px;
    padding: 9px 18px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #334155;
  }
  .toolbar button.primary {
    background: #7c3aed;
    border-color: #7c3aed;
    color: #ffffff;
  }
  .sheet {
    background: #ffffff;
    border-radius: 12px;
    padding: 24px;
    margin: 0 auto;
    max-width: 408px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  }
  .receipt { max-width: 360px; margin: 0 auto; }
  .receipt + .receipt {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px dashed #cbd5e1;
  }
  .logo {
    display: block;
    max-height: 64px;
    max-width: 200px;
    margin: 0 auto 8px;
    object-fit: contain;
  }
  .store {
    text-align: center;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .store-info {
    text-align: center;
    font-size: 11px;
    color: #64748b;
    margin-top: 4px;
    line-height: 1.5;
  }
  .doc-title {
    text-align: center;
    font-size: 13px;
    color: #64748b;
    margin-top: 8px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .divider { border: none; border-top: 1px dashed #cbd5e1; margin: 16px 0; }
  .order-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .order-num { font-size: 16px; font-weight: 700; }
  .status {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #0f766e;
  }
  .meta { font-size: 13px; margin: 4px 0; color: #334155; line-height: 1.4; }
  .meta span { font-weight: 600; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  td { font-size: 13px; padding: 6px 0; vertical-align: top; }
  td.qty { white-space: nowrap; padding-right: 8px; font-variant-numeric: tabular-nums; }
  td.name { width: 100%; }
  td.name .ean { font-size: 11px; color: #64748b; margin-top: 2px; font-variant-numeric: tabular-nums; }
  td.price { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  .total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 16px;
    font-weight: 700;
    margin-top: 12px;
  }
  .notes { font-size: 12px; color: #475569; margin-top: 12px; line-height: 1.4; }
  .notes span { font-weight: 600; color: #0f172a; }
  .foot {
    text-align: center;
    font-size: 11px;
    color: #94a3b8;
    margin-top: 24px;
  }
  @media print {
    body { padding: 0; background: #ffffff; }
    .toolbar { display: none; }
    .sheet {
      max-width: none;
      box-shadow: none;
      border-radius: 0;
      padding: 0;
    }
    .receipt { max-width: none; }
    .receipt { break-inside: avoid; page-break-inside: avoid; }
    .receipt + .receipt {
      page-break-before: always;
      break-before: page;
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }
  }
`;

function buildReceiptHtml(store: StoreInfo, o: PrintData) {
  const itemsHtml = o.lines
    .map((line) => {
      const bits: string[] = [];
      if (line.color) bits.push(`Cor: ${line.color}`);
      if (line.size) bits.push(`Tam: ${line.size}`);
      const opt = bits.length ? ` (${bits.join(", ")})` : "";
      const ref = line.productReference?.trim();
      const name = ref ? `${line.name} (Ref. ${ref})` : line.name;
      const ean = line.barcode?.trim();
      const eanHtml = ean
        ? `<div class="ean">EAN: ${escapeHtml(ean)}</div>`
        : "";
      return `
        <tr>
          <td class="qty">${line.quantity}×</td>
          <td class="name">${escapeHtml(name)}${escapeHtml(opt)}${eanHtml}</td>
          <td class="price">${escapeHtml(formatBRL(line.lineTotal))}</td>
        </tr>`;
    })
    .join("");

  const metaRow = (label: string, value: string | null) =>
    value
      ? `<p class="meta"><span>${escapeHtml(label)}</span> ${escapeHtml(value)}</p>`
      : "";

  const storeContact = [store.phone, store.email, store.website, store.address]
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => escapeHtml(v))
    .join("<br />");

  const logoHtml = store.logoUrl
    ? `<img class="logo" src="${escapeHtml(store.logoUrl)}" alt="" />`
    : "";

  return `
  <div class="receipt">
    ${logoHtml}
    <div class="store">${escapeHtml(store.name || "Pedido")}</div>
    ${storeContact ? `<div class="store-info">${storeContact}</div>` : ""}
    <div class="doc-title">Comprovante de pedido</div>
    <hr class="divider" />
    <div class="order-head">
      <span class="order-num">${o.num != null ? `Pedido nº ${o.num}` : "Pedido"}</span>
      <span class="status">${escapeHtml(o.status)}</span>
    </div>
    <p class="meta" style="color:#64748b">${escapeHtml(o.date)}</p>
    ${metaRow("Cliente:", o.client)}
    ${metaRow("Telefone:", o.phone)}
    ${metaRow("Forma de envio:", o.shipping)}
    ${metaRow("Excursão:", o.excursion)}
    ${metaRow("Transportadora:", o.carrier)}
    ${metaRow("Endereço:", o.deliveryAddress)}
    ${metaRow("Forma de pagamento:", o.paymentMethod)}
    <hr class="divider" />
    <table>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    <hr class="divider" />
    <div class="total">
      <span>Total</span>
      <span>${escapeHtml(o.total)}</span>
    </div>
    ${o.payment ? `<p class="meta" style="margin-top:8px"><span>Pagamento:</span> ${escapeHtml(o.payment)}</p>` : ""}
    ${
      o.notes?.trim()
        ? `<p class="notes"><span>Obs:</span> ${escapeHtml(o.notes.trim())}</p>`
        : ""
    }
    <p class="foot">Gerado por VendeWhat</p>
  </div>`;
}

function printReceipts(title: string, receiptsHtml: string) {
  const win = window.open("", "_blank", "width=520,height=720");
  if (!win) {
    alert(
      "Não foi possível abrir a janela de impressão. Verifique se o navegador está bloqueando pop-ups."
    );
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="toolbar">
    <button type="button" class="primary" onclick="window.print()">Imprimir</button>
    <button type="button" onclick="window.close()">Fechar</button>
  </div>
  <div class="sheet">
    ${receiptsHtml}
  </div>
  <script>
    window.onload = function () { window.focus(); };
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

function orderToPrintData(o: OrderRow): PrintData {
  return {
    num: o.order_number ?? o.payload?.orderNumber ?? null,
    client:
      o.customer_name?.trim() || o.payload?.customerName?.trim() || null,
    phone:
      o.customer_phone?.trim() || o.payload?.customerPhone?.trim() || null,
    shipping:
      o.payload?.shippingModeLabel?.trim() ||
      shippingModeLabel(o.payload?.shippingMode) ||
      null,
    excursion: o.payload?.excursionName?.trim() || null,
    carrier: o.payload?.carrierName?.trim() || null,
    paymentMethod: paymentMethodLabel(o.payload?.paymentMethod) || null,
    deliveryAddress: o.payload?.customerAddress?.trim() || null,
    date: formatDate(o.created_at),
    total: formatBRL(Number(o.subtotal)),
    status: o.status,
    payment: paymentInfo(o.payment_provider, o.payment_status)?.label ?? null,
    notes: o.notes,
    lines: o.payload?.lines ?? [],
  };
}

function printOrder(store: StoreInfo, o: PrintData) {
  printReceipts(
    `Pedido${o.num != null ? ` nº ${o.num}` : ""}`,
    buildReceiptHtml(store, o)
  );
}

function printAllOrders(store: StoreInfo, list: PrintData[]) {
  if (list.length === 0) return;
  printReceipts(
    "Pedidos",
    list.map((o) => buildReceiptHtml(store, o)).join("\n")
  );
}

export default function PedidosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [storeInfo, setStoreInfo] = useState<StoreInfo>({
    name: "",
    logoUrl: null,
    phone: "",
    email: "",
    website: "",
    address: "",
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configHint, setConfigHint] = useState(false);
  const [filter, setFilter] = useState<"abertos" | "finalizados">("abertos");
  const [dayFilter, setDayFilter] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Avisos de venda (bipe local + aviso por WhatsApp)
  const [soundOn, setSoundOn] = useState(true);
  const [soundId, setSoundId] = useState<SaleSoundId>(DEFAULT_SALE_SOUND_ID);
  const [volume, setVolume] = useState(DEFAULT_SALE_VOLUME);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertPhone, setAlertPhone] = useState("");
  const [savingAlert, setSavingAlert] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const { showToast } = useToast();

  // Restaura as preferências de som (por dispositivo).
  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem("vw-sale-sound") !== "0");
    } catch {
      /* localStorage indisponível */
    }
    setSoundId(readSaleSoundId());
    setVolume(readSaleVolume());
  }, []);

  // Esc fecha o modal de avisos.
  useEffect(() => {
    if (!alertsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAlertsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alertsOpen]);

  const toggleSound = useCallback((next: boolean) => {
    setSoundOn(next);
    try {
      localStorage.setItem("vw-sale-sound", next ? "1" : "0");
    } catch {
      /* localStorage indisponível */
    }
  }, []);

  /** Troca o som escolhido e toca uma prévia (por dispositivo). */
  const changeSound = useCallback(
    (id: SaleSoundId, vol: number) => {
      setSoundId(id);
      try {
        localStorage.setItem(SOUND_ID_KEY, id);
      } catch {
        /* localStorage indisponível */
      }
      playSaleSound(id, vol);
    },
    []
  );

  /** Ajusta o volume (0..1), salvando por dispositivo. */
  const changeVolume = useCallback((vol: number) => {
    const v = Math.min(Math.max(vol, 0), 1);
    setVolume(v);
    try {
      localStorage.setItem(SOUND_VOLUME_KEY, String(v));
    } catch {
      /* localStorage indisponível */
    }
  }, []);

  /** Persiste o aviso de venda por WhatsApp (liga/desliga + número). */
  const saveSaleAlert = useCallback(
    async (enabled: boolean, phone: string) => {
      const digits = phone.replace(/\D/g, "");
      if (enabled && digits.length < 10) {
        showToast("Informe um número de WhatsApp válido (com DDD).", "error");
        return;
      }
      setSavingAlert(true);
      try {
        const res = await fetch("/api/orders/sale-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            saleAlertEnabled: enabled,
            saleAlertPhone: digits,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !j.ok) {
          showToast(j.error ?? "Não foi possível salvar o aviso.", "error");
          return;
        }
        setAlertEnabled(enabled);
        setAlertPhone(digits);
        showToast("Aviso de venda salvo!");
      } catch {
        showToast("Não foi possível salvar o aviso.", "error");
      } finally {
        setSavingAlert(false);
      }
    },
    [showToast]
  );

  const loadOrders = useCallback(async () => {
    setLoadError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: store, error: storeErr } = await supabase
      .from("stores")
      .select("id, name, logo, storefront")
      .eq("user_id", user.id)
      .maybeSingle();

    if (storeErr || !store?.id) {
      setLoading(false);
      setOrders([]);
      return;
    }

    const sf = storefrontFromDb(store.storefront);
    setStoreInfo({
      name: typeof store.name === "string" ? store.name.trim() : "",
      logoUrl:
        typeof store.logo === "string" && store.logo.trim()
          ? store.logo.trim()
          : null,
      phone: sf.footerPhone,
      email: sf.footerEmail,
      website: sf.footerWebsite,
      address: sf.pickupAddress,
    });
    setAlertEnabled(sf.saleAlertEnabled);
    setAlertPhone(sf.saleAlertPhone);

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, created_at, order_number, customer_name, customer_phone, subtotal, status, payment_status, payment_provider, paid_at, notes, payload"
      )
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      const msg = error.message ?? "";
      if (
        msg.includes("orders") ||
        error.code === "42P01" ||
        msg.toLowerCase().includes("relation") ||
        isMissingOrdersColumnError(msg, error.code)
      ) {
        setConfigHint(true);
        setOrders([]);
      } else {
        setLoadError(error.message);
        setOrders([]);
      }
      setLoading(false);
      return;
    }

    setConfigHint(false);
    setOrders((data ?? []) as OrderRow[]);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  /** Atualiza status de atendimento e/ou pagamento; reflete na hora na tela. */
  const updateOrder = useCallback(
    async (
      orderId: string,
      patch: { status?: string; paymentStatus?: string },
      okMsg: string
    ) => {
      setBusyId(orderId);
      try {
        const res = await fetch("/api/orders/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, ...patch }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !j.ok) {
          showToast(j.error ?? "Não foi possível atualizar o pedido.", "error");
          return;
        }
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id !== orderId) return o;
            const next: OrderRow = { ...o };
            if (patch.status !== undefined) next.status = patch.status;
            if (patch.paymentStatus !== undefined) {
              const keepMp = o.payment_provider === "mercadopago";
              next.payment_status = patch.paymentStatus;
              if (patch.paymentStatus === "pago") {
                next.paid_at = new Date().toISOString();
                next.payment_provider = keepMp ? "mercadopago" : "manual";
              } else {
                next.paid_at = null;
                next.payment_provider = keepMp ? "mercadopago" : null;
              }
            }
            return next;
          })
        );
        showToast(okMsg, "success");
      } catch {
        showToast("Falha de rede ao atualizar o pedido.", "error");
      } finally {
        setBusyId(null);
      }
    },
    [showToast]
  );

  // Pedidos do dia escolhido (ou todos, se nenhum dia selecionado).
  const dateScoped = useMemo(
    () =>
      orders.filter((o) => !dayFilter || dayKey(o.created_at) === dayFilter),
    [orders, dayFilter]
  );

  const openCount = useMemo(
    () => dateScoped.filter((o) => !isFinalized(o)).length,
    [dateScoped]
  );
  const doneCount = dateScoped.length - openCount;

  const visibleOrders = useMemo(
    () =>
      dateScoped.filter((o) =>
        filter === "finalizados" ? isFinalized(o) : !isFinalized(o)
      ),
    [dateScoped, filter]
  );

  /** Pedidos visíveis agrupados por dia (já vêm ordenados do mais novo). */
  const groups = useMemo(() => {
    const out: { label: string; items: OrderRow[] }[] = [];
    for (const o of visibleOrders) {
      const label = dayLabel(o.created_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(o);
      else out.push({ label, items: [o] });
    }
    return out;
  }, [visibleOrders]);

  // IDs visíveis (respeitando aba + dia) — base para "selecionar todos".
  const visibleIds = useMemo(
    () => visibleOrders.map((o) => o.id),
    [visibleOrders]
  );

  // Quantos dos selecionados ainda estão visíveis (o resto é ignorado ao imprimir).
  const selectedVisibleCount = useMemo(
    () => visibleIds.filter((id) => selectedIds.has(id)).length,
    [visibleIds, selectedIds]
  );
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const printSelected = useCallback(() => {
    const chosen = visibleOrders.filter((o) => selectedIds.has(o.id));
    if (chosen.length === 0) {
      showToast("Selecione pelo menos um pedido para imprimir.", "error");
      return;
    }
    printAllOrders(storeInfo, chosen.map(orderToPrintData));
  }, [visibleOrders, selectedIds, storeInfo, showToast]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-landing-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pedidos</h1>
          <p className="text-slate-600 dark:text-slate-300 mt-2 max-w-2xl">
            Pedidos feitos pelo catálogo quando o cliente usa{" "}
            <strong>Enviar pedido no WhatsApp</strong>. O resumo fica aqui; o
            contato continua pelo WhatsApp da loja.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAlertsOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            title="Configurar os avisos de venda"
          >
            <span aria-hidden>🔔</span>
            Avisos de venda
          </button>
          {visibleOrders.length > 0 && (
            <button
              type="button"
              onClick={() =>
                selectMode ? exitSelectMode() : setSelectMode(true)
              }
              className={
                "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors " +
                (selectMode
                  ? "border-landing-primary bg-landing-primary/10 text-landing-primary dark:bg-landing-primary/20"
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700")
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden
              >
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              {selectMode ? "Cancelar seleção" : "Selecionar"}
            </button>
          )}
          {visibleOrders.length > 0 && !selectMode && (
            <button
              type="button"
              onClick={() =>
                printAllOrders(storeInfo, visibleOrders.map(orderToPrintData))
              }
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden
              >
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Imprimir todos
            </button>
          )}
        </div>
      </div>

      {/* 🔔 Avisos de venda (modal): bipe no painel + aviso por WhatsApp */}
      {alertsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="avisos-de-venda-titulo"
          onClick={() => setAlertsOpen(false)}
        >
          <section
            onClick={(e) => e.stopPropagation()}
            className="vw-pop-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden>
                🔔
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="avisos-de-venda-titulo"
                  className="text-base font-bold text-slate-800 dark:text-slate-100"
                >
                  Avisos de venda
                </h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  Seja avisado na hora quando entrar uma venda nova — pela IA ou
                  pelo catálogo da loja.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAlertsOpen(false)}
                aria-label="Fechar"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Som no painel (por dispositivo) */}
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Tocar um som ao entrar venda
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    Vale só neste aparelho. O alerta na tela aparece de qualquer forma.
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={soundOn}
                  onClick={() => toggleSound(!soundOn)}
                  className={
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
                    (soundOn
                      ? "bg-emerald-500"
                      : "bg-slate-300 dark:bg-slate-600")
                  }
                >
                  <span
                    className={
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " +
                      (soundOn ? "left-[22px]" : "left-0.5")
                    }
                  />
                </button>
              </label>

              {/* Escolha do som + volume (só quando o som está ligado) */}
              {soundOn && (
                <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="sale-sound"
                      className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300"
                    >
                      Som do aviso
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        id="sale-sound"
                        value={soundId}
                        onChange={(e) =>
                          changeSound(e.target.value as SaleSoundId, volume)
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {SALE_SOUNDS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => playSaleSound(soundId, volume)}
                        title="Ouvir o som"
                        className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        ▶ Testar
                      </button>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="sale-volume"
                      className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300"
                    >
                      Volume: {Math.round(volume * 100)}%
                    </label>
                    <input
                      id="sale-volume"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round(volume * 100)}
                      onChange={(e) => changeVolume(Number(e.target.value) / 100)}
                      onMouseUp={() => playSaleSound(soundId, volume)}
                      onTouchEnd={() => playSaleSound(soundId, volume)}
                      className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600 dark:bg-slate-700"
                    />
                  </div>
                </div>
              )}

              {/* Aviso por WhatsApp (número escolhido) */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Avisar por WhatsApp
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      A loja manda uma mensagem para o número abaixo a cada venda.
                      Precisa do WhatsApp da loja conectado.
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={alertEnabled}
                    onClick={() => setAlertEnabled((v) => !v)}
                    className={
                      "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
                      (alertEnabled
                        ? "bg-emerald-500"
                        : "bg-slate-300 dark:bg-slate-600")
                    }
                  >
                    <span
                      className={
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " +
                        (alertEnabled ? "left-[22px]" : "left-0.5")
                      }
                    />
                  </button>
                </label>

                {alertEnabled && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={alertPhone}
                      onChange={(e) =>
                        setAlertPhone(e.target.value.replace(/\D/g, "").slice(0, 15))
                      }
                      placeholder="Ex.: 81999998888 (DDD + número)"
                      className="w-full flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => saveSaleAlert(alertEnabled, alertPhone)}
                    disabled={savingAlert}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-emerald-950"
                  >
                    {savingAlert ? "Salvando…" : "Salvar aviso"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {selectMode && visibleOrders.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-landing-primary/30 bg-landing-primary/5 dark:bg-landing-primary/10 px-4 py-3">
          <button
            type="button"
            onClick={() =>
              setSelectedIds(
                allVisibleSelected ? new Set() : new Set(visibleIds)
              )
            }
            className="text-sm font-semibold text-landing-primary hover:underline"
          >
            {allVisibleSelected ? "Limpar seleção" : "Selecionar todos"}
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {selectedVisibleCount} de {visibleIds.length} selecionado
            {selectedVisibleCount === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={printSelected}
            disabled={selectedVisibleCount === 0}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-landing-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
              aria-hidden
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Imprimir selecionados
            {selectedVisibleCount > 0 ? ` (${selectedVisibleCount})` : ""}
          </button>
        </div>
      )}

      {configHint && (
        <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200 text-sm">
          <p className="font-semibold">Pedidos: migração no Supabase</p>
          <p className="mt-1">{ORDERS_MIGRATION_HINT}</p>
        </div>
      )}

      {loadError && (
        <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 text-sm">
          {loadError}
        </div>
      )}

      {orders.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 text-sm font-semibold">
            {(
              [
                ["abertos", `Em aberto (${openCount})`],
                ["finalizados", `Finalizados (${doneCount})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={
                  "px-4 py-1.5 rounded-lg transition-colors " +
                  (filter === key
                    ? "bg-landing-primary text-white"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 text-sm">
            <label
              htmlFor="day-filter"
              className="text-slate-500 dark:text-slate-400 font-medium"
            >
              Dia:
            </label>
            <input
              id="day-filter"
              type="date"
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              onClick={(e) => {
                // Abre a agenda ao clicar em qualquer parte do campo (não só no ícone)
                const el = e.currentTarget as HTMLInputElement & {
                  showPicker?: () => void;
                };
                try {
                  el.showPicker?.();
                } catch {
                  /* navegador sem suporte: cai no comportamento padrão */
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-slate-200 text-sm cursor-pointer"
            />
            {(() => {
              const today = dayKey(new Date().toISOString());
              const isToday = dayFilter === today;
              return (
                <button
                  type="button"
                  onClick={() => setDayFilter(isToday ? "" : today)}
                  className={
                    "px-3 py-1.5 rounded-lg border text-sm font-medium transition " +
                    (isToday
                      ? "bg-landing-primary text-white border-landing-primary"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")
                  }
                >
                  Hoje
                </button>
              );
            })()}
            {dayFilter && (
              <button
                type="button"
                onClick={() => setDayFilter("")}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      )}

      {orders.length === 0 && !configHint && !loadError ? (
        <div className="mt-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm p-8 text-center">
          <span className="text-4xl" aria-hidden>
            🛒
          </span>
          <p className="text-slate-600 dark:text-slate-300 mt-4 text-sm">
            Nenhum pedido registrado ainda. Quando um cliente finalizar no
            catálogo e enviar pelo WhatsApp, o pedido aparece aqui (com a API e o
            banco configurados).
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/produtos/novo"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Adicionar produto
            </Link>
          </div>
        </div>
      ) : orders.length > 0 && visibleOrders.length === 0 ? (
        <div className="mt-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          {dayFilter
            ? `Nenhum pedido ${
                filter === "finalizados" ? "finalizado" : "em aberto"
              } nesse dia.`
            : filter === "finalizados"
            ? "Nenhum pedido finalizado ainda."
            : "Nenhum pedido em aberto. Tudo em dia! 🎉"}
        </div>
      ) : orders.length > 0 ? (
        <div className="mt-8 space-y-8">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">
                {g.label} · {g.items.length}{" "}
                {g.items.length === 1 ? "pedido" : "pedidos"}
              </h2>
              <ul className="space-y-4">
                {g.items.map((o) => {
            const lines = o.payload?.lines ?? [];
            const num =
              o.order_number ??
              o.payload?.orderNumber ??
              null;
            const client =
              o.customer_name?.trim() ||
              o.payload?.customerName?.trim() ||
              null;
            const phone =
              o.customer_phone?.trim() ||
              o.payload?.customerPhone?.trim() ||
              null;
            const shipping =
              o.payload?.shippingModeLabel?.trim() ||
              shippingModeLabel(o.payload?.shippingMode) ||
              null;
            const deliveryAddress = o.payload?.customerAddress?.trim() || null;
            const excursion = o.payload?.excursionName?.trim() || null;
            const carrier = o.payload?.carrierName?.trim() || null;
            const paymentMethodChosen = paymentMethodLabel(
              o.payload?.paymentMethod
            );
            const payment = paymentInfo(o.payment_provider, o.payment_status);
            const selected = selectedIds.has(o.id);
            return (
              <li
                key={o.id}
                className={
                  "bg-white dark:bg-slate-900 rounded-xl border shadow-sm p-5 transition " +
                  (selectMode && selected
                    ? "border-landing-primary ring-2 ring-landing-primary/40"
                    : "border-slate-100 dark:border-slate-800")
                }
              >
                {selectMode && (
                  <label className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100 dark:border-slate-800 cursor-pointer select-none text-sm font-medium text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelected(o.id)}
                      className="h-4 w-4 rounded border-slate-300 text-landing-primary focus:ring-landing-primary"
                    />
                    {selected ? "Selecionado para imprimir" : "Selecionar este pedido"}
                  </label>
                )}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
                  <div>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      {num != null ? (
                        <>Pedido nº {num}</>
                      ) : (
                        <>Pedido</>
                      )}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Cliente:</span>{" "}
                      {client ?? "—"}
                    </p>
                    {phone ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                        <span className="font-medium text-slate-700 dark:text-slate-200">Telefone:</span>{" "}
                        {phone}
                      </p>
                    ) : null}
                    {shipping ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Forma de envio:
                        </span>{" "}
                        {shipping}
                      </p>
                    ) : null}
                    {excursion ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Excursão:
                        </span>{" "}
                        {excursion}
                      </p>
                    ) : null}
                    {carrier ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Transportadora:
                        </span>{" "}
                        {carrier}
                      </p>
                    ) : null}
                    {deliveryAddress ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Endereço:
                        </span>{" "}
                        {deliveryAddress}
                      </p>
                    ) : null}
                    {paymentMethodChosen ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Forma de pagamento:
                        </span>{" "}
                        {paymentMethodChosen}
                      </p>
                    ) : null}
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                      {formatTime(o.created_at)}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                      id {o.id.slice(0, 8)}…
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      {formatBRL(Number(o.subtotal))}
                    </p>
                    <div className="mt-1 flex flex-wrap justify-end gap-1.5">
                      <span
                        className={
                          "inline-block text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full " +
                          (isFinalized(o)
                            ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            : "bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300")
                        }
                      >
                        {isFinalized(o) ? "Finalizado" : "Em aberto"}
                      </span>
                      {payment ? (
                        <span
                          className={
                            "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full " +
                            (payment.tone === "pago"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : payment.tone === "falhou"
                              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")
                          }
                        >
                          <span aria-hidden>💳</span>
                          {payment.label}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => printOrder(storeInfo, orderToPrintData(o))}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-3.5 h-3.5"
                          aria-hidden
                        >
                          <polyline points="6 9 6 2 18 2 18 9" />
                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                          <rect x="6" y="14" width="12" height="8" />
                        </svg>
                        Imprimir
                      </button>
                    </div>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  {lines.map((line, i) => {
                    const bits: string[] = [];
                    if (line.color) bits.push(`Cor: ${line.color}`);
                    if (line.size) bits.push(`Tam: ${line.size}`);
                    const opt = bits.length ? ` (${bits.join(", ")})` : "";
                    const ref = line.productReference?.trim();
                    const name = ref ? `${line.name} (Ref. ${ref})` : line.name;
                    const ean = line.barcode?.trim();
                    return (
                      <li key={`${o.id}-${i}`} className="flex justify-between gap-4">
                        <span>
                          {line.quantity}× {name}
                          {opt}
                          {ean && (
                            <span className="block text-xs text-slate-400 tabular-nums">
                              EAN: {ean}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatBRL(line.lineTotal)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {o.notes?.trim() && (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Obs:</span>{" "}
                    {o.notes.trim()}
                  </p>
                )}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() =>
                      updateOrder(
                        o.id,
                        { status: isFinalized(o) ? "novo" : "finalizado" },
                        isFinalized(o)
                          ? "Pedido reaberto."
                          : "Pedido finalizado!"
                      )
                    }
                    className={
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 " +
                      (isFinalized(o)
                        ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        : "bg-emerald-600 text-white hover:bg-emerald-700")
                    }
                  >
                    {isFinalized(o) ? "↩ Reabrir" : "✓ Marcar como finalizado"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() =>
                      updateOrder(
                        o.id,
                        {
                          paymentStatus:
                            o.payment_status === "pago" ? "pendente" : "pago",
                        },
                        o.payment_status === "pago"
                          ? "Pagamento desmarcado."
                          : "Pedido marcado como pago!"
                      )
                    }
                    className={
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 " +
                      (o.payment_status === "pago"
                        ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        : "bg-landing-primary text-white hover:opacity-90")
                    }
                  >
                    {o.payment_status === "pago"
                      ? "Desmarcar pago"
                      : "💳 Marcar como pago"}
                  </button>
                </div>
              </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </main>
  );
}
