"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AuthMarketingBackground,
  AuthCard,
  AuthBrandBlock,
  UnderlineField,
} from "@/components/auth/AuthMarketingLayout";

const iconMail = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

const iconUser = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
);

const iconStore = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

const iconPhone = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
    />
  </svg>
);

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
        />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

type Q1 = "solo" | "small" | "large";
type Q2 = "both" | "physical" | "online";
type Q3 = "retail" | "wholesale" | "both";

export default function CriarLojaClient() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    storeName: "",
    name: "",
    phone: "",
  });

  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [q1, setQ1] = useState<Q1 | "">("");
  const [q2, setQ2] = useState<Q2 | "">("");
  const [q3, setQ3] = useState<Q3 | "">("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  }

  const slug = form.storeName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  function goStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.trim() || form.password.length < 6) {
      setError("Informe um e-mail válido e senha com pelo menos 6 caracteres.");
      return;
    }
    setError("");
    setStep(2);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao criar conta");
        return;
      }

      setOnboardingOpen(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function finishOnboarding() {
    setOnboardingOpen(false);
    setSuccessOpen(true);
  }

  const radioClass = (active: boolean) =>
    `flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
      active
        ? "border-landing-primary bg-teal-50/80 text-landing-ink"
        : "border-slate-100 hover:border-slate-200 text-slate-700"
    }`;

  return (
    <AuthMarketingBackground>
      <AuthCard>
        <AuthBrandBlock />

        {step === 1 && (
          <>
            <h1 className="text-lg font-semibold text-landing-primary text-center mb-1">
              Cadastre-se
            </h1>
            <p className="text-sm text-slate-500 text-center mb-8 leading-relaxed">
              Catálogo completo e simples para a sua empresa — comece com e-mail e senha.
            </p>

            {error && (
              <div className="mb-5 p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">
                {error}
              </div>
            )}

            <form onSubmit={goStep2}>
              <UnderlineField
                label="E-mail"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                icon={iconMail}
              />
              <UnderlineField
                label="Senha"
                name="password"
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={handleChange}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                autoComplete="new-password"
                icon={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPass((v) => !v)}
                    className="p-0.5 rounded hover:bg-slate-100 text-landing-primary"
                    aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <EyeIcon open={showPass} />
                  </button>
                }
              />
              <button
                type="submit"
                className="w-full py-3.5 rounded-xl font-semibold text-white bg-landing-primary hover:bg-landing-primary-hover transition-colors shadow-md shadow-teal-900/10 mt-2"
              >
                Continuar
              </button>
            </form>

            <p className="text-center text-sm text-slate-600 mt-8">
              Já tem uma conta?{" "}
              <Link
                href="/login"
                className="font-semibold text-teal-500 hover:text-landing-accent transition-colors"
              >
                Clique aqui para fazer login
              </Link>
              .
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-lg font-semibold text-landing-primary text-center mb-1">
              Dados da loja
            </h1>
            <p className="text-sm text-slate-500 text-center mb-8 leading-relaxed">
              Informe o nome da loja, o responsável e o WhatsApp que receberá os pedidos.
            </p>

            {error && (
              <div className="mb-5 p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleRegister}>
              <UnderlineField
                label="Nome da loja"
                name="storeName"
                value={form.storeName}
                onChange={handleChange}
                placeholder="Ex.: Boutique da Maria"
                required
                autoComplete="organization"
                icon={iconStore}
              />
              {slug ? (
                <p className="-mt-4 mb-5 text-xs text-slate-400">
                  Seu catálogo:{" "}
                  <span className="text-landing-primary font-medium">/loja/{slug}</span>
                </p>
              ) : null}

              <UnderlineField
                label="Nome completo"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Responsável pela loja"
                required
                autoComplete="name"
                icon={iconUser}
              />

              <div className="mb-6">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor="phone"
                    className="text-sm font-semibold text-landing-primary"
                  >
                    WhatsApp
                  </label>
                  <span className="flex items-center gap-1 text-landing-primary text-sm font-medium">
                    <span className="text-base leading-none" aria-hidden>
                      🇧🇷
                    </span>
                    +55
                  </span>
                </div>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="(11) 99999-9999"
                  required
                  autoComplete="tel"
                  className="w-full bg-transparent border-0 border-b border-slate-200 py-2.5 text-slate-800 placeholder:text-slate-400 focus:ring-0 focus:border-landing-accent outline-none transition-colors text-[15px]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-semibold text-white bg-landing-primary hover:bg-landing-primary-hover transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Criando sua loja..." : "Iniciar teste gratuito"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError("");
                }}
                className="w-full mt-3 py-3 rounded-xl font-semibold text-teal-600 border-2 border-teal-400/60 hover:bg-teal-50 transition-colors"
              >
                Voltar
              </button>
            </form>
          </>
        )}

        <p className="text-[11px] text-slate-400 text-center mt-8 leading-relaxed">
          Ao se cadastrar você concorda com nossos{" "}
          <Link href="#" className="underline text-slate-500 hover:text-landing-primary">
            Termos de Uso
          </Link>{" "}
          e{" "}
          <Link href="#" className="underline text-slate-500 hover:text-landing-primary">
            Política de Privacidade
          </Link>
          .
        </p>
      </AuthCard>

      {/* Onboarding rápido */}
      {onboardingOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboard-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 border border-slate-100">
            <h2
              id="onboard-title"
              className="text-xl font-bold text-landing-ink text-center"
            >
              Bem-vindo(a) ao VendeWhat!
            </h2>
            <p className="text-sm text-slate-600 text-center mt-2">
              Responda rapidamente — queremos deixar a experiência do seu jeito.
            </p>

            <div className="mt-8 space-y-8">
              <div>
                <div className="flex gap-3 items-start mb-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-landing-primary text-white text-sm font-bold">
                    1
                  </span>
                  <p className="font-semibold text-slate-800 text-sm pt-1">
                    Quantas pessoas trabalham na sua operação (incluindo você)?
                  </p>
                </div>
                <div className="pl-11 space-y-2">
                  {(
                    [
                      ["solo", "Trabalho sozinho(a)"] as const,
                      ["small", "Entre 2 e 10 pessoas"] as const,
                      ["large", "Mais de 10 pessoas"] as const,
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setQ1(v)}
                      className={radioClass(q1 === v)}
                    >
                      <span
                        className={`h-4 w-4 rounded-full border-2 shrink-0 ${
                          q1 === v
                            ? "border-landing-primary bg-landing-primary"
                            : "border-slate-300"
                        }`}
                      />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex gap-3 items-start mb-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-landing-primary text-white text-sm font-bold">
                    2
                  </span>
                  <p className="font-semibold text-slate-800 text-sm pt-1">
                    Onde você realiza suas vendas?
                  </p>
                </div>
                <div className="pl-11 space-y-2">
                  {(
                    [
                      ["both", "Loja física e online"] as const,
                      ["physical", "Apenas loja física"] as const,
                      ["online", "Apenas online"] as const,
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setQ2(v)}
                      className={radioClass(q2 === v)}
                    >
                      <span
                        className={`h-4 w-4 rounded-full border-2 shrink-0 ${
                          q2 === v
                            ? "border-landing-primary bg-landing-primary"
                            : "border-slate-300"
                        }`}
                      />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex gap-3 items-start mb-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-landing-primary text-white text-sm font-bold">
                    3
                  </span>
                  <p className="font-semibold text-slate-800 text-sm pt-1">
                    Qual é o seu modelo de negócio?
                  </p>
                </div>
                <div className="pl-11 space-y-2">
                  {(
                    [
                      ["wholesale", "Atacado"] as const,
                      ["both", "Atacado e varejo"] as const,
                      ["retail", "Varejo"] as const,
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setQ3(v)}
                      className={radioClass(q3 === v)}
                    >
                      <span
                        className={`h-4 w-4 rounded-full border-2 shrink-0 ${
                          q3 === v
                            ? "border-landing-primary bg-landing-primary"
                            : "border-slate-300"
                        }`}
                      />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={finishOnboarding}
              className="w-full mt-10 py-3.5 rounded-full font-semibold text-white bg-landing-primary hover:bg-landing-primary-hover transition-colors"
            >
              Concluir
            </button>
          </div>
        </div>
      )}

      {successOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center border border-slate-100">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-400 text-white mb-5 shadow-lg shadow-teal-600/25">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900">Pronto!</h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Sua loja foi criada. Explore o painel ou veja os planos quando quiser.
            </p>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="w-full mt-6 py-3 rounded-xl font-semibold text-white bg-landing-primary hover:bg-landing-primary-hover transition-colors"
            >
              Ir para o painel
            </button>
            <Link
              href="/#planos"
              className="block mt-3 text-sm font-semibold text-teal-600 hover:text-landing-accent"
            >
              Ver planos
            </Link>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="mt-4 text-sm text-slate-500 hover:text-slate-700"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </AuthMarketingBackground>
  );
}
