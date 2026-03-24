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

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao fazer login");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthMarketingBackground
      headerRight={
        <Link
          href="/criar-loja"
          className="text-sm font-semibold bg-white/15 hover:bg-white/25 px-4 py-2 rounded-xl text-white transition-colors"
        >
          Criar minha loja
        </Link>
      }
    >
      <AuthCard>
        <AuthBrandBlock />
        <h1 className="text-lg font-semibold text-landing-primary text-center mb-1">
          Entrar
        </h1>
        <p className="text-sm text-slate-500 text-center mb-8">
          Acesse seu painel e gerencie pedidos e produtos.
        </p>

        {error && (
          <div className="mb-5 p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
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
            placeholder="Sua senha"
            required
            autoComplete="current-password"
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
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-semibold text-white bg-landing-primary hover:bg-landing-primary-hover transition-colors shadow-md disabled:opacity-50 mt-2"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-600 mt-8">
          Não tem uma conta?{" "}
          <Link
            href="/criar-loja"
            className="font-semibold text-teal-500 hover:text-landing-accent transition-colors"
          >
            Criar minha loja grátis
          </Link>
        </p>
      </AuthCard>
    </AuthMarketingBackground>
  );
}
