"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";

type GatewayStatus = {
  connected: boolean;
  enabled?: boolean;
  isTest?: boolean;
  mpUserId?: string | null;
  maskedToken?: string;
};

const MP_PANEL_URL = "https://www.mercadopago.com.br/developers/panel/app";

/** Um passo do guia: bolinha numerada + texto. */
function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
        {n}
      </span>
      <div className="space-y-1 pt-0.5">
        <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">{title}</p>
        <div className="text-sm leading-relaxed text-stone-600 dark:text-slate-300">
          {children}
        </div>
      </div>
    </li>
  );
}

/** Pergunta e resposta recolhida, para quem travar em algum passo. */
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-stone-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <summary className="cursor-pointer list-none text-sm font-medium text-stone-700 marker:content-none dark:text-slate-200">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
        {q}
      </summary>
      <div className="mt-2 pl-4 text-sm leading-relaxed text-stone-600 dark:text-slate-300">
        {children}
      </div>
    </details>
  );
}

/** Passo a passo de como conectar o Mercado Pago (para lojista leigo). */
function GuiaConexao() {
  return (
    <div className="space-y-5">
      <ol className="space-y-4">
        <Step n={1} title="Tenha uma conta no Mercado Pago">
          É a mesma conta que você já usa para vender/receber. Se ainda não tem,
          crie uma grátis em{" "}
          <a
            href="https://www.mercadopago.com.br"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-violet-700 hover:underline dark:text-violet-300"
          >
            mercadopago.com.br
          </a>
          . O dinheiro das vendas cai nessa conta.
        </Step>

        <Step n={2} title="Abra o painel de desenvolvedores e crie uma aplicação">
          Entre em{" "}
          <a
            href={MP_PANEL_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-violet-700 hover:underline dark:text-violet-300"
          >
            mercadopago.com.br/developers/panel/app
          </a>{" "}
          (faça login com a sua conta) e clique em <strong>“Criar aplicação”</strong>.
          Dê um nome qualquer, por exemplo o nome da sua loja.
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Atenção neste ponto:</strong> quando o Mercado Pago perguntar qual
            produto você vai usar, escolha <strong>Checkout Pro</strong>. Se escolher
            outro, os pagamentos da sua loja não funcionam e você precisará criar outra
            aplicação.
          </p>
        </Step>

        <Step n={3} title="Copie o Access Token de produção">
          Dentro da aplicação, abra <strong>“Credenciais de produção”</strong> e copie o
          campo <strong>Access Token</strong>. Ele é um texto comprido que começa com{" "}
          <code className="rounded bg-stone-100 px-1 py-0.5 text-xs dark:bg-slate-800">
            APP_USR-
          </code>
          . Copie o token inteiro, sem espaços.
          <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">
            Só quer testar antes de vender de verdade? Use as{" "}
            <strong>credenciais de teste</strong> — o token começa com{" "}
            <code className="rounded bg-stone-100 px-1 py-0.5 dark:bg-slate-800">TEST-</code>.
          </p>
        </Step>

        <Step n={4} title="Cole o token no campo abaixo e conecte">
          Cole no campo <strong>Access Token</strong> desta página e clique em{" "}
          <strong>“Conectar Mercado Pago”</strong>. Nós conferimos o token na hora com o
          Mercado Pago: se estiver certo, o selo aqui em cima vira{" "}
          <strong>“Conectado”</strong>.
        </Step>

        <Step n={5} title="Pronto — sua loja já recebe pagamentos">
          O botão <strong>“Pagar com Mercado Pago”</strong> passa a aparecer sozinho no
          carrinho da sua loja. O cliente paga com Pix, cartão ou boleto, o dinheiro cai
          na <strong>sua</strong> conta do Mercado Pago e o pedido é marcado como{" "}
          <strong>Pago</strong> automaticamente em{" "}
          <Link
            href="/dashboard/pedidos"
            className="font-semibold text-violet-700 hover:underline dark:text-violet-300"
          >
            Pedidos
          </Link>
          . Você não precisa conferir comprovante na mão.
        </Step>
      </ol>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
          Dúvidas comuns
        </p>
        <Faq q="Não achei o Access Token, e agora?">
          O Access Token não fica na tela normal do Mercado Pago (a de ver saldo e
          vendas). Ele fica no <strong>painel de desenvolvedores</strong>: entre em{" "}
          <a
            href={MP_PANEL_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-violet-700 hover:underline dark:text-violet-300"
          >
            mercadopago.com.br/developers/panel/app
          </a>
          , clique na aplicação que você criou e procure “Credenciais de produção”.
        </Faq>
        <Faq q="Isso é seguro? Alguém pode ver meu token?">
          O token é guardado no nosso servidor e <strong>nunca</strong> aparece completo
          na tela nem vai para o navegador — aqui você só vê o começo e o fim dele. Seus
          clientes jamais têm acesso. Se quiser cortar o acesso a qualquer momento, é só
          clicar em <strong>Desconectar</strong>.
        </Faq>
        <Faq q="Quando o dinheiro cai na minha conta?">
          O pagamento vai direto para a <strong>sua</strong> conta do Mercado Pago — nós
          não ficamos com o dinheiro nem cobramos taxa por venda. O prazo de liberação e
          as taxas são os do próprio Mercado Pago, iguais aos de qualquer venda que você
          já faz por lá.
        </Faq>
        <Faq q="Deu erro “Token inválido ou sem permissão”">
          Quase sempre é uma destas três coisas: o token foi copiado pela metade (falta
          um pedaço no fim), você copiou a <strong>Public Key</strong> em vez do{" "}
          <strong>Access Token</strong>, ou a aplicação foi criada com um produto
          diferente de <strong>Checkout Pro</strong>. Confira e cole de novo.
        </Faq>
        <Faq q="Prefiro receber só por Pix na mão, preciso disso?">
          Não. Isto é opcional. Sem conectar, sua loja continua funcionando com Pix,
          dinheiro e cartão combinados pelo WhatsApp — você é quem confere o pagamento e
          marca o pedido como pago.
        </Faq>
      </div>
    </div>
  );
}

export default function PagamentosPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GatewayStatus>({ connected: false });
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/store/payment-gateway", { cache: "no-store" });
      const data = (await res.json()) as GatewayStatus & { ok?: boolean };
      if (data?.ok) setStatus(data);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleConnect() {
    setError("");
    if (!token.trim()) {
      setError("Cole o Access Token do Mercado Pago.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/store/payment-gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Não foi possível conectar.");
        return;
      }
      setToken("");
      showToast("Mercado Pago conectado!");
      await load();
    } catch {
      setError("Falha de rede ao conectar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setError("");
    if (!confirm("Desconectar o Mercado Pago desta loja? Seus clientes deixarão de pagar online.")) {
      return;
    }
    try {
      await fetch("/api/store/payment-gateway", { method: "DELETE" });
      showToast("Mercado Pago desconectado.");
      setStatus({ connected: false });
    } catch {
      setError("Falha de rede ao desconectar.");
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-stone-500 dark:text-slate-400">Carregando…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-xl font-bold text-stone-800 dark:text-slate-100">Pagamentos da loja</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
          Conecte o <strong>Mercado Pago</strong> da sua loja para que seus clientes
          paguem o pedido online (cartão, Pix e boleto). O dinheiro cai direto na sua
          conta do Mercado Pago.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {!status.connected && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold text-stone-800 dark:text-slate-100">
            Como conectar — passo a passo
          </h2>
          <p className="mb-4 mt-1 text-sm text-stone-500 dark:text-slate-400">
            Leva uns 5 minutos e só precisa ser feito uma vez. Não precisa entender nada
            de programação: é só copiar um código do Mercado Pago e colar aqui embaixo.
          </p>
          <GuiaConexao />
        </section>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-stone-800 dark:text-slate-100">Conta Mercado Pago</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              status.connected
                ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                : "bg-stone-100 text-stone-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {status.connected ? "Conectado" : "Não conectado"}
          </span>
        </div>

        {status.connected ? (
          <div className="space-y-3">
            <p className="text-sm text-stone-600 dark:text-slate-300">
              Tudo certo! O botão <strong>“Pagar com Mercado Pago”</strong> já aparece no
              carrinho da sua loja e os pedidos pagos são marcados sozinhos em{" "}
              <Link
                href="/dashboard/pedidos"
                className="font-semibold text-violet-700 hover:underline dark:text-violet-300"
              >
                Pedidos
              </Link>
              .
            </p>
            {status.isTest && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  Modo teste
                </span>
                <p className="mt-1.5 text-xs text-amber-800 dark:text-amber-200">
                  Você conectou um token de teste (<code>TEST-</code>): dá para simular a
                  compra, mas <strong>nenhum dinheiro de verdade entra</strong>. Quando
                  quiser vender pra valer, desconecte e cole o token de produção (o que
                  começa com <code>APP_USR-</code>).
                </p>
              </div>
            )}
            <p className="text-sm text-stone-600 dark:text-slate-300">
              Token: <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{status.maskedToken}</code>
            </p>
            {status.mpUserId && (
              <p className="text-xs text-stone-500 dark:text-slate-400">
                ID da conta MP: {status.mpUserId}
              </p>
            )}
            <button
              onClick={handleDisconnect}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Desconectar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
                Access Token
              </label>
              <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
                É o código que você copia no passo 3 do guia acima. Começa com{" "}
                <code>APP_USR-</code> (ou <code>TEST-</code>, se for para testar).
              </p>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="APP_USR-… ou TEST-…"
                autoComplete="off"
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={saving}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
            >
              {saving ? "Validando…" : "Conectar Mercado Pago"}
            </button>
          </div>
        )}
      </section>

      {status.connected && (
        <details className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer list-none font-semibold text-stone-800 marker:content-none dark:text-slate-100">
            Rever o passo a passo da conexão
          </summary>
          <div className="mt-4">
            <GuiaConexao />
          </div>
        </details>
      )}

      <p className="text-xs text-stone-400 dark:text-slate-500">
        Recurso dos planos Profissional e Empresarial. Seu token fica guardado com
        segurança no servidor e nunca é exibido por completo.
      </p>
    </div>
  );
}
