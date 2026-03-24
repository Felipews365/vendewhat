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

export default function PedidosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
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
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (storeErr || !store?.id) {
      setLoading(false);
      setOrders([]);
      return;
    }

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
      <h1 className="text-2xl font-bold text-slate-800">Pedidos</h1>
      <p className="text-slate-600 mt-2 max-w-2xl">
        Pedidos feitos pelo catálogo quando o cliente usa{" "}
        <strong>Enviar pedido no WhatsApp</strong>. O resumo fica aqui; o
        contato continua pelo WhatsApp da loja.
      </p>

      {configHint && (
        <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <p className="font-semibold">Pedidos: migração no Supabase</p>
          <p className="mt-1">{ORDERS_MIGRATION_HINT}</p>
        </div>
      )}

      {loadError && (
        <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          {loadError}
        </div>
      )}

      {orders.length === 0 && !configHint && !loadError ? (
        <div className="mt-8 bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center">
          <span className="text-4xl" aria-hidden>
            🛒
          </span>
          <p className="text-slate-600 mt-4 text-sm">
            Nenhum pedido registrado ainda. Quando um cliente finalizar no
            catálogo e enviar pelo WhatsApp, o pedido aparece aqui (com a API e o
            banco configurados).
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/produtos/novo"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
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
            return (
              <li
                key={o.id}
                className="bg-white rounded-xl border border-slate-100 shadow-sm p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {num != null ? (
                        <>Pedido nº {num}</>
                      ) : (
                        <>Pedido</>
                      )}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">
                      <span className="font-medium text-slate-700">Cliente:</span>{" "}
                      {client ?? "—"}
                    </p>
                    {phone ? (
                      <p className="text-sm text-slate-600 mt-0.5">
                        <span className="font-medium text-slate-700">Telefone:</span>{" "}
                        {phone}
                      </p>
                    ) : null}
                    {shipping ? (
                      <p className="text-sm text-slate-600 mt-0.5">
                        <span className="font-medium text-slate-700">
                          Forma de envio:
                        </span>{" "}
                        {shipping}
                      </p>
                    ) : null}
                    <p className="text-sm text-slate-500 mt-2">
                      {formatDate(o.created_at)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">
                      id {o.id.slice(0, 8)}…
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-800">
                      {formatBRL(Number(o.subtotal))}
                    </p>
                    <span className="inline-block mt-1 text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-teal-50 text-teal-800">
                      {o.status}
                    </span>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-slate-700">
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
                  <p className="mt-3 text-sm text-slate-600 border-t border-slate-100 pt-3">
                    <span className="font-medium text-slate-700">Obs:</span>{" "}
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
