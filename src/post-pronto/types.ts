// Tipos do Post Pronto: o que a pessoa informa e o que o Claude devolve.

export type Goal = "comments" | "shares" | "sales" | "memory";
export type Tone = "auto" | "fun" | "inspiring" | "emotional" | "elegant" | "professional" | "bold";
export type Language = "pt" | "en" | "es" | "pt-en";
export type EmojiLevel = "none" | "few" | "many";

/** O briefing do post: contexto livre e preferências. */
export interface Brief {
  context: string;
  profile: string;
  goal: Goal;
  tone: Tone;
  language: Language;
  emojis: EmojiLevel;
}

/** Dados gravados na foto (EXIF), quando existem. */
export interface PhotoMeta {
  /** Data e hora locais em que a foto foi tirada, no formato 2026-03-12T18:40:00. */
  takenAt?: string;
  lat?: number;
  lon?: number;
}

export interface Question {
  question: string;
  options: string[];
}

export interface Answer {
  question: string;
  answer: string;
}

export interface CaptionOption {
  style: string;
  text: string;
  hashtags: string[];
  why: string;
}

export interface MusicPick {
  title: string;
  artist: string;
  part: string;
  why: string;
}

export interface PlacePick {
  name: string;
  kind: string;
  why: string;
}

/** Resposta do Claude: ou perguntas de contexto, ou as sugestões completas. */
export interface Suggestions {
  status: "questions" | "suggestions";
  analysis: string;
  questions: Question[];
  captions: CaptionOption[];
  overlays: string[];
  altText: string;
  music: MusicPick[];
  places: PlacePick[];
  tips: string[];
}

/** A legenda escolhida, como a pessoa está editando. */
export interface Draft {
  text: string;
  hashtags: string[];
}
