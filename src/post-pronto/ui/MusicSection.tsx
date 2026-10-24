import { ExternalLink, LoaderCircle, Music, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { spotifySearch, youtubeSearch } from "../links";
import { findPreview, SILENT_AUDIO, type SongPreview } from "../preview";
import { inClaude } from "../runtime";
import type { MusicPick } from "../types";
import { CopyButton } from "./parts";

/** O trecho de uma das músicas: procurando, tocando (ou pausado) ou sem trecho para tocar. */
type Playback =
  | { index: number; status: "loading" | "missing" | "failed" }
  | { index: number; status: "playing" | "paused"; preview: SongPreview; time: number; duration: number };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Toca o trecho de 30 segundos das músicas, uma de cada vez, num único elemento de áudio. */
function usePreviewPlayer(music: MusicPick[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const songUrl = useRef("");
  const turn = useRef(0);
  const [playback, setPlayback] = useState<Playback | null>(null);

  useEffect(
    () => () => {
      turn.current++;
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
    },
    [],
  );

  function element() {
    if (audioRef.current) return audioRef.current;
    const a = new Audio();
    a.preload = "auto";
    // só o áudio do trecho conta, não o silêncio que destrava o som
    const isSong = () => songUrl.current !== "" && a.src === songUrl.current;
    const sync = () => {
      if (!isSong()) return;
      setPlayback((p) =>
        p && "preview" in p
          ? {
              ...p,
              status: a.paused ? "paused" : "playing",
              time: a.currentTime,
              duration: Number.isFinite(a.duration) && a.duration > 0 ? a.duration : p.duration,
            }
          : p,
      );
    };
    for (const e of ["play", "pause", "timeupdate", "durationchange"]) a.addEventListener(e, sync);
    a.addEventListener("ended", () => {
      if (isSong()) a.currentTime = 0;
    });
    a.addEventListener("error", () => {
      if (isSong()) setPlayback((p) => p && { index: p.index, status: "failed" });
    });
    audioRef.current = a;
    return a;
  }

  function toggle(i: number) {
    const a = element();
    if (playback?.index === i && "preview" in playback) {
      if (a.paused) a.play().catch(() => setPlayback({ index: i, status: "failed" }));
      else a.pause();
      return;
    }
    if (playback?.index === i && playback.status === "loading") return;
    const mine = ++turn.current;
    songUrl.current = "";
    a.pause();
    a.src = SILENT_AUDIO;
    a.play().catch(() => {});
    setPlayback({ index: i, status: "loading" });
    findPreview(music[i].title, music[i].artist).then(
      (preview) => {
        if (mine !== turn.current) return;
        if (!preview) return setPlayback({ index: i, status: "missing" });
        a.src = preview.audio;
        songUrl.current = a.src;
        setPlayback({ index: i, status: "playing", preview, time: 0, duration: 30 });
        a.play().catch((e: unknown) => {
          if (mine !== turn.current) return;
          const name = e instanceof DOMException ? e.name : "";
          // o navegador quer um toque novo para tocar: o botão fica em "Ouvir trecho"
          if (name === "NotAllowedError") setPlayback({ index: i, status: "paused", preview, time: 0, duration: 30 });
          else if (name !== "AbortError") setPlayback({ index: i, status: "failed" });
        });
      },
      () => {
        if (mine === turn.current) setPlayback({ index: i, status: "failed" });
      },
    );
  }

  return { playback, toggle };
}

/** Botão e andamento do trecho de uma música, fora do Claude. */
function PreviewControls({
  song,
  playback,
  onToggle,
}: {
  song: MusicPick;
  playback: Playback | null;
  onToggle: () => void;
}) {
  const status = playback?.status ?? "idle";
  const started = playback && "preview" in playback && playback.time > 0;
  const [Icon, label, name] =
    status === "loading"
      ? [LoaderCircle, "Procurando…", `Procurando o trecho de ${song.title}`]
      : status === "playing"
        ? [Pause, "Pausar", `Pausar o trecho de ${song.title}`]
        : started
          ? [Play, "Continuar", `Continuar o trecho de ${song.title}`]
          : [Play, "Ouvir trecho", `Ouvir trecho de ${song.title}`];
  return (
    <button
      type="button"
      className="btn secondary small song-button"
      aria-label={name}
      aria-busy={status === "loading" || undefined}
      onClick={onToggle}
    >
      <Icon size={14} aria-hidden="true" className={status === "loading" ? "spin" : undefined} /> {label}
    </button>
  );
}

export function MusicSection({
  music,
  value,
  onChange,
  stories,
}: {
  music: MusicPick[];
  value: number;
  onChange: (i: number) => void;
  stories: boolean;
}) {
  const { playback, toggle } = usePreviewPlayer(music);
  // dentro do Claude a página não consegue buscar nem tocar áudio de outros sites
  const external = inClaude();

  return (
    <section className="block" aria-labelledby="pp-music">
      <h3 id="pp-music">
        <Music size={17} aria-hidden="true" /> Música
      </h3>
      {music.length ? (
        <>
          <p className="hint">
            {stories
              ? "No story, toque no ícone de figurinhas, escolha Música, busque pelo nome e escolha o trecho."
              : "No Instagram, toque em Adicionar música e busque pelo nome."}{" "}
            O catálogo muda conforme o país e o tipo de conta.
          </p>
          {external && (
            <p className="hint">
              Dentro do Claude, a página não consegue tocar áudio de outros sites: para ouvir, a música abre no YouTube.
            </p>
          )}
          <ul className="picks">
            {music.map((m, i) => {
              const name = `${m.title} ${m.artist}`.trim();
              const play = playback?.index === i ? playback : null;
              const youtube = (text: string) => (
                <a href={youtubeSearch(name)} target="_blank" rel="noreferrer">
                  {text} <ExternalLink size={12} aria-hidden="true" />
                </a>
              );
              return (
                <li key={i} className={value === i ? "on" : ""}>
                  <label>
                    <input type="radio" name="pp-music" checked={value === i} onChange={() => onChange(i)} />
                    <span>
                      <strong>{m.title}</strong>
                      {m.artist && ` – ${m.artist}`}
                      {m.part && <span className="pick-part"> · {m.part}</span>}
                    </span>
                  </label>
                  {m.why && <p className="pick-why">{m.why}</p>}
                  <p className="pick-links">
                    {external ? (
                      <a
                        className="btn secondary small song-button"
                        href={youtubeSearch(name)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Ouvir no YouTube: ${m.title}`}
                      >
                        <Play size={14} aria-hidden="true" /> Ouvir no YouTube
                      </a>
                    ) : (
                      <PreviewControls song={m} playback={play} onToggle={() => toggle(i)} />
                    )}
                    <a href={spotifySearch(name)} target="_blank" rel="noreferrer">
                      Spotify <ExternalLink size={12} aria-hidden="true" />
                    </a>
                    {!external && youtube("YouTube")}
                    <CopyButton text={name} label="Copiar nome" className="btn ghost small" />
                  </p>
                  {play && "preview" in play && (
                    <div className="song-player">
                      {play.preview.artwork && <img className="song-art" src={play.preview.artwork} alt="" />}
                      <div className="song-track">
                        <progress
                          max={play.duration}
                          value={Math.min(play.time, play.duration)}
                          aria-label={`Andamento do trecho de ${m.title}`}
                        />
                        <span className="song-meta">
                          <span className="song-time">
                            {clock(play.time)} / {clock(play.duration)}
                          </span>
                          {play.preview.link ? (
                            <a href={play.preview.link} target="_blank" rel="noreferrer">
                              Prévia da Apple Music <ExternalLink size={12} aria-hidden="true" />
                            </a>
                          ) : (
                            <span>Prévia da Apple Music</span>
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                  {play?.status === "missing" && (
                    <p className="song-note" role="status">
                      Não achei um trecho desta música para tocar aqui. {youtube("Ouça no YouTube")}
                    </p>
                  )}
                  {play?.status === "failed" && (
                    <p className="song-note" role="status">
                      Não deu para tocar o trecho agora. {youtube("Ouça no YouTube")}
                    </p>
                  )}
                </li>
              );
            })}
            <li className={value === -1 ? "on" : ""}>
              <label>
                <input type="radio" name="pp-music" checked={value === -1} onChange={() => onChange(-1)} />
                <span>Sem música</span>
              </label>
            </li>
          </ul>
        </>
      ) : (
        <p className="hint">O Claude não sugeriu músicas desta vez.</p>
      )}
    </section>
  );
}
