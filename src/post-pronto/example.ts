// Post de exemplo, mostrado antes de a pessoa enviar as próprias fotos.
import type { Draft, MusicPick, PlacePick } from "./types";

export const EXAMPLE_DRAFT: Draft = {
  text:
    "Fim de tarde que pede pausa 🌅\n\n" +
    "Tem dia em que a gente só precisa sentar na pedra, ver o sol ir embora e deixar o resto para amanhã.\n\n" +
    "Qual foi o último pôr do sol que fez você parar? Conta aqui 👇",
  hashtags: ["#pordosol", "#arpoador", "#fimdetarde"],
};

export const EXAMPLE_MUSIC: MusicPick = { title: "Wave", artist: "Tom Jobim", part: "início", why: "" };
export const EXAMPLE_PLACE: PlacePick = { name: "Arpoador, Rio de Janeiro", kind: "local exato", why: "" };

/** Desenha uma paisagem de pôr do sol no mar (sem baixar nenhuma imagem). */
export function exampleScene(): { img: HTMLCanvasElement; width: number; height: number } {
  const W = 1200;
  const H = 1500;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const horizon = H * 0.62;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#1f2a4d");
  sky.addColorStop(0.45, "#7c4a72");
  sky.addColorStop(0.8, "#e9825a");
  sky.addColorStop(1, "#f6c27a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);

  const glow = ctx.createRadialGradient(W * 0.62, horizon - 40, 10, W * 0.62, horizon - 40, 420);
  glow.addColorStop(0, "rgba(255, 236, 190, 0.95)");
  glow.addColorStop(0.18, "rgba(255, 205, 140, 0.75)");
  glow.addColorStop(1, "rgba(255, 180, 120, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, horizon);

  ctx.fillStyle = "#fff1d2";
  ctx.beginPath();
  ctx.arc(W * 0.62, horizon - 30, 62, 0, Math.PI * 2);
  ctx.fill();

  const sea = ctx.createLinearGradient(0, horizon, 0, H);
  sea.addColorStop(0, "#d9875f");
  sea.addColorStop(0.35, "#5c3f5c");
  sea.addColorStop(1, "#1b1f38");
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, W, H - horizon);

  // reflexo do sol na água
  for (let i = 0; i < 26; i++) {
    const y = horizon + 14 + i * i * 1.1;
    const w = 150 - i * 4.5 + (i % 3) * 18;
    ctx.fillStyle = `rgba(255, 226, 170, ${0.7 - i * 0.025})`;
    ctx.fillRect(W * 0.62 - w / 2, y, w, 3 + i * 0.18);
  }

  // morro à esquerda e pedra em primeiro plano
  ctx.fillStyle = "#2a1f33";
  ctx.beginPath();
  ctx.moveTo(0, horizon + 4);
  ctx.bezierCurveTo(W * 0.1, horizon - 260, W * 0.24, horizon - 300, W * 0.36, horizon + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#15111d";
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H * 0.84);
  ctx.bezierCurveTo(W * 0.25, H * 0.8, W * 0.55, H * 0.86, W, H * 0.9);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // duas pessoas sentadas na pedra
  ctx.fillStyle = "#0e0b14";
  for (const [x, s] of [
    [W * 0.3, 1],
    [W * 0.36, 0.94],
  ] as const) {
    const base = H * 0.832;
    ctx.beginPath();
    ctx.arc(x, base - 92 * s, 16 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 24 * s, base);
    ctx.quadraticCurveTo(x - 26 * s, base - 70 * s, x, base - 74 * s);
    ctx.quadraticCurveTo(x + 26 * s, base - 70 * s, x + 24 * s, base);
    ctx.closePath();
    ctx.fill();
  }
  return { img: c, width: W, height: H };
}
