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
