/**
 * Extrai coordenadas (lat/lng) de um link do Google Maps ou de um texto
 * "lat, lng". Client-safe (sem dependências de servidor) — usado no painel e na
 * rota de config.
 *
 * Atenção: links encurtados (maps.app.goo.gl / goo.gl/maps) NÃO contêm as
 * coordenadas; precisam ser abertos no navegador para virar o link completo.
 */
export type LatLng = { lat: number; lng: number };

function within(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function parseLatLng(input: string): LatLng | null {
  const s = (input || "").trim();
  if (!s) return null;

  // "lat,lng" ou "lat, lng" puro
  const pair = s.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (pair) return within(Number(pair[1]), Number(pair[2]));

  // .../@-23.5,-46.6,17z
  const at = s.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (at) return within(Number(at[1]), Number(at[2]));

  // ?q= / &query= / &ll= = lat,lng
  const q = s.match(/[?&](?:q|query|ll|destination)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (q) return within(Number(q[1]), Number(q[2]));

  // !3d<lat>!4d<lng>
  const d = s.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (d) return within(Number(d[1]), Number(d[2]));

  return null;
}

/** True se for um link encurtado do Maps (sem coordenadas embutidas). */
export function isShortMapsLink(input: string): boolean {
  return /(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(input || "");
}

/**
 * Resolve as coordenadas de um link do Maps. Se for um link encurtado
 * (maps.app.goo.gl), segue o redirecionamento e lê o ponto da URL final/HTML.
 * Faz rede — usar **só no servidor**.
 */
export async function resolveMapsLatLng(input: string): Promise<LatLng | null> {
  const direct = parseLatLng(input);
  if (direct) return direct;

  const url = (input || "").trim();
  if (!url || !isShortMapsLink(url)) return null;

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      cache: "no-store",
    });
    // A URL final já costuma trazer o @lat,lng.
    const fromFinalUrl = parseLatLng(res.url);
    if (fromFinalUrl) return fromFinalUrl;
    // Senão, procura no corpo da página (algumas respostas embutem o ponto).
    const body = await res.text();
    return parseLatLng(body);
  } catch {
    return null;
  }
}
