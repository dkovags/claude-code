import { KeyRound, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AiError, type AiBackend, apiBackend, type ApiSettings, connectClaude, loadApiSettings, saveApiSettings,
} from "./ai";
import { loadPrefs, type Prefs, savePrefs } from "./brief";
import { EXAMPLE_DRAFT, EXAMPLE_MUSIC, EXAMPLE_PLACE, EXAMPLE_STORY, exampleScene } from "./example";
import { type FinishState, INITIAL_FINISH, overlaysFor } from "./finish";
import { isImageFile, loadPhoto, MAX_PHOTOS, type Photo, photoForAi, releasePhoto } from "./photos";
import {
  BadAnswerError, buildRefinePrompt, buildStoryRefinePrompt, buildSuggestPrompt, normalizeRefine, normalizeStoryRefine,
  normalizeSuggestions, REFINE_SCHEMA, STORY_REFINE_SCHEMA, suggestSchema, todayLabel,
} from "./prompts";
import { DEFAULT_FRAMING, formatSpec, type Framing } from "./render";
import { inClaude } from "./runtime";
import { connectSaver, type Saver } from "./save";
import type { Answer, Brief, Destination, Draft, StoryFrame, Suggestions } from "./types";
import { BriefPanel } from "./ui/BriefPanel";
import { CaptionsPanel } from "./ui/CaptionsPanel";
import { FinishPanel } from "./ui/FinishPanel";
import { Header, type Step } from "./ui/Header";
import { Busy, SettingsDialog } from "./ui/Overlays";
import { PostPreview } from "./ui/PostPreview";
import { QuestionsPanel } from "./ui/QuestionsPanel";
import type { PreviewSource } from "./ui/shot";
import { StoriesPanel } from "./ui/StoriesPanel";
import { StoryPreview } from "./ui/StoryPreview";

interface BusyState {
  label: string;
  writingLabel: string;
  expected: number;
  chars: number;
  started: number;
  ctl: AbortController;
}

type TaskOptions = { signal: AbortSignal; onProgress: (chars: number) => void };

