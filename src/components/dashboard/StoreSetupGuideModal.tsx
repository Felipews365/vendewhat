"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";

const STEPS = [
  {
    n: 1,
    title: "Foto de capa (banner) — opcional",
    body: "Se quiser, uma imagem larga no topo (ou várias em carrossel). Sem foto, a loja segue com as cores da marca.",
    href: "/dashboard/configuracoes#passo-banner",
  },
  {
    n: 2,
    title: "Textos no banner",
    body: "Frase pequena, título grande e texto do botão. Tudo aparece por cima da foto.",
    href: "/dashboard/configuracoes#passo-textos-banner",
  },
  {
    n: 3,
    title: "Cores da marca",
    body: "Ajuste as cores dos botões e detalhes para combinar com sua identidade.",
    href: "/dashboard/configuracoes#passo-cores",
  },
  {
    n: 4,
    title: "Redes sociais",
    body: "Instagram e outras redes aparecem no rodapé e no topo da vitrine.",
    href: "/dashboard/configuracoes#passo-redes",
  },
  {
    n: 5,
    title: "Informações extras",
    body: "Frete, pedido mínimo, trocas — linhas que ficam abaixo do logo.",
    href: "/dashboard/configuracoes#passo-info",
  },
  {
    n: 6,
    title: "Barra de busca",
    body: "Personalize o texto de exemplo que o cliente vê ao procurar produtos.",
    href: "/dashboard/configuracoes#passo-busca",
  },
  {
    n: 7,
    title: "Produtos",
    body: "Cadastre fotos, nome e preço. Sem produtos, a loja fica vazia para quem visita.",
    href: "/dashboard/produtos/novo",
  },
] as const;

export function StoreSetupGuideModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-setup-guide-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-lg max-h-[min(90vh,640px)] sm:max-h-[85vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-5 pb-3 border-b border-slate-100 bg-gradient-to-br from-teal-50/80 to-white">
          <h2
            id="store-setup-guide-title"
            className="text-lg font-bold text-slate-800"
          >
            Como montar sua loja
          </h2>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">
            Siga a ordem abaixo — cada passo abre na página certa para você
            editar. Não precisa fazer tudo de uma vez.
          </p>
        </div>

        <ol className="flex-1 overflow-y-auto px-5 py-4 space-y-3 list-none">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 hover:bg-teal-50/40 transition-colors"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-landing-primary text-white text-sm font-bold">
                {step.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800 text-sm">
                  {step.title}
                </p>
                <p className="text-xs text-slate-600 mt-1 leading-snug">
                  {step.body}
                </p>
                <Link
                  href={step.href}
                  onClick={onClose}
                  className="inline-block mt-2 text-xs font-semibold text-landing-primary hover:text-landing-accent underline-offset-2 hover:underline"
                >
                  Ir a este passo →
                </Link>
              </div>
            </li>
          ))}
        </ol>

        <div className="shrink-0 flex flex-col sm:flex-row gap-2 p-4 border-t border-slate-100 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Fechar
          </button>
          <Link
            href="/dashboard/configuracoes"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-landing-primary text-white text-sm font-semibold text-center hover:opacity-90 transition-opacity"
          >
            Abrir página “Monte a loja”
          </Link>
        </div>
      </div>
    </div>
  );
}
