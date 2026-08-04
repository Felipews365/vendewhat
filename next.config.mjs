function supabaseImageHost() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const host = supabaseImageHost();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // @react-pdf/renderer traz dependências (fontkit etc.) que quebram no bundler do
  // Next; tratá-lo como externo faz o Node carregá-lo em runtime (gera o catálogo
  // em PDF na rota /api/loja/[slug]/catalogo e no envio pela IA no WhatsApp).
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer", "sharp"],
  },
  // OneDrive / rede / alguns antivírus no Windows não disparam eventos de arquivo;
  // o polling faz o hot-reload funcionar (atualiza ao salvar sem reiniciar).
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
      // Cache só em memória: evita "Cannot find module './276.js'" quando a pasta
      // .next é alterada pelo OneDrive/sync durante o hot reload.
      config.cache = { type: "memory" };
    }
    return config;
  },
};

if (host) {
  nextConfig.images = {
    /**
     * ⚠️ OTIMIZAÇÃO DESLIGADA DE PROPÓSITO — o `next/image` serve a URL original
     * do Supabase, sem passar pelo `/_next/image`.
     *
     * A Vercel cobra por "transformação" (cada foto × cada largura), e a cota do
     * plano gratuito acabou: TODO `/_next/image` passou a responder **402
     * OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED** e as fotos de todas as lojas
     * ficaram quebradas para os clientes (banner, cards, categorias, favicon) —
     * quem já tinha cache não via o problema. Como a cota reseta no ciclo de
     * cobrança, o site voltaria sozinho e quebraria de novo no meio do mês; daí a
     * escolha por não depender dela.
     *
     * Isso só é seguro porque **a origem já é leve**: o recorte
     * ([ProductImageCropModal]) re-encoda tudo para WebP com teto de 1600px
     * (produtos) / 1920px (banner), inclusive no "usar foto inteira". O que se
     * perde é o AVIF e o corte por tamanho de tela (a bolinha de 48px baixa o
     * arquivo inteiro). Se um dia isso pesar, o caminho é gerar uma miniatura no
     * upload — não religar esta flag sem cota paga.
     */
    unoptimized: true,
    // Mantidos para o dia em que houver cota (a `unoptimized` acima os ignora).
    // Menos larguras = menos transformações por foto = a cota rende muito mais.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 1080, 1920],
    remotePatterns: [
      {
        protocol: "https",
        hostname: host,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  };
}

export default nextConfig;
