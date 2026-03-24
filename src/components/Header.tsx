"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const navLinks = [
    { href: "#como-funciona", label: "Como funciona" },
    { href: "#recursos", label: "Recursos" },
    { href: "#depoimentos", label: "Depoimentos" },
    { href: "#planos", label: "Planos" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-sm shadow-sm"
          : "bg-white/95 backdrop-blur-sm"
      } border-b border-slate-200`}
    >
      <nav className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-slate-800">
          VendeWhat
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          <Link
            href="/login"
            className="text-slate-700 font-medium hover:text-whatsapp-dark transition-colors border border-slate-200 px-4 py-2 rounded-lg hover:border-whatsapp/40 hover:bg-emerald-50/50"
          >
            Já tenho conta
          </Link>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="#criar-loja"
            className="bg-whatsapp text-white px-5 py-2.5 rounded-lg font-medium hover:bg-whatsapp-dark transition-colors"
          >
            Criar minha loja
          </Link>
        </div>

        <div className="flex md:hidden items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-slate-700 px-3 py-2 rounded-lg border border-slate-200 hover:border-whatsapp/40 hover:bg-emerald-50/50 transition-colors"
          >
            Entrar
          </Link>
          {/* Hamburger button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="relative w-8 h-8 flex flex-col items-center justify-center gap-1.5"
            aria-label="Menu"
          >
            <span
              className={`block w-6 h-0.5 bg-slate-700 transition-all duration-300 ${
                menuOpen ? "rotate-45 translate-y-2" : ""
              }`}
            />
            <span
              className={`block w-6 h-0.5 bg-slate-700 transition-all duration-300 ${
                menuOpen ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block w-6 h-0.5 bg-slate-700 transition-all duration-300 ${
                menuOpen ? "-rotate-45 -translate-y-2" : ""
              }`}
            />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ${
          menuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-6 pt-2 bg-white border-t border-slate-100 flex flex-col gap-4">
          <Link
            href="/login"
            onClick={() => setMenuOpen(false)}
            className="text-center text-slate-700 font-medium py-3 rounded-lg border border-slate-200 hover:border-whatsapp/40 hover:bg-emerald-50/50 transition-colors"
          >
            Já tenho conta — Entrar
          </Link>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="text-slate-600 hover:text-slate-900 py-2 transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="#criar-loja"
            onClick={() => setMenuOpen(false)}
            className="bg-whatsapp text-white px-5 py-3 rounded-lg font-medium hover:bg-whatsapp-dark transition-colors text-center"
          >
            Criar minha loja
          </Link>
        </div>
      </div>
    </header>
  );
}
