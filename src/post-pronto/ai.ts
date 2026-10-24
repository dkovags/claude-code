// Conexão com o Claude. Dentro do claude.ai (artefato), usa a conta de quem está vendo a página;
// fora dele (GitHub Pages, arquivo aberto no navegador), usa a API da Anthropic com a chave da própria pessoa.
import { getCapability } from "./runtime";

export type AiErrorCode =
  | "cancelled" | "denied" | "limit" | "auth" | "refused" | "incomplete" | "image" | "network" | "request";

export class AiError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const INCOMPLETE = "A resposta veio incompleta. Tente de novo.";
const REFUSED = "O Claude não quis responder a este pedido. Mude o contexto ou as fotos e tente de novo.";

export interface AskOptions {
  images?: Blob[];
  signal?: AbortSignal;
  /** Quantos caracteres da resposta já chegaram (para mostrar o progresso). */
  onProgress?: (chars: number) => void;
  /** Formato da resposta em JSON Schema (a API garante a estrutura). */
  schema: Record<string, unknown>;
  /** Pedir uma resposta nova em vez de reaproveitar uma recente igual. */
  fresh?: boolean;
}

export interface AiBackend {
  kind: "claude" | "api";
  /** Quantas fotos cabem numa chamada (0 = esta tela não envia fotos). */
  maxImages: number;
  /** Envia o pedido e devolve a resposta já convertida de JSON. */
  ask(prompt: string, opts: AskOptions): Promise<unknown>;
}

// ===== Dentro do Claude: recurso "sample" do artefato =====

interface SampleLimits {
  images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] };
}

interface Sample {
  json(input: string, options?: Record<string, unknown>): Promise<unknown>;
  limits(): Promise<SampleLimits>;
}

function sampleError(e: unknown): AiError {
  const code = (e as { code?: string } | null)?.code;
  switch (code) {
    case "cancelled":
      return new AiError("cancelled", "Cancelado.");
    case "not_granted":
    case "not_declared":
    case "capability_disabled":
    case "capability_removed":
      return new AiError(
        "denied",
        "Esta página não tem permissão para usar o Claude. Recarregue a página e toque em Permitir quando o Claude perguntar.",
      );
    case "sampling_disabled":
      return new AiError("denied", "O Claude não está disponível para esta conta.");
    case "rate_limited":
      return new AiError("limit", "Muitos pedidos seguidos ou limite de uso do Claude atingido. Espere um pouco e tente de novo.");
    case "session_expired":
      return new AiError("auth", "Sua sessão no Claude expirou. Entre de novo e recarregue a página.");
    case "images_unavailable":
      return new AiError("image", "Esta tela não consegue enviar fotos ao Claude. Abra o Post Pronto no navegador ou atualize o app do Claude.");
    case "image_rejected":
      return new AiError("image", "Uma das fotos não pôde ser lida pelo Claude. Tente outra foto, em JPG ou PNG.");
    case "refused":
      return new AiError("refused", REFUSED);
    case "invalid_json":
    case "empty_completion":
    case "prompt_too_large":
    case "transform_error":
      return new AiError("incomplete", INCOMPLETE);
    default:
      return new AiError("network", "Não foi possível falar com o Claude agora. Tente de novo em instantes.");
  }
}

/** Liga ao Claude da pessoa quando a página está aberta como artefato; null fora do Claude. */
export async function connectClaude(): Promise<AiBackend | null> {
  const sample = await getCapability<Sample>("sample");
  if (!sample) return null;
  const limits = await sample.limits().catch(() => null);
  return {
    kind: "claude",
    maxImages: limits?.images?.maxCount ?? 0,
    async ask(prompt, { images, signal, onProgress, fresh }) {
      try {
        return await sample.json(prompt, {
          modelTier: "default",
          ...(images?.length ? { images } : {}),
          ...(signal ? { signal } : {}),
          ...(onProgress ? { onText: ({ text }: { text: string }) => onProgress(text.length) } : {}),
          ...(fresh ? { cache: false } : {}),
        });
      } catch (e) {
        throw sampleError(e);
      }
    },
  };
}

