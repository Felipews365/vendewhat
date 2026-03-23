"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { whatsAppLink } from "@/lib/whatsapp";

export type CatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  stock: number;
};

type StoreInfo = {
  name: string;
  description: string | null;
  logo: string | null;
  phone: string | null;
};

export function LojaClient({
  store,
  products,
}: {
  store: StoreInfo;
  products: CatalogProduct[];
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const items = useMemo(() => {
    return products
      .filter((p) => (cart[p.id] ?? 0) > 0)
      .map((p) => ({
        ...p,
        quantity: cart[p.id]!,
        lineTotal: p.price * cart[p.id]!,
      }));
  }, [products, cart]);

  const totalItems = useMemo(
    () => Object.values(cart).reduce((a, b) => a + b, 0),
    [cart]
  );

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.lineTotal, 0),
    [items]
  );

  function addToCart(p: CatalogProduct) {
    if (p.stock <= 0) return;
    setCart((c) => {
      const q = c[p.id] ?? 0;
      if (q >= p.stock) return c;
      return { ...c, [p.id]: q + 1 };
    });
  }

  function setQty(productId: string, qty: number, maxStock: number) {
    if (qty <= 0) {
      setCart((c) => {
        const next = { ...c };
        delete next[productId];
        return next;
      });
      return;
    }
    setCart((c) => ({ ...c, [productId]: Math.min(qty, maxStock) }));
  }

  function buildOrderMessage(): string {
    const lines = [
      `*Pedido — ${store.name}*`,
      "",
      ...items.map(
        (i) =>
          `${i.quantity}x ${i.name} — R$ ${i.lineTotal.toFixed(2)} (un. R$ ${i.price.toFixed(2)})`
      ),
      "",
      `*Subtotal: R$ ${subtotal.toFixed(2)}*`,
    ];
    if (notes.trim()) {
      lines.push("", `Obs: ${notes.trim()}`);
    }
    return lines.join("\n");
  }

  const orderHref = whatsAppLink(store.phone, buildOrderMessage());
  const contactHref = whatsAppLink(
    store.phone,
    `Olá! Vim pelo catálogo da ${store.name} no VendeWhat.`
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-28 md:pb-8">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {store.logo ? (
              <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                <Image
                  src={store.logo}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-whatsapp/10 flex items-center justify-center text-2xl flex-shrink-0">
                🏪
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 truncate text-lg">
                {store.name}
              </h1>
              <p className="text-xs text-slate-500 truncate">
                Catálogo no WhatsApp
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 text-sm font-semibold px-3 py-2.5 rounded-xl hover:bg-slate-200 transition-colors"
            >
              <span>🛒</span>
              <span className="hidden sm:inline">Carrinho</span>
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-whatsapp text-white text-xs font-bold min-w-[1.25rem] h-5 px-1 rounded-full flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </button>
            {contactHref && (
              <a
                href={contactHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-whatsapp text-white text-sm font-semibold px-3 py-2.5 rounded-xl hover:bg-whatsapp-dark transition-colors shadow-sm"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                <span className="hidden sm:inline">WhatsApp</span>
              </a>
            )}
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-4 pt-8 pb-10 text-center">
        <p className="text-sm text-whatsapp font-medium mb-2">VendeWhat</p>
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
          {store.name}
        </h2>
        {store.description ? (
          <p className="text-slate-600 max-w-2xl mx-auto">{store.description}</p>
        ) : (
          <p className="text-slate-600 max-w-2xl mx-auto">
            Adicione produtos ao carrinho e envie o pedido pelo WhatsApp.
          </p>
        )}
      </section>

      <main className="max-w-5xl mx-auto px-4 pb-16">
        {products.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-5xl">📦</span>
            <p className="mt-4 text-slate-600 font-medium">
              Em breve teremos produtos aqui
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => {
              const inCart = cart[product.id] ?? 0;
              const canAdd = product.stock > 0;
              return (
                <article
                  key={product.id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                >
                  <div className="aspect-square bg-slate-100 relative">
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl text-slate-300">
                        📷
                      </div>
                    )}
                    {product.stock <= 0 && (
                      <span className="absolute top-3 left-3 bg-slate-900/85 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                        Esgotado
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="font-semibold text-slate-900 line-clamp-2">
                      {product.name}
                    </h3>
                    {product.description && (
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                        {product.description}
                      </p>
                    )}
                    <p className="text-xl font-bold text-whatsapp mt-3">
                      R$ {Number(product.price).toFixed(2)}
                    </p>
                    {product.stock > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        {product.stock} em estoque
                      </p>
                    )}
                    <div className="mt-4 pt-3 border-t border-slate-100 mt-auto">
                      {!canAdd ? (
                        <button
                          type="button"
                          disabled
                          className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-400 text-sm font-medium cursor-not-allowed"
                        >
                          Indisponível
                        </button>
                      ) : inCart === 0 ? (
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          className="w-full py-2.5 rounded-xl bg-whatsapp text-white text-sm font-semibold hover:bg-whatsapp-dark transition-colors"
                        >
                          Adicionar ao carrinho
                        </button>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setQty(product.id, inCart - 1, product.stock)
                            }
                            className="w-10 h-10 rounded-xl bg-slate-100 font-bold text-slate-700 hover:bg-slate-200"
                          >
                            −
                          </button>
                          <span className="font-semibold text-slate-800">
                            {inCart} no carrinho
                          </span>
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            disabled={inCart >= product.stock}
                            className="w-10 h-10 rounded-xl bg-slate-100 font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        <p>
          Loja criada com{" "}
          <Link href="/" className="text-whatsapp font-medium hover:underline">
            VendeWhat
          </Link>
        </p>
      </footer>

      {/* Carrinho flutuante (mobile) */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200 z-30 md:hidden flex items-center justify-between gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div>
            <p className="text-xs text-slate-500">{totalItems} itens</p>
            <p className="font-bold text-slate-900">R$ {subtotal.toFixed(2)}</p>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex-1 max-w-[200px] py-3 rounded-xl bg-whatsapp text-white font-semibold"
          >
            Ver carrinho
          </button>
        </div>
      )}

      {/* Painel do carrinho */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Carrinho"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setCartOpen(false)}
            aria-label="Fechar"
          />
          <div className="relative w-full sm:max-w-md max-h-[85vh] sm:rounded-2xl bg-white shadow-xl flex flex-col rounded-t-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900">Seu carrinho</h3>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-2"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {items.length === 0 ? (
                <p className="text-slate-500 text-center py-8">
                  Carrinho vazio. Adicione produtos na loja.
                </p>
              ) : (
                items.map((i) => (
                  <div
                    key={i.id}
                    className="flex gap-3 items-center border-b border-slate-100 pb-4 last:border-0"
                  >
                    <div className="relative w-16 h-16 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                      {i.image ? (
                        <Image
                          src={i.image}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl">
                          📷
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">
                        {i.name}
                      </p>
                      <p className="text-sm text-slate-500">
                        R$ {i.price.toFixed(2)} × {i.quantity}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => setQty(i.id, i.quantity - 1, i.stock)}
                          className="w-8 h-8 rounded-lg bg-slate-100 text-sm font-bold"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-medium">
                          {i.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setQty(
                              i.id,
                              Math.min(i.quantity + 1, i.stock),
                              i.stock
                            )
                          }
                          disabled={i.quantity >= i.stock}
                          className="w-8 h-8 rounded-lg bg-slate-100 text-sm font-bold disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <p className="font-semibold text-whatsapp text-sm whitespace-nowrap">
                      R$ {i.lineTotal.toFixed(2)}
                    </p>
                  </div>
                ))
              )}
              {items.length > 0 && (
                <>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Observações (opcional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ex: entrega à tarde, troco para R$ 100..."
                      rows={3}
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-whatsapp focus:border-transparent resize-none"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-2 text-lg font-bold text-slate-900">
                    <span>Total</span>
                    <span className="text-whatsapp">R$ {subtotal.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
            {items.length > 0 && orderHref && (
              <div className="p-4 border-t border-slate-100 bg-slate-50">
                <a
                  href={orderHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setCartOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-whatsapp text-white font-semibold hover:bg-whatsapp-dark transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Enviar pedido no WhatsApp
                </a>
                <p className="text-xs text-slate-400 text-center mt-2">
                  Abre o WhatsApp com o pedido já formatado
                </p>
              </div>
            )}
            {items.length > 0 && !orderHref && (
              <div className="p-4 border-t bg-amber-50 text-amber-800 text-sm text-center">
                A loja ainda não configurou o WhatsApp. Entre em contato por
                outro canal.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
