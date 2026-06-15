import Link from "next/link";
import Header from "@/components/Header";
import AnimateOnScroll from "@/components/AnimateOnScroll";
import FaqAccordion from "@/components/FaqAccordion";
import AiChatDemo from "@/components/AiChatDemo";
import { loadPlans } from "@/lib/plans.server";
import type { PlanDefinition } from "@/lib/plans";

export const dynamic = "force-dynamic";

/** Converte o plano do catálogo/banco para o formato exibido na landing. */
function toLandingPlan(p: PlanDefinition) {
  return {
    name: p.title.replace(/^Plano\s+/i, ""),
    price: String(Math.floor(p.monthly)),
    period: "/mês",
    desc: p.description,
    features: p.features,
    highlight: Boolean(p.highlight),
  };
}

const steps = [
  { step: "1", title: "Monte sua loja", desc: "Cadastre seus produtos com fotos, descrições e variações.", icon: "🏪" },
  { step: "2", title: "Compartilhe o link", desc: "Envie o link da sua loja nas redes sociais e WhatsApp.", icon: "🔗" },
  { step: "3", title: "Cliente faz o pedido", desc: "Seu cliente escolhe produtos, pagamento e entrega.", icon: "🛒" },
  { step: "4", title: "Receba no WhatsApp", desc: "O pedido chega organizado direto no seu WhatsApp.", icon: "📱" },
];

const features = [
  { title: "Catálogo digital", desc: "Produtos com fotos, descrições, variações e controle de estoque.", icon: "📦" },
  { title: "Sem taxas sobre vendas", desc: "Aceite pedidos ilimitados sem pagar nada a mais.", icon: "💰" },
  { title: "Pagamento integrado", desc: "PIX, cartão de crédito e link de cobrança.", icon: "💳" },
  { title: "Cálculo de frete", desc: "Simule valor e prazo via Correios e transportadoras.", icon: "🚚" },
  { title: "Atendimento por IA", desc: "Uma IA responde seus clientes no WhatsApp 24h por dia.", icon: "🤖" },
  { title: "Link personalizado", desc: "Compartilhe sua loja com um link único e profissional.", icon: "🌐" },
];

const testimonials = [
  {
    name: "Fabiana L.",
    role: "Loja de vestidos",
    text: "O aplicativo é muito bom. Uso para as clientes visualizarem os modelos e preços. A equipe de suporte é muito rápida em atender!",
    avatar: "FL",
    color: "bg-pink-500",
  },
  {
    name: "Carlos M.",
    role: "Loja de eletrônicos",
    text: "Aplicativo excelente e muito prático! Agora controlamos todo nosso estoque e recebemos todos os pagamentos pela plataforma.",
    avatar: "CM",
    color: "bg-blue-500",
  },
  {
    name: "Raquel B.",
    role: "Loja de decoração",
    text: "Amando a experiência! Super intuitivo e personalizável, ficou exatamente como imaginei e tem sido super eficiente nas vendas.",
    avatar: "RB",
    color: "bg-purple-500",
  },
  {
    name: "Daniele S.",
    role: "Moda feminina",
    text: "Depois que conheci esse app minha lojinha bombou demais! Estão de parabéns, sem contar com o suporte humano que é nota 1000.",
    avatar: "DS",
    color: "bg-amber-500",
  },
  {
    name: "Luana O.",
    role: "Acessórios",
    text: "As categorias deixam tudo bem organizado, os destaques são ótimos e as clientes sentem bastante facilidade para fechar pedidos.",
    avatar: "LO",
    color: "bg-emerald-500",
  },
  {
    name: "Aline B.",
    role: "Produtos naturais",
    text: "Queria muito um site fácil de usar. O VendeWhat é auto explicativo. Cadastrei produtos e estoque com facilidade. Satisfeita!",
    avatar: "AB",
    color: "bg-red-500",
  },
];

const faqs = [
  {
    q: "Preciso ter CNPJ para criar minha loja?",
    a: "Não! Você pode começar com CPF e migrar para CNPJ quando for o momento certo.",
  },
  {
    q: "A VendeWhat cobra taxa sobre as vendas?",
    a: "Não cobramos nenhuma taxa sobre suas vendas. Você paga apenas o plano mensal.",
  },
  {
    q: "Como meus clientes recebem o link da loja?",
    a: "Você recebe um link personalizado para compartilhar no WhatsApp, Instagram, Facebook ou qualquer rede social.",
  },
  {
    q: "Posso cancelar a qualquer momento?",
    a: "Sim! Sem multas, sem fidelidade. Cancele quando quiser.",
  },
];