// ===== Fora do Claude: API da Anthropic com a chave da pessoa =====

export const API_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 – melhor qualidade" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 – mais rápido" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 – mais econômico" },
] as const;

export type ApiModel = (typeof API_MODELS)[number]["id"];

export interface ApiSettings {
  key: string;
  model: ApiModel;
}

const API_KEY = "post-pronto:api-key";
const API_MODEL = "post-pronto:api-model";

export function loadApiSettings(): ApiSettings {
  try {
    const model = localStorage.getItem(API_MODEL);
    return {
      key: localStorage.getItem(API_KEY) ?? "",
      model: API_MODELS.find((m) => m.id === model)?.id ?? API_MODELS[0].id,
    };
  } catch {
    return { key: "", model: API_MODELS[0].id };
  }
}

export function saveApiSettings(s: ApiSettings) {
  try {
    if (s.key) localStorage.setItem(API_KEY, s.key);
    else localStorage.removeItem(API_KEY);
    localStorage.setItem(API_MODEL, s.model);
  } catch {
    // armazenamento bloqueado: a chave vale só até fechar a página
  }
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type AnthropicClass = typeof import("@anthropic-ai/sdk").default;

function apiError(e: unknown, A: AnthropicClass): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof A.APIUserAbortError) return new AiError("cancelled", "Cancelado.");
  if (e instanceof A.AuthenticationError) return new AiError("auth", "A chave da API não foi aceita. Confira a chave em Configurar.");
  if (e instanceof A.PermissionDeniedError) {
    return new AiError("auth", "Esta chave da API não tem permissão para usar o modelo escolhido.");
  }
  if (e instanceof A.NotFoundError) return new AiError("request", "O modelo escolhido não está disponível para esta chave.");
  if (e instanceof A.RateLimitError) return new AiError("limit", "Limite de uso da API atingido. Espere um pouco e tente de novo.");
  if (e instanceof A.BadRequestError) return new AiError("request", `A API recusou o pedido: ${e.message}`);
  if (e instanceof A.APIConnectionError) return new AiError("network", "Sem conexão com a API. Verifique a internet e tente de novo.");
  if (e instanceof A.APIError) {
    return new AiError("network", `A API não respondeu bem agora (erro ${e.status ?? "desconhecido"}). Tente de novo em instantes.`);
  }
  return new AiError("network", "Não foi possível falar com o Claude agora. Tente de novo.");
}

export function apiBackend({ key, model }: ApiSettings): AiBackend {
  return {
    kind: "api",
    maxImages: 10,
    async ask(prompt, { images = [], signal, onProgress, schema }) {
      if (__ARTIFACT__) throw new AiError("network", "A API não pode ser usada de dentro do Claude.");
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      // a chave fica só neste navegador e vai direto para a Anthropic
      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
      try {
        const content = [
          ...(await Promise.all(
            images.map(async (img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: "image/jpeg" as const, data: await base64(img) },
            })),
          )),
          { type: "text" as const, text: prompt },
        ];
        // Opus e Sonnet: se o filtro de segurança recusar, a própria API refaz o pedido no modelo recomendado
        const fallback =
          model === "claude-haiku-5-5"
            ? {}
            : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: 64000,
            messages: [{ role: "user", content }],
            output_config: { effort: "medium", format: { type: "json_schema", schema } },
            ...fallback,
          },
          { signal },
        );
        let chars = 0;
        stream.on("text", (delta) => {
          chars += delta.length;
          onProgress?.(chars);
        });
        const message = await stream.finalMessage();
        if (message.stop_reason === "refusal") throw new AiError("refused", REFUSED);
        if (message.stop_reason === "max_tokens") throw new AiError("incomplete", INCOMPLETE);
        const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        try {
          return JSON.parse(text);
        } catch {
          throw new AiError("incomplete", INCOMPLETE);
        }
      } catch (e) {
        throw apiError(e, Anthropic);
      }
    },
  };
}
