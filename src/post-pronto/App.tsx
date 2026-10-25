import { KeyRound, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AiError, type AiBackend, apiBackend, type ApiSettings, connectClaude, loadApiSettings, saveApiSettings,
} from "./ai";
import { loadPrefs, type Prefs, savePrefs } from "./brief";
import { withTwoParts } from "./caption";
import { captureElement, captureName } from "./capture";
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
import { Busy, CaptureDialog, SettingsDialog } from "./ui/Overlays";
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
  frames.map((f) => ({ ...f, sticker: f.sticker && { ...f.sticker, options: [...f.sticker.options] } }));

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
  /** Stories: texto e figurinha de cada tela, e as hashtags ocultas. */
  const [frames, setFrames] = useState<StoryFrame[]>([]);
  const [undoFrames, setUndoFrames] = useState<StoryFrame[] | null>(null);
  const [storyTags, setStoryTags] = useState<string[]>([]);
  const [finish, setFinish] = useState<FinishState>(INITIAL_FINISH);
  const [busy, setBusy] = useState<BusyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  /** A imagem da tela pronta, mostrada antes de baixar. */
  const [screenShot, setScreenShot] = useState<{ blob: Blob; url: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);
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
      setUploadError(null);
      if (!files.length) return;
      const images = files.filter(isImageFile);
      const skipped = files.length - images.length;
      if (!images.length) {
        setUploadError(
          `${files.length === 1 ? "O arquivo escolhido não é uma imagem" : "Os arquivos escolhidos não são imagens"}. ` +
            "Escolha fotos em JPG, PNG ou WebP.",
        );
        return;
      }
      const room = MAX_PHOTOS - photos.length;
      if (room <= 0) {
        setUploadError(`O post já tem ${MAX_PHOTOS} fotos, o máximo.`);
        return;
      }
      const loaded: Photo[] = [];
      const failed: string[] = [];
      setLoadingPhotos(true);
      try {
        for (const f of images.slice(0, room)) {
          try {
            loaded.push(await loadPhoto(f));
          } catch {
            failed.push(f.name || "sem nome");
          }
        }
      } finally {
        setLoadingPhotos(false);
      }
      setPhotos((ps) => [...ps, ...loaded].slice(0, MAX_PHOTOS));
      const notes: string[] = [];
      if (failed.length) {
        notes.push(
          `Não foi possível abrir ${failed.map((n) => `“${n}”`).join(", ")}. Envie em JPG, PNG ou WebP ` +
            "(fotos HEIC do iPhone não abrem em todos os navegadores).",
        );
      }
      if (images.length > room) notes.push(`O post pode ter até ${MAX_PHOTOS} fotos; ${images.length - room} ficaram de fora.`);
      if (skipped) {
        notes.push(skipped === 1 ? "1 arquivo não era imagem e ficou de fora." : `${skipped} arquivos não eram imagens e ficaram de fora.`);
      }
      if (notes.length) setUploadError(notes.join(" "));
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
    storyLength: prefs.storyLength,
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

  /**
   * Pede as sugestões. "more" gera outras opções; com `context`/`update`, gera de novo com o contexto editado e a
   * informação nova (que passa a fazer parte do contexto se der certo).
   */
  async function suggest(kind: "first" | "answers" | "skip" | "more", change?: { context: string; update: string }) {
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
      kind === "more" && result && !change
        ? stories
          ? result.stories.map((v) => v.frames.map((f) => f.text).join(" / "))
          : result.captions.map((c) => c.text)
        : [];
    const prompt = buildSuggestPrompt({
      brief: change ? { ...brief, context: change.context } : brief,
      photoCount: photos.length,
      attachedCount: attached.length,
      metas: useMeta ? photos.map((p) => p.meta) : [],
      answers: answered,
      allowQuestions,
      avoid,
      update: change?.update,
      today: todayLabel(),
    });
    const count = photos.length;
    const next = await run(
      {
        label:
          kind === "first"
            ? "Olhando as fotos"
            : change
              ? "Gerando de novo com a informação nova"
              : stories
                ? "Escrevendo os textos"
                : "Escrevendo as legendas",
        writingLabel: "Escrevendo as sugestões",
        // tamanho esperado da resposta, para a barra de progresso (com as opções de texto e cada tela delas)
        expected: stories ? 2500 + 1150 * count : 6300,
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
    if (change) setContext([change.context.trim(), change.update.trim()].filter(Boolean).join("\n"));
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
      // sugestões novas começam com um trecho só
      twoParts: false,
      overlay: { ...f.overlay, text: next.overlays[0] ?? "", text2: "", position: stories ? "top" : f.overlay.position },
      music: next.music.length ? 0 : -1,
      place: next.places.length ? 0 : -1,
      altText: next.altText,
    }));
    setStep("captions");
  }

  /** Cria uma imagem da página inteira, como uma captura de tela (que no celular pode estar bloqueada), e mostra. */
  async function captureScreen() {
    if (!root.current || capturing) return;
    setCapturing(true);
    try {
      const blob = await captureElement(root.current);
      setScreenShot({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      // o detalhe ajuda a descobrir o que falhou neste aparelho
      const detail = e instanceof Error ? (e.name && e.name !== "Error" ? e.name : e.message) : "";
      setToast(`Não foi possível criar a imagem da tela${detail ? ` (${detail.slice(0, 60)})` : ""}.`);
    } finally {
      setCapturing(false);
    }
  }

  function closeScreenShot() {
    if (screenShot) URL.revokeObjectURL(screenShot.url);
    setScreenShot(null);
  }

  async function saveScreenShot() {
    if (!screenShot || !saver) return;
    try {
      if ((await saver.save(captureName(), screenShot.blob)) === "saved") setToast("Imagem da tela baixada.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Não foi possível baixar a imagem da tela.");
    }
  }

  async function shareScreenShot() {
    if (!screenShot || !saver?.share) return;
    try {
      await saver.share([new File([screenShot.blob], captureName(), { type: "image/png" })]);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Não foi possível compartilhar a imagem da tela.");
    }
  }

  /** Liga ou desliga título e explicação: divide (ou junta) o texto de cada tela e o da capa. */
  function setTwoParts(on: boolean) {
    if (stories) setFrames(photos.map((_, i) => withTwoParts(frames[i] ?? { text: "", sticker: null }, on)));
    setFinish((f) => ({ ...f, twoParts: on, overlay: withTwoParts(f.overlay, on) }));
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
      // os textos reescritos ficam onde a pessoa os arrastou na prévia
      const placed = next.map((f, i) => ({ ...f, textAt: current[i]?.textAt, text2At: current[i]?.text2At }));
      setFrames(finish.twoParts ? placed.map((f) => withTwoParts(f, true)) : placed);
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
    // tocar de novo na escolhida não pode apagar o que já foi editado
    if (!result || i === chosen) return;
    setChosen(i);
    if (stories) {
      const picked = copyFrames(result.stories[i].frames);
      setFrames(finish.twoParts ? picked.map((f) => withTwoParts(f, true)) : picked);
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
    setUploadError(null);
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
    // enquadrar na prévia vale desde a primeira página, assim que há uma foto
    editable: !isExample,
    onFraming: (f: Framing) => setFraming(previewIndex, f),
    index: previewIndex,
    count: photos.length,
    onIndex: setActive,
  };

  return (
    <div className="pp" ref={root}>
      <Header
        destination={destination}
        step={step}
        reachable={reachable}
        onStep={setStep}
        onSettings={insideClaude ? undefined : () => setSettingsOpen(true)}
        onCapture={captureScreen}
        capturing={capturing}
      />
      <main className={`layout step-${step} dest-${destination}`}>
        <section className="stage" aria-label={stories ? "Prévia do story" : "Prévia do post"}>
          {stories ? (
            <StoryPreview
              {...previewCommon}
              sticker={shownFrames[previewIndex]?.sticker ?? null}
              stickerAt={shownFrames[previewIndex]?.stickerAt}
              onStickerMove={
                picked && !isExample
                  ? (at) => setFrames(frames.map((f, i) => (i === previewIndex ? { ...f, stickerAt: at } : f)))
                  : undefined
              }
              onTextMove={
                picked && !isExample && overlay
                  ? (part, at) =>
                      setFrames(
                        frames.map((f, i) =>
                          i !== previewIndex ? f : part === 1 ? { ...f, textAt: at } : { ...f, text2At: at },
                        ),
                      )
                  : undefined
              }
              onStickerRemove={
                picked && !isExample
                  ? () => {
                      setFrames(frames.map((f, i) => (i === previewIndex ? { ...f, sticker: null, stickerAt: undefined } : f)));
                      setToast("Figurinha removida. Dá para escolher outra no editor dos textos.");
                    }
                  : undefined
              }
            />
          ) : (
            <PostPreview
              {...previewCommon}
              spec={spec}
              draft={isExample ? EXAMPLE_DRAFT : picked ? draft : null}
              onTextMove={
                atFinish && overlay && previewIndex === 0
                  ? (part, at) =>
                      setFinish((f) => ({ ...f, overlay: part === 1 ? { ...f.overlay, at } : { ...f.overlay, at2: at } }))
                  : undefined
              }
            />
          )}
          {isExample && (
            <p className="stage-note">
              {stories
                ? "Assim fica o resultado: a foto em tela cheia com o texto escrito nela e, tracejadas, as figurinhas que você adiciona no Instagram."
                : "Assim fica o resultado: a foto no formato do feed, a legenda com o gancho na primeira linha, a música e o local."}
            </p>
          )}
          {/* nos stories, a dica fica na legenda da própria prévia */}
          {!isExample && !stories && (
            <p className="stage-note">Arraste a foto para enquadrar e faça pinça com dois dedos para o zoom.</p>
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
              loadingPhotos={loadingPhotos}
              uploadError={uploadError}
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
              storyLength={prefs.storyLength}
              twoParts={finish.twoParts}
              onTwoParts={setTwoParts}
              onRefine={refine}
              canUndo={!!undoFrames}
              onUndo={() => {
                if (undoFrames) setFrames(undoFrames);
                setUndoFrames(null);
              }}
              context={context}
              onRegenerate={(edited, update) => suggest("more", { context: edited, update })}
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
              context={context}
              onRegenerate={(edited, update) => suggest("more", { context: edited, update })}
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
              onTwoParts={setTwoParts}
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
      {screenShot && (
        <CaptureDialog
          url={screenShot.url}
          onSave={saver ? saveScreenShot : undefined}
          onShare={saver?.share ? shareScreenShot : undefined}
          onClose={closeScreenShot}
        />
      )}
      {toast && (
        <div className="toast" role="status" data-capture="skip">
          {toast}
        </div>
      )}
    </div>
  );
}
