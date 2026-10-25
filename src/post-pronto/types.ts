// Tipos do Post Pronto: o que a pessoa informa e o que o Claude devolve.

/** Onde o post vai: stories (texto escrito na foto, figurinhas) ou feed (legenda). */
export type Destination = "stories" | "feed";
export type Goal = "comments" | "shares" | "sales" | "memory";
export type Tone = "auto" | "fun" | "inspiring" | "emotional" | "elegant" | "professional" | "bold";
export type Language = "pt" | "en" | "es" | "pt-en";
export type EmojiLevel = "none" | "few" | "many";
/** Tamanho do texto escrito em cada tela dos stories. */
export type StoryLength = "short" | "long";

/** O briefing do post: contexto livre e preferências. */
export interface Brief {
  destination: Destination;
  context: string;
  profile: string;
  goal: Goal;
  tone: Tone;
  language: Language;
  emojis: EmojiLevel;
  storyLength: StoryLength;
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

/** Figurinhas interativas dos stories (a pessoa adiciona no Instagram; não vão na foto). */
export type StickerKind = "poll" | "question" | "quiz" | "slider" | "countdown" | "link" | "add-yours";

export interface Sticker {
  kind: StickerKind;
  /** A pergunta, o título ou a chamada. */
  text: string;
  /** Opções da enquete ou do quiz (no quiz, a primeira é a correta); no slider, o emoji. */
  options: string[];
}

/** Uma tela de story: uma foto, com o texto escrito nela e talvez uma figurinha. */
export interface StoryFrame {
  text: string;
  /** Segundo trecho, escrito com outra fonte (com "Dois trechos com fontes diferentes" ligado). */
  text2?: string;
  sticker: Sticker | null;
  /** Onde a figurinha tracejada fica na prévia (centro, em fração da tela); só para planejar, não vai na foto. */
  stickerAt?: { x: number; y: number };
}

export interface StoryVersion {
  style: string;
  frames: StoryFrame[];
  why: string;
}

/** Resposta do Claude: ou perguntas de contexto, ou as sugestões completas. */
export interface Suggestions {
  status: "questions" | "suggestions";
  analysis: string;
  questions: Question[];
  /** Feed: opções de legenda. */
  captions: CaptionOption[];
  /** Stories: versões da sequência, com uma tela por foto. */
  stories: StoryVersion[];
  /** Stories: hashtags ocultas, para esconder no story. */
  hashtags: string[];
  overlays: string[];
  altText: string;
  music: MusicPick[];
  places: PlacePick[];
  tips: string[];
}

/** A legenda escolhida, como a pessoa está editando. */
export interface Draft {
  text: string;
  /** Hashtags ocultas: fora da legenda, para o primeiro comentário. */
  hashtags: string[];
}