function StarRow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} className="h-4 w-4 fill-current text-amber-400" viewBox="0 0 20 20">
          <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
        </svg>
      ))}
    </div>
  );
}

/** Mockup flutuante de uma loja, exibido no hero. */
function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm vw-float-slow">
      {/* glow atrás */}
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-teal-300/40 via-emerald-200/30 to-orange-200/40 blur-2xl" />

      {/* janela do navegador */}
      <div className="overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-teal-900/20 ring-1 ring-black/5">
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] text-slate-400 ring-1 ring-slate-200">
            vendewhat.com/sua-loja
          </span>
        </div>

        {/* capa da loja */}
        <div className="relative h-20 bg-gradient-to-r from-teal-500 via-emerald-500 to-orange-400">
          <span className="absolute -bottom-5 left-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-landing-primary shadow-md ring-2 ring-white">
            🛍️
          </span>
        </div>
        <div className="px-4 pb-4 pt-7">
          <p className="text-sm font-bold text-slate-800">Boutique da Lu</p>
          <p className="text-[11px] text-slate-400">Moda &amp; acessórios · online</p>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {[
              { emoji: "👗", name: "Vestido floral", price: "R$ 129" },
              { emoji: "👜", name: "Bolsa couro", price: "R$ 89" },
              { emoji: "👠", name: "Scarpin nude", price: "R$ 159" },
              { emoji: "🧥", name: "Casaco trench", price: "R$ 210" },
            ].map((p) => (
              <div key={p.name} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2">
                <div className="flex h-12 items-center justify-center rounded-lg bg-white text-2xl">
                  {p.emoji}
                </div>
                <p className="mt-1.5 truncate text-[11px] font-medium text-slate-700">{p.name}</p>
                <p className="text-[11px] font-bold text-landing-primary">{p.price}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* badge flutuante: novo pedido */}
      <div className="vw-float absolute -left-4 top-24 flex items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2 shadow-xl">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-whatsapp/15 text-base">
          ✅
        </span>
        <div>
          <p className="text-[11px] font-bold leading-none text-slate-800">Novo pedido!</p>
          <p className="mt-0.5 text-[10px] text-slate-400">via WhatsApp</p>
        </div>
      </div>

      {/* badge flutuante: faturamento */}
      <div
        className="vw-float absolute -right-3 bottom-16 flex items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2 shadow-xl"
        style={{ animationDelay: "1.5s" }}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-base">
          📈
        </span>
        <div>
          <p className="text-[11px] font-bold leading-none text-emerald-600">+ R$ 1.240</p>
          <p className="mt-0.5 text-[10px] text-slate-400">esta semana</p>
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  const plans = (await loadPlans()).map(toLandingPlan);
  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* Aurora animada no topo */}
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[min(620px,70vh)]" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-br from-teal-100/80 via-orange-50/70 to-amber-100/60" />
        <div className="vw-blob absolute -right-20 -top-24 h-80 w-80 rounded-full bg-orange-300/40 blur-3xl" />
        <div
          className="vw-blob absolute -left-24 top-8 h-96 w-96 rounded-full bg-teal-300/40 blur-3xl"
          style={{ animationDelay: "4s" }}
        />
        <div
          className="vw-blob absolute left-1/3 top-40 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl"
          style={{ animationDelay: "8s" }}
        />
      </div>

      <Header />

      {/* Hero */}
      <section className="overflow-hidden px-4 pb-24 pt-32 md:pt-40">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          {/* Texto */}
          <div className="text-center lg:text-left">
            <AnimateOnScroll animation="fade-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-200/70 bg-white/70 px-4 py-1.5 text-xs font-semibold text-landing-primary shadow-sm backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-whatsapp opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-whatsapp" />
                </span>
                Novo: IA atende seus clientes no WhatsApp
              </span>
            </AnimateOnScroll>

            <AnimateOnScroll animation="fade-up" delay={100}>
              <h1 className="mt-6 text-4xl font-bold leading-tight text-slate-800 md:text-5xl lg:text-6xl">
                Venda mais pelo{" "}
                <span className="vw-gradient-text bg-gradient-to-r from-whatsapp via-emerald-500 to-teal-500">
                  WhatsApp
                </span>{" "}
                sem complicação
              </h1>
            </AnimateOnScroll>

            <AnimateOnScroll animation="fade-up" delay={200}>
              <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600 lg:mx-0">
                O VendeWhat te dá catálogo digital, pedidos organizados e um link
                profissional para compartilhar com seus clientes. Tudo em minutos.
              </p>
            </AnimateOnScroll>

            <AnimateOnScroll animation="fade-up" delay={300}>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
                <Link
                  href="#criar-loja"
                  className="group inline-flex items-center gap-2 rounded-xl bg-landing-primary px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-teal-900/20 transition-all hover:scale-105 hover:bg-landing-primary-hover"
                >
                  Criar minha loja
                  <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href="#como-funciona"
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white/70 px-7 py-3.5 text-lg font-semibold text-slate-700 backdrop-blur transition-all hover:border-slate-300 hover:bg-white"
                >
                  Ver como funciona
                </Link>
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll animation="fade-up" delay={400}>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
                <div className="flex -space-x-2">
                  {["bg-pink-500", "bg-blue-500", "bg-purple-500", "bg-amber-500"].map((c, i) => (
                    <span
                      key={i}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-white ${c}`}
                    >
                      {["FL", "CM", "RB", "DS"][i]}
                    </span>
                  ))}
                </div>
                <div className="text-center sm:text-left">
                  <StarRow className="justify-center sm:justify-start" />
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="font-bold text-slate-800">+24.000 lojistas</span> já vendem com a gente
                  </p>
                </div>
              </div>
            </AnimateOnScroll>
          </div>

          {/* Visual */}
          <AnimateOnScroll animation="scale" delay={200} className="hidden lg:block">
            <HeroPreview />
          </AnimateOnScroll>
        </div>

        {/* Stats */}
        <div className="mx-auto mt-20 grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-3">
          {[
            { value: "+ R$40 milhões", label: "vendidos por semana", icon: "💸" },
            { value: "+ 24.000 lojistas", label: "já usam a plataforma", icon: "🏪" },
            { value: "+ 55.000 pedidos", label: "feitos por semana", icon: "📦" },
          ].map((stat, i) => (
            <AnimateOnScroll key={stat.label} animation="fade-up" delay={i * 100}>
              <div className="group rounded-2xl border border-white/60 bg-white/80 p-6 text-center shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:shadow-lg">
                <span className="text-2xl transition-transform group-hover:scale-110">{stat.icon}</span>
                <p className="mt-2 text-2xl font-bold text-slate-800 md:text-3xl">{stat.value}</p>
                <p className="mt-1 text-sm text-slate-600">{stat.label}</p>
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-28 bg-white px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <AnimateOnScroll animation="fade-up">
            <p className="text-center text-sm font-bold uppercase tracking-wider text-landing-accent">Simples assim</p>
            <h2 className="mt-2 text-center text-3xl font-bold text-slate-800 md:text-4xl">
              Veja como é fácil vender pela VendeWhat
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
              Em 4 passos rápidos, sua loja estará pronta para receber pedidos
            </p>
          </AnimateOnScroll>
          <div className="relative mt-14 grid gap-8 md:grid-cols-4">
            {/* linha conectora (desktop) */}
            <div className="absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-teal-200 to-transparent md:block" />
            {steps.map((item, i) => (
              <AnimateOnScroll key={item.step} animation="fade-up" delay={i * 120}>
                <div className="group relative text-center">
                  <span className="relative z-10 mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 text-3xl shadow-sm ring-1 ring-teal-100 transition-transform group-hover:scale-110 group-hover:shadow-md">
                    {item.icon}
                  </span>
                  <span className="mt-4 block text-xs font-bold uppercase tracking-wider text-landing-primary">
                    Passo {item.step}
                  </span>
                  <h3 className="mt-2 font-semibold text-slate-800">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* Atendimento por IA */}
      <section id="ia" className="scroll-mt-28 overflow-hidden bg-gradient-to-b from-teal-50/60 to-white px-4 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <AnimateOnScroll animation="fade-right">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white/70 px-4 py-1.5 text-xs font-semibold text-whatsapp-dark shadow-sm backdrop-blur">
              🤖 Atendimento automático
            </span>
            <h2 className="mt-5 text-3xl font-bold leading-tight text-slate-800 md:text-4xl">
              Uma IA que{" "}
              <span className="vw-gradient-text bg-gradient-to-r from-whatsapp via-emerald-500 to-teal-500">
                vende por você
              </span>{" "}
              no WhatsApp
            </h2>
            <p className="mt-4 max-w-xl text-lg text-slate-600">
              Conecte seu WhatsApp e deixe a IA responder dúvidas, mostrar produtos
              do seu catálogo e enviar o link da loja — 24 horas por dia, sem você
              perder nenhuma venda.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Responde na hora, mesmo de madrugada",
                "Conhece todo o seu catálogo e preços",
                "Envia o link da loja para fechar o pedido",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-slate-700">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-whatsapp/15 text-whatsapp-dark">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="#planos"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-whatsapp px-7 py-3.5 font-semibold text-white shadow-lg shadow-emerald-900/20 transition-all hover:scale-105 hover:bg-whatsapp-dark"
            >
              Ativar IA na minha loja
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </AnimateOnScroll>

          <AnimateOnScroll animation="fade-left" delay={150}>
            <AiChatDemo />
          </AnimateOnScroll>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="scroll-mt-28 bg-slate-50 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <AnimateOnScroll animation="fade-up">
            <p className="text-center text-sm font-bold uppercase tracking-wider text-landing-accent">Recursos</p>
            <h2 className="mt-2 text-center text-3xl font-bold text-slate-800 md:text-4xl">
              Tudo para escalar suas vendas
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
              Tudo o que você precisa para vender mais, em uma só plataforma
            </p>
          </AnimateOnScroll>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {features.map((item, i) => (
              <AnimateOnScroll key={item.title} animation="fade-up" delay={i * 80}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-teal-100 hover:shadow-xl">
                  <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-teal-50 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-orange-50 text-2xl ring-1 ring-slate-100 transition-transform group-hover:scale-110">
                    {item.icon}
                  </span>
                  <h3 className="mt-4 font-semibold text-slate-800">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      <section id="depoimentos" className="scroll-mt-28 bg-white py-20">
        <div className="mx-auto max-w-5xl px-4">
          <AnimateOnScroll animation="fade-up">
            <p className="text-center text-sm font-bold uppercase tracking-wider text-landing-accent">Depoimentos</p>
            <h2 className="mt-2 text-center text-3xl font-bold text-slate-800 md:text-4xl">
              Quem usa, recomenda
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
              Milhares de empreendedores já facilitaram suas vendas com a VendeWhat
            </p>
          </AnimateOnScroll>
        </div>

        {/* Marquee contínuo (pausa no hover) */}
        <div className="vw-marquee group mt-12 overflow-hidden">
          <div className="vw-marquee-track flex w-max gap-6 px-3">
            {[...testimonials, ...testimonials].map((t, i) => (
              <div
                key={i}
                className="w-[19rem] shrink-0 rounded-2xl border border-slate-100 bg-slate-50/80 p-6 transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white ${t.color}`}
                  >
                    {t.avatar}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-800">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
                <StarRow className="mb-3" />
                <p className="text-sm leading-relaxed text-slate-600">&ldquo;{t.text}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="scroll-mt-28 bg-slate-50 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <AnimateOnScroll animation="fade-up">
            <p className="text-center text-sm font-bold uppercase tracking-wider text-landing-accent">Planos</p>
            <h2 className="mt-2 text-center text-3xl font-bold text-slate-800 md:text-4xl">
              Escolha o plano ideal para o seu negócio
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
              Todos os planos incluem 7 dias grátis para você testar
            </p>
          </AnimateOnScroll>
          <div className="mt-12 grid items-start gap-6 md:grid-cols-3">
            {plans.map((plan, i) => (
              <AnimateOnScroll key={plan.name} animation="fade-up" delay={i * 120}>
                <div
                  className={`relative overflow-hidden rounded-2xl p-8 transition-all hover:-translate-y-1 ${
                    plan.highlight
                      ? "bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-2xl ring-1 ring-white/10 md:scale-[1.04]"
                      : "border border-slate-100 bg-white shadow-sm hover:shadow-lg"
                  }`}
                >
                  {plan.highlight && (
                    <div
                      className="vw-blob absolute -right-10 -top-10 h-40 w-40 rounded-full bg-whatsapp/25 blur-3xl"
                      aria-hidden
                    />
                  )}
                  <div className="relative">
                    {plan.highlight && (
                      <span className="mb-4 inline-block rounded-full bg-whatsapp px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                        Mais popular
                      </span>
                    )}
                    <h3 className={`text-xl font-bold ${plan.highlight ? "text-white" : "text-slate-800"}`}>
                      {plan.name}
                    </h3>
                    <p className={`mt-1 text-sm ${plan.highlight ? "text-slate-300" : "text-slate-500"}`}>
                      {plan.desc}
                    </p>
                    <div className="mb-6 mt-6">
                      <span className={`text-4xl font-bold ${plan.highlight ? "text-white" : "text-slate-800"}`}>
                        R${plan.price}
                      </span>
                      <span className={`text-sm ${plan.highlight ? "text-slate-300" : "text-slate-500"}`}>
                        {plan.period}
                      </span>
                    </div>
                    <ul className="mb-8 space-y-3">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <svg className="h-5 w-5 flex-shrink-0 text-whatsapp" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className={plan.highlight ? "text-slate-200" : "text-slate-600"}>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="#criar-loja"
                      className={`block rounded-lg py-3 text-center font-medium transition-all hover:scale-[1.02] ${
                        plan.highlight
                          ? "bg-whatsapp text-white hover:bg-whatsapp-dark"
                          : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                      }`}
                    >
                      Começar teste grátis
                    </Link>
                  </div>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="duvidas" className="scroll-mt-28 bg-white px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <AnimateOnScroll animation="fade-up">
            <p className="text-center text-sm font-bold uppercase tracking-wider text-landing-accent">Dúvidas</p>
            <h2 className="mb-12 mt-2 text-center text-3xl font-bold text-slate-800 md:text-4xl">
              Perguntas frequentes
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll animation="fade-up" delay={100}>
            <FaqAccordion items={faqs} />
          </AnimateOnScroll>
        </div>
      </section>

      {/* CTA final */}
      <section id="criar-loja" className="scroll-mt-28 px-4 py-20">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-landing-primary via-teal-600 to-landing-primary-hover px-6 py-16 shadow-2xl">
          <div className="vw-blob absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/15 blur-3xl" aria-hidden />
          <div
            className="vw-blob absolute -bottom-16 -left-16 h-72 w-72 rounded-full bg-orange-300/20 blur-3xl"
            style={{ animationDelay: "5s" }}
            aria-hidden
          />
          <AnimateOnScroll animation="scale">
            <div className="relative z-10 mx-auto max-w-2xl text-center text-white">
              <h2 className="text-3xl font-bold md:text-4xl">Vende no zap? Vai de VendeWhat</h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">
                Monte sua loja, compartilhe o link e comece a vender na hora. Simples assim!
              </p>
              <Link
                href="/criar-loja"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-lg font-semibold text-landing-primary shadow-lg transition-all hover:scale-105 hover:bg-orange-50"
              >
                Criar minha loja grátis
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <p className="mt-4 text-sm text-white/70">7 dias grátis · Sem cartão de crédito</p>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-800 px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 grid gap-8 md:grid-cols-3">
            <div>
              <span className="text-xl font-bold text-white">VendeWhat</span>
              <p className="mt-2 text-sm text-slate-400">
                A plataforma mais simples para vender pelo WhatsApp.
              </p>
            </div>
            <div>
              <h4 className="mb-3 font-semibold text-white">Links</h4>
              <div className="flex flex-col gap-2">
                <Link href="#como-funciona" className="text-sm text-slate-400 transition-colors hover:text-white">
                  Como funciona
                </Link>
                <Link href="#recursos" className="text-sm text-slate-400 transition-colors hover:text-white">
                  Recursos
                </Link>
                <Link href="#planos" className="text-sm text-slate-400 transition-colors hover:text-white">
                  Planos
                </Link>
              </div>
            </div>
            <div>
              <h4 className="mb-3 font-semibold text-white">Suporte</h4>
              <div className="flex flex-col gap-2">
                <Link href="#" className="text-sm text-slate-400 transition-colors hover:text-white">
                  Central de ajuda
                </Link>
                <Link href="#" className="text-sm text-slate-400 transition-colors hover:text-white">
                  Contato
                </Link>
                <Link href="#" className="text-sm text-slate-400 transition-colors hover:text-white">
                  Termos de uso
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-700 pt-8 text-center">
            <p className="text-sm text-slate-400">
              © {new Date().getFullYear()} VendeWhat. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
