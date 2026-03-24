"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-5 w-5 shrink-0 text-slate-400"}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function AccountRow({
  href,
  newTab,
  onClick,
  icon,
  label,
  iconBg = "bg-white",
}: {
  href?: string;
  newTab?: boolean;
  onClick?: () => void;
  icon: ReactNode;
  label: string;
  iconBg?: string;
}) {
  const className =
    "flex w-full items-center gap-4 rounded-2xl bg-slate-100 px-4 py-3.5 text-left transition hover:bg-slate-200/80 active:bg-slate-200/90";
  const body = (
    <>
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-slate-200/60 ${iconBg}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 font-semibold text-slate-800">{label}</span>
      <ChevronRight />
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={className}
        {...(newTab
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function SectionTitle({
  children,
  className = "mt-10",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-lg font-bold text-slate-900 border-b border-slate-200 pb-2 mb-3 ${className}`}
    >
      {children}
    </h2>
  );
}

type StoreRow = {
  name: string;
  slug: string;
  phone: string | null;
  logo: string | null;
};

export default function ContaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [store, setStore] = useState<StoreRow | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    setEmail(user.email || "");
    setName(
      (user.user_metadata?.name as string | undefined)?.trim() ||
        user.email?.split("@")[0] ||
        ""
    );

    const { data: storeRow } = await supabase
      .from("stores")
      .select("name, slug, phone, logo")
      .eq("user_id", user.id)
      .maybeSingle();

    if (storeRow) {
      setStore({
        name: storeRow.name,
        slug: storeRow.slug,
        phone: storeRow.phone,
        logo: storeRow.logo,
      });
    } else {
      setStore(null);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  const displayName =
    name || store?.name?.trim() || "Sua conta";
  const phoneDisplay = store?.phone?.trim() || "—";

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-landing-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8 pb-16">
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
        Minha conta
      </h1>

      <SectionTitle className="mt-6">Perfil</SectionTitle>
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex gap-4">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-slate-200 ring-2 ring-slate-100">
            {store?.logo ? (
              <Image
                src={store.logo}
                alt=""
                fill
                className="object-cover"
                sizes="96px"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center px-2 text-center text-[10px] font-medium leading-tight text-slate-500">
                Adicione uma foto
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-lg font-bold text-slate-900 truncate">
              {displayName}
            </p>
            <p className="mt-1 text-sm text-slate-600 break-all">{email}</p>
            <p className="mt-0.5 text-sm text-slate-600">{phoneDisplay}</p>
            <button
              type="button"
              onClick={() => setProfileOpen((o) => !o)}
              className="mt-3 text-sm font-semibold text-landing-primary hover:text-landing-primary-hover"
            >
              {profileOpen ? "Ver menos" : "Ver mais"}
            </button>
          </div>
        </div>
        {profileOpen && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
            {store?.name && (
              <p>
                <span className="font-medium text-slate-700">Loja:</span>{" "}
                {store.name}
              </p>
            )}
            {store?.slug && (
              <p>
                <span className="font-medium text-slate-700">Slug:</span>{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                  {store.slug}
                </code>
              </p>
            )}
            <p className="text-xs text-slate-500">
              A foto da loja pode ser alterada em{" "}
              <Link
                href="/dashboard/configuracoes"
                className="font-medium text-landing-primary hover:underline"
              >
                Montar sua loja
              </Link>
              .
            </p>
          </div>
        )}
      </div>

      <SectionTitle>Assinatura</SectionTitle>
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-landing-primary/10 text-landing-primary">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900">VendeWhat</p>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              Use o painel para montar o catálogo, receber pedidos e compartilhar a
              sua loja no WhatsApp.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <AccountRow
          href="/dashboard/planos"
          label="Ver planos"
          icon={
            <svg
              className="h-5 w-5 text-landing-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
          }
        />
        <AccountRow
          href="/dashboard/compartilhar"
          label="Compartilhar sua loja"
          icon={
            <svg
              className="h-5 w-5 text-landing-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          }
        />
      </div>

      <SectionTitle>Loja</SectionTitle>
      <div className="flex flex-col gap-2">
        <AccountRow
          href="/dashboard/configuracoes"
          label="Configurações da loja"
          icon={
            <svg
              className="h-5 w-5 text-landing-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          }
        />
        <AccountRow
          href={store?.slug ? `/loja/${store.slug}` : "/dashboard/configuracoes"}
          newTab={Boolean(store?.slug)}
          label="Ver catálogo público"
          icon={
            <svg
              className="h-5 w-5 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          }
        />
        <AccountRow
          href="/dashboard/pedidos"
          label="Pedidos"
          icon={
            <svg
              className="h-5 w-5 text-violet-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
          }
        />
        <AccountRow
          href="/dashboard/produtos"
          label="Produtos e catálogo"
          icon={
            <svg
              className="h-5 w-5 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          }
        />
      </div>

      <SectionTitle>Ajuda</SectionTitle>
      <div className="flex flex-col gap-2">
        <AccountRow
          href="/#duvidas"
          label="Dúvidas frequentes"
          icon={
            <svg
              className="h-5 w-5 text-landing-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <AccountRow
          href="/"
          label="Voltar ao site"
          icon={
            <svg
              className="h-5 w-5 text-landing-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          }
        />
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-10 w-full rounded-2xl bg-landing-primary py-4 text-center text-base font-bold text-white shadow-md transition hover:bg-landing-primary-hover"
      >
        Sair
      </button>
    </main>
  );
}
