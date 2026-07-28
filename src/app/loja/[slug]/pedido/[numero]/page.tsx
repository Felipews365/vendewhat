import { notFound } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizeStoreSlug } from "@/lib/storeSlug";
import { storefrontFromDb } from "@/lib/storefront";
import { shippingModeLabel } from "@/lib/shippingModes";
import { paymentMethodLabel } from "@/lib/paymentMethods";
import {
  OrderPaymentClient,
  type OrderPaymentLine,
} from "./OrderPaymentClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: { slug: string; numero: string } };

type PayloadLine = {
  name?: string;
  quantity?: number;
  color?: string;
  size?: string;
  lineTotal?: number;
  productReference?: string | null;
};

export async function generateMetadata({ params }: Props) {
  return { title: `Pagamento do pedido #${params.numero.replace(/\D/g, "")}` };
}

export default async function OrderPaymentPage({ params }: Props) {
  const slug = normalizeStoreSlug(params.slug);
  const orderNumber = Number.parseInt(params.numero.replace(/\D/g, ""), 10);
  const admin = createAdminSupabase();
  if (!slug || !Number.isFinite(orderNumber) || !admin) notFound();

  const { data: store } = await admin
    .from("stores")
    .select("id, name, logo, phone, storefront")
    .eq("slug", slug)
    .maybeSingle();
  if (!store) notFound();

  const { data: order } = await admin
    .from("orders")
    .select(
      "order_number, customer_name, subtotal, payment_status, payload"
    )
    .eq("store_id", store.id)
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) notFound();

  const storefront = storefrontFromDb(store.storefront);

  // Contato da loja = WhatsApp conectado (onde atende), com fallback pro cadastro.
  const { data: wa } = await admin
    .from("store_whatsapp")
    .select("connected_number")
    .eq("store_id", store.id)
    .maybeSingle();
  const connected =
    typeof wa?.connected_number === "string" ? wa.connected_number.trim() : "";
  const contactPhone =
    connected || (typeof store.phone === "string" ? store.phone : "");

  const payload = (order.payload ?? {}) as {
    lines?: PayloadLine[];
    shippingMode?: string;
    shippingModeLabel?: string;
    paymentMethod?: string;
    customerAddress?: string;
  };

  const lines: OrderPaymentLine[] = (payload.lines ?? []).map((l) => ({
    name: String(l.name ?? ""),
    quantity: Number(l.quantity ?? 0),
    color: String(l.color ?? ""),
    size: String(l.size ?? ""),
    lineTotal: Number(l.lineTotal ?? 0),
    productReference: l.productReference ?? null,
  }));

  return (
    <OrderPaymentClient
      data={{
        store: {
          name: String(store.name ?? ""),
          logo: typeof store.logo === "string" ? store.logo.trim() : "",
          contactPhone,
        },
        theme: {
          primary: storefront.themePrimary,
          secondary: storefront.themeSecondary,
          pageBackground: storefront.pageBackground,
        },
        pix: {
          key: storefront.pixKey.trim(),
          name: storefront.pixName.trim(),
          city:
            storefront.onlineCity.trim() ||
            storefront.pickupAddress.trim(),
        },
        order: {
          number:
            typeof order.order_number === "number"
              ? order.order_number
              : orderNumber,
          customerName: String(order.customer_name ?? ""),
          subtotal: Number(order.subtotal ?? 0),
          paymentLabel: paymentMethodLabel(payload.paymentMethod),
          shippingLabel:
            payload.shippingModeLabel?.trim() ||
            shippingModeLabel(payload.shippingMode),
          address: payload.customerAddress?.trim() || null,
          paid: order.payment_status === "pago",
          lines,
        },
      }}
    />
  );
}
