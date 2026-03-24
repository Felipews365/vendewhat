"use client";

import Link from "next/link";

/** Fundo e cartão no estilo “cadastro moderno” (referência vendizap), cores landing teal/coral. */
export function AuthMarketingBackground({
  children,
  headerRight,
}: {
  children: React.ReactNode;
  /** Se omitido, mostra “Já tenho conta” → /login */
  headerRight?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col">
      <div
        className="fixed inset-0 -z-10"
        aria-hidden
        style={{
          background:
            "linear-gradient(145deg, #0f766e 0%, #0d9488 35%, #134e4a 55%, #c2410c 100%)",
        }}
      />
      <div
        className="fixed -top-32 -right-24 w-[420px] h-[420px] rounded-full bg-orange-400/25 blur-3xl -z-10"
        aria-hidden
      />
      <div
        className="fixed -bottom-40 -left-32 w-[480px] h-[480px] rounded-full bg-teal-300/20 blur-3xl -z-10"
        aria-hidden
      />

      <header className="relative z-10 px-4 py-4">
        <nav className="max-w-lg mx-auto flex items-center justify-between text-white/90">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-white shadow-md"
              style={{
                background:
                  "linear-gradient(135deg, #2dd4bf 0%, #0f766e 50%, #ea580c 100%)",
              }}
            >
              W
            </span>
            <span className="text-white">VendeWhat</span>
          </Link>
          {headerRight ?? (
            <Link
              href="/login"
              className="text-sm font-semibold text-teal-100 hover:text-white transition-colors"
            >
              Já tenho conta
            </Link>
          )}
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-12 pt-4">
        {children}
      </main>
    </div>
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md bg-white rounded-[1.35rem] shadow-2xl shadow-teal-950/20 px-8 py-10 md:px-10 md:py-11 border border-white/60">
      {children}
    </div>
  );
}

export function AuthBrandBlock() {
  return (
    <div className="flex flex-col items-center text-center mb-8">
      <div className="flex items-center gap-2.5 mb-5">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-black text-white shadow-lg"
          style={{
            background:
              "linear-gradient(135deg, #2dd4bf 0%, #0f766e 45%, #ea580c 100%)",
          }}
          aria-hidden
        >
          W
        </span>
        <span className="text-2xl font-bold text-landing-ink tracking-tight">
          VendeWhat
        </span>
      </div>
    </div>
  );
}

type UnderlineFieldProps = {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
};

export function UnderlineField({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  minLength,
  autoComplete,
  icon,
  trailing,
}: UnderlineFieldProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-1">
        <label
          htmlFor={name}
          className="text-sm font-semibold text-landing-primary"
        >
          {label}
        </label>
        <span className="text-landing-primary shrink-0 flex items-center gap-1">
          {icon}
          {trailing}
        </span>
      </div>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full bg-transparent border-0 border-b border-slate-200 py-2.5 text-slate-800 placeholder:text-slate-400 focus:ring-0 focus:border-landing-accent outline-none transition-colors text-[15px]"
      />
    </div>
  );
}
