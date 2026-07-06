import type { Metadata } from "next";
import { Inter, Dancing_Script } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

const inter = Inter({ subsets: ["latin"] });
/** Fonte cursiva do destaque animado do banner (classe .font-script). */
const dancingScript = Dancing_Script({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-script",
});

export const metadata: Metadata = {
  title: "VendeWhat - Plataforma para Vender pelo WhatsApp",
  description: "Catálogo digital, pedidos organizados e um link simples para compartilhar com seus clientes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('vw-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.className} ${dancingScript.variable}`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
