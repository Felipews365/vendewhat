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
const nextConfig = {};

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
