/**
 * Sons do aviso de venda — sintetizados via Web Audio (sem arquivo de áudio, então
 * funcionam offline e não pesam no bundle). Compartilhado entre o vigia do painel
 * ([SaleAlertWatcher]) e o botão "Testar" da página de Pedidos.
 *
 * Preferências por dispositivo (localStorage): ligado/desligado, som escolhido e
 * volume (0..1). Só roda no navegador.
 */

export type SaleSoundId = "bip" | "caixa" | "sino" | "ding" | "alerta" | "marimba";

export const SALE_SOUNDS: { id: SaleSoundId; label: string }[] = [
  { id: "bip", label: "Bipe (dois tons)" },
  { id: "caixa", label: "Caixa registradora" },
  { id: "sino", label: "Sininho" },
  { id: "ding", label: "Ding suave" },
  { id: "alerta", label: "Alerta (três bipes)" },
  { id: "marimba", label: "Marimba" },
];

export const DEFAULT_SALE_SOUND_ID: SaleSoundId = "bip";
export const DEFAULT_SALE_VOLUME = 0.6;

export const SOUND_ON_KEY = "vw-sale-sound";
export const SOUND_ID_KEY = "vw-sale-sound-id";
export const SOUND_VOLUME_KEY = "vw-sale-sound-volume";

function isSoundId(v: unknown): v is SaleSoundId {
  return SALE_SOUNDS.some((s) => s.id === v);
}

/** Lê o som escolhido no dispositivo (default `bip`). */
export function readSaleSoundId(): SaleSoundId {
  try {
    const v = localStorage.getItem(SOUND_ID_KEY);
    return isSoundId(v) ? v : DEFAULT_SALE_SOUND_ID;
  } catch {
    return DEFAULT_SALE_SOUND_ID;
  }
}

/** Lê o volume no dispositivo (0..1, default 0.6). */
export function readSaleVolume(): number {
  try {
    const n = Number(localStorage.getItem(SOUND_VOLUME_KEY));
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  } catch {
    /* localStorage indisponível */
  }
  return DEFAULT_SALE_VOLUME;
}

type ToneSpec = {
  freq: number;
  /** Início relativo (s). */
  start: number;
  /** Duração até o fade final (s). */
  dur: number;
  type?: OscillatorType;
  /** Pico de ganho antes de multiplicar pelo volume. */
  gain?: number;
};

/** Especificação de cada som: lista de tons agendados. */
function tonesFor(id: SaleSoundId): ToneSpec[] {
  switch (id) {
    case "caixa":
      // "Cha-ching" da caixa registradora: dois toques + um brilho.
      return [
        { freq: 1568, start: 0, dur: 0.1, type: "square", gain: 0.22 },
        { freq: 2093, start: 0.11, dur: 0.12, type: "square", gain: 0.22 },
        { freq: 2637, start: 0.24, dur: 0.4, type: "triangle", gain: 0.18 },
      ];
    case "sino":
      // Sino: fundamental + harmônicos com cauda longa.
      return [
        { freq: 660, start: 0, dur: 1.0, type: "triangle", gain: 0.24 },
        { freq: 1320, start: 0, dur: 0.8, type: "sine", gain: 0.12 },
        { freq: 1980, start: 0, dur: 0.6, type: "sine", gain: 0.07 },
      ];
    case "ding":
      // Um toque limpo e curto.
      return [{ freq: 1318.5, start: 0, dur: 0.6, type: "sine", gain: 0.3 }];
    case "alerta":
      // Três bipes iguais, chamando atenção.
      return [
        { freq: 988, start: 0, dur: 0.12, type: "square", gain: 0.2 },
        { freq: 988, start: 0.18, dur: 0.12, type: "square", gain: 0.2 },
        { freq: 988, start: 0.36, dur: 0.12, type: "square", gain: 0.2 },
      ];
    case "marimba":
      // Arpejo ascendente agradável (C–E–G–C).
      return [
        { freq: 523.25, start: 0, dur: 0.2, type: "triangle", gain: 0.26 },
        { freq: 659.25, start: 0.12, dur: 0.2, type: "triangle", gain: 0.26 },
        { freq: 783.99, start: 0.24, dur: 0.2, type: "triangle", gain: 0.26 },
        { freq: 1046.5, start: 0.36, dur: 0.34, type: "triangle", gain: 0.26 },
      ];
    case "bip":
    default:
      return [
        { freq: 880, start: 0, dur: 0.22, type: "sine", gain: 0.25 },
        { freq: 1174.7, start: 0.16, dur: 0.22, type: "sine", gain: 0.25 },
      ];
  }
}

/**
 * Toca o som `id` no `volume` (0..1) informado. Não lê localStorage — a página de
 * Pedidos usa a seleção ao vivo (ainda não salva) no botão "Testar". Volume 0 (ou
 * sem Web Audio) não faz nada. Nunca lança.
 */
export function playSaleSound(id: SaleSoundId, volume: number): void {
  const vol = Math.min(Math.max(volume, 0), 1);
  if (vol <= 0) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const base = ctx.currentTime;
    let maxEnd = 0;
    for (const spec of tonesFor(id)) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = spec.type ?? "sine";
      osc.frequency.value = spec.freq;
      const t0 = base + spec.start;
      const peak = Math.max(0.0001, (spec.gain ?? 0.25) * vol);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + spec.dur + 0.03);
      maxEnd = Math.max(maxEnd, spec.start + spec.dur + 0.05);
    }
    // Fecha o contexto depois do som para não vazar recursos.
    setTimeout(() => ctx.close().catch(() => {}), Math.ceil(maxEnd * 1000) + 200);
  } catch {
    /* autoplay bloqueado / sem áudio — o alerta visual continua valendo */
  }
}

/**
 * Toca o som do aviso conforme as preferências salvas no dispositivo (ligado,
 * som escolhido e volume). Usado pelo vigia do painel ao detectar uma venda.
 */
export function playSaleAlertSound(): void {
  try {
    if (localStorage.getItem(SOUND_ON_KEY) === "0") return; // som desligado
  } catch {
    /* localStorage indisponível — segue com som */
  }
  playSaleSound(readSaleSoundId(), readSaleVolume());
}
