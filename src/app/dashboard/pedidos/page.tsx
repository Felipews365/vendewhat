"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  isMissingOrdersColumnError,
  ORDERS_MIGRATION_HINT,
} from "@/lib/dbColumnErrors";
import { shippingModeLabel } from "@/lib/shippingModes";
import { storefrontFromDb } from "@/lib/storefront";

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
};

type OrderRow = {
  id: string;
  created_at: string;
  order_number: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  status: string;
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
  deliveryAddress: string | null;
  date: string;
  total: string;
  status: string;
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
      return `
        <tr>
          <td class="qty">${line.quantity}×</td>
          <td class="name">${escapeHtml(name)}${escapeHtml(opt)}</td>
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
    ${metaRow("Endereço:", o.deliveryAddress)}
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
    deliveryAddress: o.payload?.customerAddress?.trim() || null,
    date: formatDate(o.created_at),
    total: formatBRL(Number(o.subtotal)),
    status: o.status,
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

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, created_at, order_number, customer_name, customer_phone, subtotal, status, notes, payload"
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
        {orders.length > 0 && (
          <button
            type="button"
            onClick={() =>
              printAllOrders(storeInfo, orders.map(orderToPrintData))
            }
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shrink-0"
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
      ) : orders.length > 0 ? (
        <ul className="mt-8 space-y-4">
          {orders.map((o) => {
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
            return (
              <li
                key={o.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm p-5"
              >
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
                    {deliveryAddress ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Endereço:
                        </span>{" "}
                        {deliveryAddress}
                      </p>
                    ) : null}
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                      {formatDate(o.created_at)}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                      id {o.id.slice(0, 8)}…
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      {formatBRL(Number(o.subtotal))}
                    </p>
                    <span className="inline-block mt-1 text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
                      {o.status}
                    </span>
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
                    return (
                      <li key={`${o.id}-${i}`} className="flex justify-between gap-4">
                        <span>
                          {line.quantity}× {name}
                          {opt}
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
              </li>
            );
          })}
        </ul>
      ) : null}
    </main>
  );
}
