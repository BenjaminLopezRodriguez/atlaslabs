/**
 * Layered radial SVG gradients in the style of OpenAI's 2020–2022 homepage.
 * Method: Justin Jay Wang / reverse-engineered by venkr
 * @see https://justinjay.wang/methods-for-random-gradients/
 * @see https://gradients.venki.dev/
 */

export const OPENAI_PALETTE = [
  "#5135FF",
  "#FF5828",
  "#F69CFF",
  "#FFA50F",
] as const;

export interface EllipseConfig {
  color: string;
  fx: number;
  scale: [number, number];
  skew: number;
  rotation: number;
  translation: [number, number];
}

/** Deterministic PRNG so SSR and client match. */
function mulberry32(seed: number) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generateEllipses(
  seedKey: string,
  palette: readonly string[] = OPENAI_PALETTE,
  count = 12,
): EllipseConfig[] {
  const rand = mulberry32(hashSeed(seedKey));
  return Array.from({ length: count }, () => ({
    color: palette[Math.floor(rand() * palette.length)]!,
    fx: 0.1 + rand() * 0.3,
    scale: [0.7 + rand() * 0.8, 0.7 + rand() * 0.8] as [number, number],
    skew: -10 + rand() * 20,
    rotation: rand() * 360,
    translation: [-250 + rand() * 500, -250 + rand() * 500] as [number, number],
  }));
}
