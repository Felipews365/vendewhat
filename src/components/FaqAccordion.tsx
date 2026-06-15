"use client";

import { useState } from "react";

interface FaqItem {
  q: string;
  a: string;
}

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {items.map((faq, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            className={`rounded-2xl border transition-all duration-300 ${
              isOpen
                ? "border-landing-primary/30 bg-white shadow-lg shadow-teal-900/5"
                : "border-slate-200 bg-white/60 hover:border-slate-300 hover:bg-white"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              aria-expanded={isOpen}
            >
              <span className="font-semibold text-slate-800">{faq.q}</span>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                  isOpen
                    ? "rotate-180 bg-landing-primary text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
                aria-hidden
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>
            <div
              className={`grid transition-all duration-300 ease-out ${
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-slate-600">{faq.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
