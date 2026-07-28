"use client";

import { useState } from "react";
import Image from "next/image";
import PixPaymentModal from "@/components/storefront/PixPaymentModal";
import { whatsAppLink } from "@/lib/whatsapp";

export type OrderPaymentLine = {
  name: string;
  quantity: number;
  color: string;
  size: string;
  lineTotal: number;
  productReference?: string | null;
};

export type OrderPaymentData = {
  store: {
    name: string;
    logo: string;
    contactPhone: string;
  };
  theme: {
    primary: string;
    secondary: string;
    pageBackground: string;
  };
  pix: {
    key: string;
    name: string;
    city: string;
  };
  order: {
    number: number;
    customerName: string;
    subtotal: number;
    paymentLabel: string | null;
    shippingLabel: string | null;
    address: string | null;
    paid: boolean;
    lines: OrderPaymentLine[];
  };
};

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function OrderPaymentClient({ data }: { data: OrderPaymentData }) {
  const [pixOpen, setPixOpen] = useState(false);
  const { store, theme, pix, order } = data;
  const canPay = !order.paid && pix.key.trim() !== "";

  const paidHref = whatsAppLink(
    store.contactPhone,
    `Olá! Acabei de pagar o pedido #${order.number} por Pix. Vou enviar o comprovante. 🙏`
  );

  const themeVars = {
    "--store-primary": theme.primary,
    "--store-secondary": theme.secondary,
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{ ...themeVars, background: theme.pageBackground }}
    >
      <div className="mx-auto w-full max-w-lg">
        {/* Marca da loja */}
        <div className="mb-6 flex flex-col items-center text-center">
          {store.logo ? (
            <div
              className="relative h-20 w-20 overflow-hidden rounded-2xl shadow-sm"
              style={{ background: theme.secondary }}
            >
              <Image
                src={store.logo}
                alt={store.name}
                fill
                sizes="80px"
                className="object-cover"
              />
            </div>
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-sm"
              style={{ background: theme.primary }}
            >
              {store.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="mt-3 text-lg font-semibold text-slate-800">
            {store.name}
          </h1>
        </div>

        {/* Card do pedido */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">
              Pedido #{order.number}
            </h2>
            {order.paid ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                ✓ Pago
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Aguardando pagamento
              </span>
            )}
          </div>

          {order.customerName && (
            <p className="mt-1 text-sm text-slate-500">{order.customerName}</p>
          )}

          {/* Itens */}
          <ul className="mt-4 divide-y divide-slate-100">
            {order.lines.map((l, i) => {
              const variant = [l.color, l.size ? `Tam. ${l.size}` : ""]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      <span style={{ color: theme.primary }}>{l.quantity}x</span>{" "}
                      {l.name}
                    </p>
                    {(variant || l.productReference) && (
                      <p className="text-xs text-slate-400">
                        {[variant, l.productReference ? `Ref. ${l.productReference}` : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="flex-none text-sm font-semibold text-slate-700">
                    {money(l.lineTotal)}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Total */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm font-medium text-slate-500">Total</span>
            <span className="text-lg font-bold" style={{ color: theme.primary }}>
              {money(order.subtotal)}
            </span>
          </div>

          {/* Envio / pagamento */}
          <dl className="mt-4 space-y-1 text-sm">
            {order.shippingLabel && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Entrega</dt>
                <dd className="text-right font-medium text-slate-700">
                  {order.shippingLabel}
                </dd>
              </div>
            )}
            {order.address && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Endereço</dt>
                <dd className="text-right text-slate-600">{order.address}</dd>
              </div>
            )}
            {order.paymentLabel && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Pagamento</dt>
                <dd className="text-right font-medium text-slate-700">
                  {order.paymentLabel}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Ação de pagar */}
        {order.paid ? (
          <p className="mt-6 text-center text-sm text-emerald-700">
            Pagamento confirmado. Obrigado! 💚
          </p>
        ) : canPay ? (
          <button
            type="button"
            onClick={() => setPixOpen(true)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full py-4 text-base font-semibold text-white shadow-md transition-opacity hover:opacity-90"
            style={{ background: theme.primary }}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 9-9 9-9-9 9-9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12l3 3 5-6" />
            </svg>
            Pagar
          </button>
        ) : (
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              Fale com a loja para combinar o pagamento.
            </p>
            {paidHref && (
              <a
                href={paidHref}
                className="mt-2 inline-block text-sm font-semibold"
                style={{ color: theme.primary }}
              >
                Falar no WhatsApp
              </a>
            )}
          </div>
        )}
      </div>

      <PixPaymentModal
        open={pixOpen}
        onClose={() => setPixOpen(false)}
        pixKey={pix.key}
        pixName={pix.name}
        city={pix.city}
        amount={order.subtotal}
        orderCode={order.number}
        onPaid={() => {
          setPixOpen(false);
          if (paidHref) window.location.assign(paidHref);
        }}
      />
    </div>
  );
}
