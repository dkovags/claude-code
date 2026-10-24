// Trecho de 30 segundos das músicas sugeridas, pela busca pública do iTunes (Apple), que não pede chave.
// Dentro do Claude a página não pode buscar nem tocar áudio de outros sites: lá a música abre no YouTube.

export interface SongPreview {
  /** Áudio do trecho (30 segundos). */
  audio: string;
  title: string;
  artist: string;
  artwork?: string;
  /** Página da música na Apple Music. */
  link?: string;
}

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** "Aquarela (Ao Vivo)" → "aquarela ao vivo": sem acentos, pontuação nem maiúsculas, para comparar nomes. */
export function normalizeName(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// palavras que aparecem em nomes de artistas sem identificar nenhum
const COMMON_WORDS = new Set(["band", "banda", "feat", "featuring", "with", "orchestra", "orquestra", "grupo", "trio"]);

/**
 * O artista achado é o sugerido: um nome contém o outro ("Marisa Monte" em "Marisa Monte, Carlinhos Brown & Arnaldo
 * Antunes") ou os dois têm um sobrenome em comum ("Tom Jobim" e "Antônio Carlos Jobim").
 */
export function sameArtist(suggested: string, found: string): boolean {
  const s = normalizeName(suggested);
  const f = normalizeName(found);
  if (!s) return true;
  if (!f) return false;
  if (` ${f} `.includes(` ${s} `) || ` ${s} `.includes(` ${f} `)) return true;
  const words = new Set(f.split(" ").filter((w) => w.length >= 4 && !COMMON_WORDS.has(w)));
  return s.split(" ").some((w) => words.has(w));
}

/** 3: mesmo título; 2: um começa com o outro ("Aquarela" e "Aquarela (Ao Vivo)"); 1: um contém o outro; 0: outro. */
function titleScore(found: string, wanted: string): number {
  if (!wanted) return 1;
  if (found === wanted) return 3;
  const f = ` ${found} `;
  const w = ` ${wanted} `;
  const longEnough = found.length >= 3;
  if (f.startsWith(w) || (longEnough && w.startsWith(f))) return 2;
  if (f.includes(w) || (longEnough && w.includes(f))) return 1;
  return 0;
}

/**
 * Escolhe na busca a faixa da música sugerida: precisa ser do mesmo artista e ter um título parecido; entre essas,
 * fica a de título mais próximo. Sem nenhuma, devolve null (melhor não tocar outra música no lugar).
 */
export function pickPreview(results: unknown[], title: string, artist: string): SongPreview | null {
  const wanted = normalizeName(title);
  let best: { score: number; item: Obj } | null = null;
  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Obj;
    if (!str(item.previewUrl) || !sameArtist(artist, str(item.artistName))) continue;
    const score = titleScore(normalizeName(str(item.trackName)), wanted);
    if (score > (best?.score ?? 0)) best = { score, item };
  }
  if (!best) return null;
  const item = best.item;
  return {
    audio: str(item.previewUrl),
    title: str(item.trackName) || title,
    artist: str(item.artistName) || artist,
    artwork: str(item.artworkUrl100) || undefined,
    link: str(item.trackViewUrl) || undefined,
  };
}

export function searchUrl(title: string, artist: string, callback?: string): string {
  const params = new URLSearchParams({
    term: `${title} ${artist}`.trim(),
    media: "music",
    entity: "song",
    limit: "10",
    country: "BR",
  });
  if (callback) params.set("callback", callback);
  return `https://itunes.apple.com/search?${params}`;
}

type SearchAnswer = { results?: unknown[] };
let jsonpSeq = 0;

/** A mesma busca por JSONP, para quando o navegador recusa a leitura direta (CORS). */
function searchJsonp(title: string, artist: string): Promise<SearchAnswer> {
  return new Promise((resolve, reject) => {
    const name = `__postProntoItunes${++jsonpSeq}`;
    const slot = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const done = () => {
      delete slot[name];
      script.remove();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error("tempo esgotado"));
    }, 10000);
    slot[name] = (data: SearchAnswer) => {
      done();
      resolve(data);
    };
    script.onerror = () => {
      done();
      reject(new Error("busca indisponível"));
    };
    script.src = searchUrl(title, artist, name);
    document.head.appendChild(script);
  });
}

async function search(title: string, artist: string): Promise<unknown[]> {
  let data: SearchAnswer;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 8000);
  try {
    const res = await fetch(searchUrl(title, artist), { signal: stop.signal });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch (e) {
    // demorou demais: a internet está lenta, e o JSONP só faria esperar mais
    if (stop.signal.aborted) throw e;
    data = await searchJsonp(title, artist);
  } finally {
    clearTimeout(timer);
  }
  return Array.isArray(data.results) ? data.results : [];
}

const found = new Map<string, Promise<SongPreview | null>>();

/** Procura o trecho da música; null quando a Apple não tem a música. Rejeita quando a busca falha. */
export function findPreview(title: string, artist: string): Promise<SongPreview | null> {
  const key = `${normalizeName(title)}|${normalizeName(artist)}`;
  let preview = found.get(key);
  if (!preview) {
    preview = search(title, artist).then((results) => pickPreview(results, title, artist));
    // falhou (sem internet, por exemplo): o próximo toque tenta de novo
    preview.catch(() => found.delete(key));
    found.set(key, preview);
  }
  return preview;
}

/**
 * 10 ms de silêncio, tocados no próprio toque do botão: alguns navegadores de celular só deixam tocar som que comece
 * dentro do toque, e a busca do trecho termina depois dele.
 */
export const SILENT_AUDIO =
  "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
