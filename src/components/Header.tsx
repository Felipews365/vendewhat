"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function LogoMark() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg font-black text-white shadow-sm"
      style={{
        background:
          "linear-gradient(135deg, #0d9488 0%, #0f766e 45%, #ea580c 100%)",
      }}
      aria-hidden
    >
      W
    </span>
  );
}

function SocialIcon({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="text-landing-primary hover:text-landing-accent transition-colors p-1"
    >
      {children}
    </a>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hash, setHash] = useState("");

  useEffect(() => {
    const read = () =>
      setHash(typeof window !== "undefined" ? window.location.hash : "");
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const navLinks = [
    { href: "/", label: "Início", match: () => pathname === "/" && !hash },
    { href: "#como-funciona", label: "Como funciona", match: () => hash === "#como-funciona" },
    { href: "#recursos", label: "Recursos", match: () => hash === "#recursos" },
    { href: "#duvidas", label: "Dúvidas", match: () => hash === "#duvidas" },
    { href: "#planos", label: "Planos", match: () => hash === "#planos" },
  ];

  const linkClass = (active: boolean) =>
    [
      "text-sm font-semibold transition-colors relative pb-0.5",
      active
        ? "text-landing-primary"
        : "text-landing-primary/80 hover:text-landing-primary",
    ].join(" ");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-3 pt-3 md:px-4 md:pt-4 pointer-events-none">
      <nav className="pointer-events-auto max-w-6xl mx-auto flex flex-col gap-0 rounded-2xl md:rounded-3xl bg-white/95 backdrop-blur-md shadow-lg shadow-slate-900/[0.06] border border-slate-200/80 px-3 py-2.5 md:px-5 md:py-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 shrink-0 group"
            onClick={() => setMenuOpen(false)}
          >
            <LogoMark />
            <span className="text-lg md:text-xl font-bold tracking-tight text-landing-ink">
              VendeWhat
            </span>
          </Link>

          {/* Desktop: links + social + CTAs */}
          <div className="hidden lg:flex items-center gap-5 xl:gap-7 flex-1 justify-end min-w-0">
            <div className="flex items-center gap-4 xl:gap-5 flex-wrap justify-end">
              {navLinks.map((link) => {
                const active = link.match();
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={linkClass(active)}
                  >
                    {link.label}
                    {active && (
                      <span className="absolute left-0 right-0 -bottom-0.5 h-0.5 rounded-full bg-landing-accent" />
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="hidden xl:flex items-center gap-1.5 pl-2 border-l border-slate-200 ml-1">
              <SocialIcon href="#" label="Facebook">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </SocialIcon>
              <SocialIcon href="#" label="Instagram">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </SocialIcon>
              <SocialIcon href="#" label="YouTube">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </SocialIcon>
              <SocialIcon href="#" label="TikTok">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.918-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.63-5.71-.02-.5-.01-1-.01-1.49 0-4.07-.01-8.13.02-12.2 1.89.01 3.78.02 5.67-.01z" />
                </svg>
              </SocialIcon>
              <SocialIcon href="#" label="LinkedIn">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </SocialIcon>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/login"
                className="px-4 py-2 rounded-xl text-sm font-semibold text-landing-primary border-2 border-landing-primary hover:bg-landing-accent-soft transition-colors"
              >
                Entrar
              </Link>
              <Link
                href="#criar-loja"
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-landing-primary hover:bg-landing-primary-hover transition-colors shadow-sm"
              >
                Criar minha loja
              </Link>
            </div>
          </div>

          {/* Tablet / mobile: compact */}
          <div className="flex lg:hidden items-center gap-2">
            <Link
              href="/login"
              className="text-sm font-semibold text-landing-primary px-3 py-2 rounded-xl border-2 border-landing-primary hover:bg-landing-accent-soft transition-colors"
            >
              Entrar
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="relative w-10 h-10 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-landing-primary"
              aria-label="Menu"
            >
              <span
                className={`block w-5 h-0.5 bg-current transition-all ${
                  menuOpen ? "rotate-45 translate-y-2" : ""
                }`}
              />
              <span
                className={`block w-5 h-0.5 bg-current transition-all ${
                  menuOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`block w-5 h-0.5 bg-current transition-all ${
                  menuOpen ? "-rotate-45 -translate-y-2" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          className={`lg:hidden overflow-hidden transition-all duration-300 ${
            menuOpen ? "max-h-[28rem] opacity-100 pt-3 border-t border-slate-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-1 pb-1">
            {navLinks.map((link) => {
              const active = link.match();
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`${linkClass(active)} py-2.5 px-1 rounded-lg ${
                    active ? "bg-landing-accent-soft" : ""
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="flex items-center gap-3 py-3 mt-1 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Redes
              </span>
              <div className="flex items-center gap-2">
                <SocialIcon href="#" label="Facebook">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </SocialIcon>
                <SocialIcon href="#" label="Instagram">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </SocialIcon>
              </div>
            </div>
            <Link
              href="#criar-loja"
              onClick={() => setMenuOpen(false)}
              className="mt-2 text-center py-3 rounded-xl font-semibold text-white bg-landing-primary hover:bg-landing-primary-hover transition-colors"
            >
              Criar minha loja
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
