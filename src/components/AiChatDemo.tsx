"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { from: "customer" | "ai"; text: string };

const SCRIPT: Msg[] = [
  { from: "customer", text: "Oi! Vocês têm o vestido floral no tamanho M? 😍" },
  { from: "ai", text: "Oi! 😊 Temos sim! O Vestido Floral em M sai por R$ 129,00." },
  { from: "customer", text: "Dá pra parcelar?" },
  { from: "ai", text: "Claro, em até 3x sem juros 💳 Quer que eu já separe pra você?" },
  { from: "customer", text: "Quero sim!" },
  {
    from: "ai",
    text: "Prontinho! 🛍️ Finalize por aqui: vendewhat.com/boutique-da-lu",
  },
];

export default function AiChatDemo() {
  const [count, setCount] = useState(0); // mensagens já visíveis
  const [typing, setTyping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    const run = (i: number) => {
      if (cancelled) return;
      if (i >= SCRIPT.length) {
        // conversa concluída — para por aqui (sem reiniciar)
        setTyping(false);
        return;
      }

      const msg = SCRIPT[i];
      const reveal = () => {
        setTyping(false);
        setCount(i + 1);
        timers.push(setTimeout(() => run(i + 1), 900));
      };

      if (msg.from === "ai") {
        setTyping(true);
        timers.push(setTimeout(reveal, 1300));
      } else {
        timers.push(setTimeout(reveal, 600));
      }
    };

    // só começa a "conversa" quando o card entra na tela
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.unobserve(el);
          timers.push(setTimeout(() => run(0), 400));
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  // mantém o scroll no fim a cada mensagem nova
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, typing]);

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-sm vw-float-slow">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-whatsapp/30 via-emerald-200/30 to-teal-200/40 blur-2xl" />

      <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl shadow-emerald-900/20 ring-1 ring-black/5">
        {/* header do chat */}
        <div className="flex items-center gap-3 bg-gradient-to-r from-[#075E54] to-[#128C7E] px-4 py-3 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-lg">
            🛍️
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Boutique da Lu</p>
            <p className="flex items-center gap-1 text-[11px] text-emerald-100">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Atendimento por IA · online
            </p>
          </div>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            IA
          </span>
        </div>

        {/* corpo */}
        <div
          ref={scrollRef}
          className="h-80 space-y-2.5 overflow-hidden bg-[#e8e3dc] bg-[radial-gradient(#d6cfc4_0.5px,transparent_0.5px)] [background-size:14px_14px] px-3 py-4"
        >
          {SCRIPT.slice(0, count).map((m, i) => (
            <div
              key={i}
              className={`flex vw-fade-in-up ${
                m.from === "ai" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  m.from === "ai"
                    ? "rounded-br-sm bg-[#dcf8c6] text-slate-800"
                    : "rounded-bl-sm bg-white text-slate-800"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {typing && (
            <div className="flex justify-end">
              <div className="flex items-center gap-1 rounded-2xl rounded-br-sm bg-[#dcf8c6] px-3 py-2.5 shadow-sm">
                <Dot delay="0ms" />
                <Dot delay="150ms" />
                <Dot delay="300ms" />
              </div>
            </div>
          )}
        </div>

        {/* barra de input (decorativa) */}
        <div className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 py-2.5">
          <div className="flex-1 rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-400">
            Digite uma mensagem…
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-whatsapp text-white">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500/70"
      style={{ animationDelay: delay, animationDuration: "1s" }}
    />
  );
}
