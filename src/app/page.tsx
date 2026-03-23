import Link from "next/link";
import Header from "@/components/Header";
import AnimateOnScroll from "@/components/AnimateOnScroll";

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
  { title: "Link personalizado", desc: "Compartilhe sua loja com um link único e profissional.", icon: "🌐" },
  { title: "Acesso 24h", desc: "Seus clientes navegam e compram a qualquer hora.", icon: "⏰" },
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

const plans = [
  {
    name: "Essencial",
    price: "69",
    period: "/mês",
    desc: "Para quem está começando a vender online",
    features: [
      "Catálogo ilimitado de produtos",
      "Pedidos pelo WhatsApp",
      "Controle de estoque",
      "Link personalizado",
      "Cálculo de frete",
      "Suporte por e-mail",
    ],
    highlight: false,
  },
  {
    name: "Profissional",
    price: "99",
    period: "/mês",
    desc: "Para quem quer crescer com mais recursos",
    features: [
      "Tudo do Essencial",
      "Cupons de desconto",
      "Domínio personalizado",
      "Recuperação de carrinho",
      "Pagamento online integrado",
      "Suporte prioritário",
    ],
    highlight: true,
  },
  {
    name: "Empresarial",
    price: "165",
    period: "/mês",
    desc: "Para operações que precisam de escala",
    features: [
      "Tudo do Profissional",
      "API ilimitada",
      "Múltiplos usuários",
      "Integrações com ERP",
      "Relatórios avançados",
      "Suporte dedicado",
    ],
    highlight: false,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 bg-gradient-to-b from-emerald-50 to-white overflow-hidden">
        <div className="max-w-4xl mx-auto text-center">
          <AnimateOnScroll animation="fade-up">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-800 leading-tight mb-6">
              Plataforma de e-commerce para quem vende no{" "}
              <span className="text-whatsapp">WhatsApp</span>
            </h1>
          </AnimateOnScroll>
          <AnimateOnScroll animation="fade-up" delay={150}>
            <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
              O VendeWhat ajuda você a vender no WhatsApp com catálogo digital,
              pedidos organizados e um link simples para compartilhar com seus
              clientes.
            </p>
          </AnimateOnScroll>
          <AnimateOnScroll animation="scale" delay={300}>
            <Link
              href="#criar-loja"
              className="inline-block bg-whatsapp text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-whatsapp-dark transition-all hover:scale-105 shadow-lg shadow-whatsapp/25"
            >
              Criar minha loja virtual
            </Link>
            <p className="mt-3 text-sm text-slate-500">
              7 dias grátis · Sem compromisso
            </p>
          </AnimateOnScroll>
        </div>

        {/* Stats */}
        <div className="max-w-4xl mx-auto mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { value: "+ R$40 milhões", label: "vendidos por semana" },
            { value: "+ 24.000 lojistas", label: "já usam a plataforma" },
            { value: "+ 55.000 pedidos", label: "feitos por semana" },
          ].map((stat, i) => (
            <AnimateOnScroll key={stat.label} animation="fade-up" delay={i * 100}>
              <div className="text-center bg-white rounded-2xl p-6 shadow-sm">
                <p className="text-3xl font-bold text-slate-800">{stat.value}</p>
                <p className="text-slate-600 mt-1">{stat.label}</p>
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <AnimateOnScroll animation="fade-up">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 text-center mb-4">
              Veja como é simples vender pela VendeWhat
            </h2>
            <p className="text-slate-600 text-center mb-12 max-w-xl mx-auto">
              Em 4 passos rápidos, sua loja estará pronta para receber pedidos
            </p>
          </AnimateOnScroll>
          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((item, i) => (
              <AnimateOnScroll key={item.step} animation="fade-up" delay={i * 120}>
                <div className="text-center group">
                  <span className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 text-3xl group-hover:scale-110 transition-transform">
                    {item.icon}
                  </span>
                  <span className="block mt-3 text-xs font-bold text-whatsapp uppercase tracking-wider">
                    Passo {item.step}
                  </span>
                  <h3 className="mt-2 font-semibold text-slate-800">{item.title}</h3>
                  <p className="mt-2 text-slate-600 text-sm">{item.desc}</p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="py-20 px-4 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <AnimateOnScroll animation="fade-up">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 text-center mb-4">
              Recursos para escalar suas vendas
            </h2>
            <p className="text-slate-600 text-center mb-12 max-w-xl mx-auto">
              Tudo o que você precisa para vender mais, em uma só plataforma
            </p>
          </AnimateOnScroll>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((item, i) => (
              <AnimateOnScroll key={item.title} animation="fade-up" delay={i * 80}>
                <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-lg transition-all hover:-translate-y-1 group">
                  <span className="text-3xl group-hover:scale-110 inline-block transition-transform">
                    {item.icon}
                  </span>
                  <h3 className="mt-3 font-semibold text-slate-800">{item.title}</h3>
                  <p className="mt-2 text-slate-600 text-sm">{item.desc}</p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      <section id="depoimentos" className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <AnimateOnScroll animation="fade-up">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 text-center mb-4">
              Quem usa, recomenda
            </h2>
            <p className="text-slate-600 text-center mb-12 max-w-xl mx-auto">
              Milhares de empreendedores já facilitaram suas vendas com a VendeWhat
            </p>
          </AnimateOnScroll>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <AnimateOnScroll key={t.name} animation="fade-up" delay={i * 100}>
                <div className="bg-slate-50 p-6 rounded-xl hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-4">
                    <span
                      className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-white font-bold text-sm ${t.color}`}
                    >
                      {t.avatar}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.role}</p>
                    </div>
                  </div>
                  <div className="flex gap-0.5 mb-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        className="w-4 h-4 text-amber-400 fill-current"
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    &ldquo;{t.text}&rdquo;
                  </p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="py-20 px-4 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <AnimateOnScroll animation="fade-up">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 text-center mb-4">
              Escolha o plano ideal para o seu negócio
            </h2>
            <p className="text-slate-600 text-center mb-12 max-w-xl mx-auto">
              Todos os planos incluem 7 dias grátis para você testar
            </p>
          </AnimateOnScroll>
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {plans.map((plan, i) => (
              <AnimateOnScroll key={plan.name} animation="fade-up" delay={i * 120}>
                <div
                  className={`rounded-2xl p-8 transition-all hover:-translate-y-1 ${
                    plan.highlight
                      ? "bg-slate-800 text-white shadow-xl scale-[1.02]"
                      : "bg-white shadow-sm hover:shadow-lg"
                  }`}
                >
                  {plan.highlight && (
                    <span className="inline-block bg-whatsapp text-white text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">
                      Mais popular
                    </span>
                  )}
                  <h3
                    className={`text-xl font-bold ${
                      plan.highlight ? "text-white" : "text-slate-800"
                    }`}
                  >
                    {plan.name}
                  </h3>
                  <p
                    className={`text-sm mt-1 ${
                      plan.highlight ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    {plan.desc}
                  </p>
                  <div className="mt-6 mb-6">
                    <span
                      className={`text-4xl font-bold ${
                        plan.highlight ? "text-white" : "text-slate-800"
                      }`}
                    >
                      R${plan.price}
                    </span>
                    <span
                      className={`text-sm ${
                        plan.highlight ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {plan.period}
                    </span>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <svg
                          className={`w-5 h-5 flex-shrink-0 ${
                            plan.highlight ? "text-whatsapp" : "text-whatsapp"
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span
                          className={
                            plan.highlight ? "text-slate-200" : "text-slate-600"
                          }
                        >
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="#criar-loja"
                    className={`block text-center py-3 rounded-lg font-medium transition-all hover:scale-[1.02] ${
                      plan.highlight
                        ? "bg-whatsapp text-white hover:bg-whatsapp-dark"
                        : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                    }`}
                  >
                    Começar teste grátis
                  </Link>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <AnimateOnScroll animation="fade-up">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 text-center mb-12">
              Dúvidas frequentes
            </h2>
          </AnimateOnScroll>
          {[
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
          ].map((faq, i) => (
            <AnimateOnScroll key={i} animation="fade-up" delay={i * 80}>
              <div className="border-b border-slate-100 py-5">
                <h3 className="font-semibold text-slate-800">{faq.q}</h3>
                <p className="mt-2 text-slate-600 text-sm">{faq.a}</p>
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section id="criar-loja" className="py-20 px-4 bg-whatsapp relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-white" />
        </div>
        <AnimateOnScroll animation="scale">
          <div className="max-w-2xl mx-auto text-center text-white relative z-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Vende no zap? Vai de VendeWhat
            </h2>
            <p className="text-white/90 mb-8 text-lg">
              Monte sua loja virtual, compartilhe o link e comece a vender na
              hora. Simples assim!
            </p>
            <Link
              href="/criar-loja"
              className="inline-block bg-white text-whatsapp-dark px-8 py-4 rounded-xl font-semibold text-lg hover:bg-slate-100 transition-all hover:scale-105 shadow-lg"
            >
              Criar minha loja virtual
            </Link>
            <p className="mt-3 text-sm text-white/70">
              7 dias grátis · Sem cartão de crédito
            </p>
          </div>
        </AnimateOnScroll>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 bg-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <span className="text-xl font-bold text-white">VendeWhat</span>
              <p className="mt-2 text-slate-400 text-sm">
                A plataforma mais simples para vender pelo WhatsApp.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Links</h4>
              <div className="flex flex-col gap-2">
                <Link href="#como-funciona" className="text-slate-400 hover:text-white text-sm transition-colors">
                  Como funciona
                </Link>
                <Link href="#recursos" className="text-slate-400 hover:text-white text-sm transition-colors">
                  Recursos
                </Link>
                <Link href="#planos" className="text-slate-400 hover:text-white text-sm transition-colors">
                  Planos
                </Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Suporte</h4>
              <div className="flex flex-col gap-2">
                <Link href="#" className="text-slate-400 hover:text-white text-sm transition-colors">
                  Central de ajuda
                </Link>
                <Link href="#" className="text-slate-400 hover:text-white text-sm transition-colors">
                  Contato
                </Link>
                <Link href="#" className="text-slate-400 hover:text-white text-sm transition-colors">
                  Termos de uso
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-700 pt-8 text-center">
            <p className="text-slate-400 text-sm">
              © {new Date().getFullYear()} VendeWhat. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
