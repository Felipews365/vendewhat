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
    // Entrega moderna: o next/image negocia AVIF (mais leve) e cai para WebP;
    // gera automaticamente as larguras responsivas (celular → desktop) a partir
    // da única origem, então banners e fotos ficam leves e nítidos em cada tela.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 640, 828, 1080, 1280, 1600, 1920],
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