const EMPTY_DRAFT: Draft = { text: "", hashtags: [] };
const copyFrames = (frames: StoryFrame[]) =>
  frames.map((f) => ({ text: f.text, sticker: f.sticker && { ...f.sticker, options: [...f.sticker.options] } }));

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [context, setContext] = useState("");
  const [useMeta, setUseMeta] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [active, setActive] = useState(0);
  const [step, setStep] = useState<Step>("brief");
  const [result, setResult] = useState<Suggestions | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [qa, setQa] = useState<Answer[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  /** Feed: a legenda escolhida. */
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [undoDraft, setUndoDraft] = useState<Draft | null>(null);
  /** Stories: texto e figurinha de cada tela, e as hashtags da figurinha de hashtag. */
  const [frames, setFrames] = useState<StoryFrame[]>([]);
  const [undoFrames, setUndoFrames] = useState<StoryFrame[] | null>(null);
  const [storyTags, setStoryTags] = useState<string[]>([]);
  const [finish, setFinish] = useState<FinishState>(INITIAL_FINISH);
  const [busy, setBusy] = useState<BusyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** undefined enquanto conecta; null quando a página não está dentro do Claude. */
  const [claude, setClaude] = useState<AiBackend | null | undefined>(undefined);
  const [saver, setSaver] = useState<Saver | null>(null);
  const [api, setApi] = useState<ApiSettings>(loadApiSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const insideClaude = inClaude();
  const destination = prefs.destination;
  const stories = destination === "stories";
  const example = useMemo(exampleScene, []);
  const viaApi = useMemo(() => (!insideClaude && api.key ? apiBackend(api) : null), [insideClaude, api]);
  const backend = claude ?? viaApi;

  useEffect(() => savePrefs(prefs), [prefs]);

  useEffect(() => {
    let alive = true;
    connectClaude().then((b) => alive && setClaude(b));
    connectSaver().then((s) => alive && setSaver(s));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const addFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      const images = files.filter(isImageFile);
      if (!images.length) {
        if (files.length) setError("Escolha arquivos de imagem: JPG, PNG ou WebP.");
        return;
      }
      const room = MAX_PHOTOS - photos.length;
      if (room <= 0) {
        setError(`O post já tem ${MAX_PHOTOS} fotos, o máximo.`);
        return;
      }
      const loaded: Photo[] = [];
      const failed: string[] = [];
      for (const f of images.slice(0, room)) {
        try {
          loaded.push(await loadPhoto(f));
        } catch {
          failed.push(f.name);
        }
      }
      setPhotos((ps) => [...ps, ...loaded].slice(0, MAX_PHOTOS));
      if (failed.length) {
        setError(
          `Não foi possível abrir ${failed.map((n) => `“${n}”`).join(", ")}. Envie em JPG, PNG ou WebP ` +
            "(fotos HEIC do iPhone não abrem em todos os navegadores).",
        );
      } else if (images.length > room) {
        setError(`O post pode ter até ${MAX_PHOTOS} fotos; ${images.length - room} ficaram de fora.`);
      }
    },
    [photos.length],
  );

  // colar uma imagem (Ctrl+V) na primeira etapa
  useEffect(() => {
    if (step !== "brief") return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [step, addFiles]);

  const movePhoto = (i: number, dir: -1 | 1) =>
    setPhotos((ps) => {
      const j = i + dir;
      if (j < 0 || j >= ps.length) return ps;
      const next = [...ps];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const removePhoto = (i: number) => {
    releasePhoto(photos[i]);
    setPhotos((ps) => ps.filter((_, j) => j !== i));
    setActive(0);
  };
  const setFraming = (i: number, framing: Framing) =>
    setPhotos((ps) => ps.map((p, j) => (j === i ? { ...p, framing } : p)));

  function clearSuggestions() {
    setResult(null);
    setAnswers([]);
    setQa([]);
    setChosen(null);
    setDraft(EMPTY_DRAFT);
    setUndoDraft(null);
    setFrames([]);
    setUndoFrames(null);
    setStoryTags([]);
  }

  /** Stories ou feed: as sugestões de um não servem para o outro. */
  function changeDestination(d: Destination) {
    if (d === destination) return;
    setPrefs({ ...prefs, destination: d });
    if (result) clearSuggestions();
  }

  const brief: Brief = {
    destination,
    context,
    profile: prefs.profile,
    goal: prefs.goal,
    tone: prefs.tone,
    language: prefs.language,
    emojis: prefs.emojis,
  };

  /** Roda um pedido ao Claude mostrando o progresso; devolve undefined se deu erro ou foi cancelado. */
  async function run<T>(
    info: Pick<BusyState, "label" | "writingLabel" | "expected">,
    task: (o: TaskOptions) => Promise<T>,
  ): Promise<T | undefined> {
    const ctl = new AbortController();
    setError(null);
    setBusy({ ...info, chars: 0, started: Date.now(), ctl });
    try {
      const value = await task({
        signal: ctl.signal,
        onProgress: (chars) => setBusy((b) => (b && b.ctl === ctl ? { ...b, chars } : b)),
      });
      return ctl.signal.aborted ? undefined : value;
    } catch (e) {
      if (!(e instanceof AiError && e.code === "cancelled") && !ctl.signal.aborted) {
        setError(e instanceof Error && e.message ? e.message : "Algo deu errado. Tente de novo.");
        if (e instanceof AiError && e.code === "auth" && !insideClaude) setSettingsOpen(true);
      }
      return undefined;
    } finally {
      setBusy((b) => (b?.ctl === ctl ? null : b));
    }
  }

  async function suggest(kind: "first" | "answers" | "skip" | "more") {
    setError(null);
    if (!photos.length) return;
    if (!backend) {
      if (!insideClaude) setSettingsOpen(true);
      else if (claude === undefined) setError("Conectando ao Claude. Tente de novo em instantes.");
      else setError("Esta tela não dá acesso ao Claude. Abra o Post Pronto no claude.ai ou no app do Claude atualizado.");
      return;
    }
    if (backend.maxImages < 1) {
      setError("Esta tela não consegue enviar fotos ao Claude. Abra o Post Pronto no claude.ai ou atualize o app do Claude.");
      return;
    }
    const allowQuestions = kind === "first";
    const answered: Answer[] =
      kind === "answers" && result
        ? result.questions.flatMap((q, i) =>
            answers[i]?.trim() ? [{ question: q.question, answer: answers[i].trim() }] : [],
          )
        : kind === "more"
          ? qa
          : [];
    const attached = photos.slice(0, backend.maxImages);
    const avoid =
      kind === "more" && result
        ? stories
          ? result.stories.map((v) => v.frames.map((f) => f.text).join(" / "))
          : result.captions.map((c) => c.text)
        : [];
    const prompt = buildSuggestPrompt({
      brief,
      photoCount: photos.length,
      attachedCount: attached.length,
      metas: useMeta ? photos.map((p) => p.meta) : [],
      answers: answered,
      allowQuestions,
      avoid,
      today: todayLabel(),
    });
    const count = photos.length;
    const next = await run(
      {
        label: kind === "first" ? "Olhando as fotos" : stories ? "Escrevendo os textos" : "Escrevendo as legendas",
        writingLabel: "Escrevendo as sugestões",
        expected: stories ? 2500 + 700 * count : 4500,
      },
      async ({ signal, onProgress }) => {
        const images = await Promise.all(attached.map(photoForAi));
        const raw = await backend.ask(prompt, {
          images,
          signal,
          onProgress,
          schema: suggestSchema(destination),
          fresh: kind === "more",
        });
        const s = normalizeSuggestions(raw, { destination, frames: count });
        if (s.status === "questions" && !allowQuestions) {
          if (!s.captions.length && !s.stories.length) {
            throw new BadAnswerError("A resposta veio sem sugestões. Tente de novo.");
          }
          return { ...s, status: "suggestions" as const };
        }
        return s;
      },
    );
    if (!next) return;
    setQa(answered);
    setResult(next);
    if (next.status === "questions") {
      setAnswers(next.questions.map(() => ""));
      setStep("questions");
      return;
    }
    setChosen(null);
    setUndoDraft(null);
    setUndoFrames(null);
    setStoryTags(next.hashtags);
    setFinish((f) => ({
      ...f,
      // nos stories o texto vai na foto; no feed, o texto na capa é opcional
      overlayOn: stories ? true : f.overlayOn,
      overlay: { ...f.overlay, text: next.overlays[0] ?? "", position: stories ? "top" : f.overlay.position },
      music: next.music.length ? 0 : -1,
      place: next.places.length ? 0 : -1,
      altText: next.altText,
    }));
    setStep("captions");
  }

  async function refine(instruction: string): Promise<boolean> {
    if (!backend || !result || !instruction.trim()) return false;
    if (stories) {
      const current = photos.map((_, i) => frames[i] ?? { text: "", sticker: null });
      const prompt = buildStoryRefinePrompt({ brief, analysis: result.analysis, frames: current, instruction });
      const next = await run(
        { label: "Ajustando os textos", writingLabel: "Reescrevendo", expected: 300 + 250 * current.length },
        async ({ signal, onProgress }) =>
          normalizeStoryRefine(
            await backend.ask(prompt, { signal, onProgress, schema: STORY_REFINE_SCHEMA, fresh: true }),
            current.length,
          ),
      );
      if (!next) return false;
      setUndoFrames(current);
      setFrames(next);
      return true;
    }
    const prompt = buildRefinePrompt({ brief, analysis: result.analysis, draft, instruction });
    const next = await run(
      { label: "Ajustando a legenda", writingLabel: "Reescrevendo", expected: 900 },
      async ({ signal, onProgress }) =>
        normalizeRefine(await backend.ask(prompt, { signal, onProgress, schema: REFINE_SCHEMA, fresh: true })),
    );
    if (!next) return false;
    setUndoDraft(draft);
    setDraft(next);
    return true;
  }

  function choose(i: number) {
    if (!result) return;
    setChosen(i);
    if (stories) {
      setFrames(copyFrames(result.stories[i].frames));
      setUndoFrames(null);
    } else {
      const c = result.captions[i];
      setDraft({ text: c.text, hashtags: c.hashtags });
      setUndoDraft(null);
    }
  }

  function reset() {
    photos.forEach(releasePhoto);
    setPhotos([]);
    setContext("");
    clearSuggestions();
    setFinish((f) => ({ ...INITIAL_FINISH, format: f.format }));
    setActive(0);
    setError(null);
    setStep("brief");
  }

  const reachable: Record<Step, boolean> = {
    brief: true,
    questions: result?.status === "questions",
    captions: result?.status === "suggestions",
    finish: result?.status === "suggestions" && chosen !== null && photos.length > 0,
  };

  const spec = formatSpec(stories ? "9:16" : finish.format);
  const previewIndex = Math.min(active, Math.max(0, photos.length - 1));
  const previewPhoto: Photo | undefined = photos[previewIndex];
  const source: PreviewSource = useMemo(
    () => (previewPhoto ? { img: previewPhoto.img, width: previewPhoto.width, height: previewPhoto.height } : example),
    [previewPhoto, example],
  );
  const isExample = !previewPhoto;
  const picked = (step === "captions" || step === "finish") && chosen !== null;
  const atFinish = step === "finish";
  const shownFrames = isExample ? [EXAMPLE_STORY] : picked ? frames : [];
  const overlay = stories
    ? overlaysFor("stories", Math.max(1, photos.length), isExample ? { ...finish, overlayOn: true } : finish, shownFrames)[
        previewIndex
      ]
    : atFinish
      ? overlaysFor("feed", photos.length, finish, [])[previewIndex]
      : null;

  let notice = null;
  if (claude && claude.maxImages < 1) {
    notice = (
      <p className="notice">
        Esta tela não consegue enviar fotos ao Claude. Abra o Post Pronto no claude.ai pelo navegador ou atualize o app do
        Claude.
      </p>
    );
  } else if (insideClaude && claude === null) {
    notice = (
      <p className="notice">
        Esta tela não dá acesso ao Claude. Abra o Post Pronto no claude.ai ou no app do Claude atualizado para gerar os
        textos.
      </p>
    );
  } else if (!insideClaude && !api.key) {
    notice = (
      <p className="notice">
        Fora do Claude, o Post Pronto usa a API da Anthropic com uma chave sua.{" "}
        <button type="button" className="btn ghost small" onClick={() => setSettingsOpen(true)}>
          <KeyRound size={15} aria-hidden="true" /> Informar a chave
        </button>
      </p>
    );
  }

  const previewCommon = {
    source,
    framing: previewPhoto?.framing ?? DEFAULT_FRAMING,
    overlay,
    handle: prefs.handle,
    music: isExample ? EXAMPLE_MUSIC : atFinish ? result?.music[finish.music] : undefined,
    place: isExample ? EXAMPLE_PLACE : atFinish ? result?.places[finish.place] : undefined,
    example: isExample,
    editable: atFinish,
    onFraming: (f: Framing) => setFraming(previewIndex, f),
    index: previewIndex,
    count: photos.length,
    onIndex: setActive,
  };

  return (
    <div className="pp">
      <Header
        destination={destination}
        step={step}
        reachable={reachable}
        onStep={setStep}
        onSettings={insideClaude ? undefined : () => setSettingsOpen(true)}
      />
      <main className={`layout step-${step} dest-${destination}`}>
        <section className="stage" aria-label={stories ? "Prévia do story" : "Prévia do post"}>
          {stories ? (
            <StoryPreview {...previewCommon} sticker={shownFrames[previewIndex]?.sticker ?? null} />
          ) : (
            <PostPreview {...previewCommon} spec={spec} draft={isExample ? EXAMPLE_DRAFT : picked ? draft : null} />
          )}
          {isExample && (
            <p className="stage-note">
              {stories
                ? "Assim fica o resultado: a foto em tela cheia com o texto escrito nela e, tracejadas, as figurinhas que você adiciona no Instagram."
                : "Assim fica o resultado: a foto no formato do feed, a legenda com o gancho na primeira linha, a música e o local."}
            </p>
          )}
        </section>

        <section className="panel">
          {error && (
            <div className="alert" role="alert">
              <TriangleAlert size={18} aria-hidden="true" />
              <span>{error}</span>
              <button type="button" aria-label="Fechar aviso" onClick={() => setError(null)}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}

          {step === "brief" && (
            <BriefPanel
              photos={photos}
              onAdd={addFiles}
              onMove={movePhoto}
              onRemove={removePhoto}
              context={context}
              setContext={setContext}
              prefs={prefs}
              setPrefs={setPrefs}
              onDestination={changeDestination}
              useMeta={useMeta}
              setUseMeta={setUseMeta}
              notice={notice}
              onSubmit={() => suggest("first")}
            />
          )}
          {step === "questions" && result && (
            <QuestionsPanel
              result={result}
              submitLabel={stories ? "Gerar textos" : "Gerar legendas"}
              answers={answers}
              setAnswers={setAnswers}
              onSubmit={() => suggest("answers")}
              onSkip={() => suggest("skip")}
              onBack={() => setStep("brief")}
            />
          )}
          {step === "captions" && result && stories && (
            <StoriesPanel
              result={result}
              photos={photos}
              chosen={chosen}
              onChoose={choose}
              frames={frames}
              setFrames={setFrames}
              hashtags={storyTags}
              setHashtags={setStoryTags}
              onRefine={refine}
              canUndo={!!undoFrames}
              onUndo={() => {
                if (undoFrames) setFrames(undoFrames);
                setUndoFrames(null);
              }}
              onMore={() => suggest("more")}
              onConfirm={() => {
                setActive(0);
                setStep("finish");
              }}
              onBack={() => setStep(qa.length ? "questions" : "brief")}
            />
          )}
          {step === "captions" && result && !stories && (
            <CaptionsPanel
              result={result}
              chosen={chosen}
              onChoose={choose}
              draft={draft}
              setDraft={setDraft}
              onRefine={refine}
              canUndo={!!undoDraft}
              onUndo={() => {
                if (undoDraft) setDraft(undoDraft);
                setUndoDraft(null);
              }}
              onMore={() => suggest("more")}
              onConfirm={() => {
                setActive(0);
                setStep("finish");
              }}
              onBack={() => setStep(qa.length ? "questions" : "brief")}
            />
          )}
          {step === "finish" && result && photos.length > 0 && (
            <FinishPanel
              destination={destination}
              photos={photos}
              active={previewIndex}
              setActive={setActive}
              finish={finish}
              setFinish={setFinish}
              setFraming={setFraming}
              result={result}
              draft={draft}
              frames={frames}
              setFrames={setFrames}
              storyTags={storyTags}
              useMeta={useMeta}
              saver={saver}
              notify={setToast}
              onBack={() => setStep("captions")}
              onReset={reset}
            />
          )}

          {busy && (
            <Busy
              label={busy.label}
              writingLabel={busy.writingLabel}
              chars={busy.chars}
              expected={busy.expected}
              started={busy.started}
              onStop={() => busy.ctl.abort()}
            />
          )}
        </section>
      </main>

      <footer className="foot">
        <p>
          {insideClaude
            ? "As fotos vão para o Claude, na sua conta, só para gerar as sugestões."
            : "As fotos vão direto para a API da Anthropic, só para gerar as sugestões."}{" "}
          Revise os textos antes de postar: confira nomes, datas e lugares.
        </p>
      </footer>

      {settingsOpen && (
        <SettingsDialog
          settings={api}
          onClose={() => setSettingsOpen(false)}
          onSave={(s) => {
            saveApiSettings(s);
            setApi(s);
            setSettingsOpen(false);
            setToast(s.key ? "Chave salva neste navegador." : "Chave apagada.");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
