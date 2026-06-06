import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse as parseDotenv } from "dotenv"
import { plainToInstance } from "class-transformer"
import { IsIn, IsNumberString, IsOptional, IsString, validateSync } from "class-validator"

class EnvironmentVariables {
  @IsString()
  META_DATABASE_URL!: string

  @IsString()
  REDIS_URL!: string

  /** MWS Tables Fusion API base (no trailing slash), e.g. https://tables.example.com */
  @IsString()
  MWS_FUSION_BASE_URL!: string

  @IsString()
  MWS_TOKEN!: string

  /** When empty, first space from GET /fusion/v1/spaces is used. */
  @IsOptional()
  @IsString()
  MWS_SPACE_ID?: string

  /** Max rows loaded per variable for aggregate/concat (default 10000). */
  @IsOptional()
  @IsNumberString()
  MWS_MAX_RECORDS_PER_VARIABLE?: string

  @IsOptional()
  @IsString()
  PORT?: string

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string

  /** Nest log verbosity: error | warn | log | debug | verbose. If unset: verbose in dev, log in production. */
  @IsOptional()
  @IsIn(["error", "warn", "log", "debug", "verbose"])
  LOG_LEVEL?: string

  /** 1/true/yes/on to log each HTTP request; 0/false/off to disable. Default: on when NODE_ENV !== production. */
  @IsOptional()
  @IsString()
  API_HTTP_LOG?: string

  @IsOptional()
  @IsString()
  LLM_PROVIDER?: string

  @IsOptional()
  @IsString()
  LLM_MODEL?: string

  @IsOptional()
  @IsString()
  LLM_API_KEY?: string

  /** Custom base URL for OpenAI-compatible providers (e.g. Ollama, vLLM, LM Studio). */
  @IsOptional()
  @IsString()
  LLM_BASE_URL?: string

  @IsOptional()
  @IsString()
  LANGFUSE_PUBLIC_KEY?: string

  @IsOptional()
  @IsString()
  LANGFUSE_SECRET_KEY?: string

  @IsOptional()
  @IsString()
  LANGFUSE_HOST?: string

  /** Preferred over LANGFUSE_HOST; mapped in instrumentation when unset. */
  @IsOptional()
  @IsString()
  LANGFUSE_BASE_URL?: string

  @IsOptional()
  @IsString()
  SYSTEM_PROMPT_PATH?: string

  /** Max conversation history messages (default 50). */
  @IsOptional()
  @IsNumberString()
  MAX_HISTORY_MESSAGES?: string

  /** Max input length for AI chat messages (default 4000). */
  @IsOptional()
  @IsNumberString()
  MAX_INPUT_LENGTH?: string

  @IsOptional()
  @IsString()
  INJECTION_FILTER_ENABLED?: string

  /** Base URL for public embed/share links (no trailing slash), e.g. https://api.example.com */
  @IsOptional()
  @IsString()
  PUBLIC_BASE_URL?: string

  // OIDC / Auth (Dex)
  @IsOptional()
  @IsString()
  OIDC_ISSUER?: string

  @IsOptional()
  @IsString()
  OIDC_AUDIENCE?: string

  @IsOptional()
  @IsString()
  OIDC_JWKS_URI?: string

  // S3-compatible storage (MinIO)
  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string

  @IsOptional()
  @IsString()
  S3_REGION?: string

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY?: string

  @IsOptional()
  @IsString()
  S3_SECRET_KEY?: string

  @IsOptional()
  @IsString()
  S3_BUCKET?: string
}

function trimEnvStrings(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (typeof v === "string") {
      obj[key] = v.trim()
    }
  }
}

/** Same relative paths as `ConfigModule.forRoot({ envFilePath })` in `app.module.ts`. */
const ENV_FILE_RELATIVE = [".env", "../.env", "../../.env"] as const

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

/**
 * Same merge order as `@nestjs/config` `ConfigModule.loadEnvFile`: for each file,
 * `Object.assign(parse(file), previous)` so the first path in the list (cwd `.env`) wins.
 */
function mergedEnvFromDotenvFiles(): Record<string, string> {
  let acc: Record<string, string> = {}
  for (const relative of ENV_FILE_RELATIVE) {
    const p = resolve(process.cwd(), relative)
    if (!existsSync(p)) continue
    const parsed = parseDotenv(readFileSync(p, "utf8"))
    acc = Object.assign(parsed, acc)
  }
  return acc
}

/**
 * Fills `LLM_API_KEY` from provider SDK env names or from `.env` files when the shell
 * exported an empty `LLM_API_KEY` (Nest merges `{ ...files, ...process.env }`).
 * When `LLM_PROVIDER` is unset, picks `openai` vs `anthropic` from which alias supplied the key
 * so an OpenAI key is not sent to the Anthropic SDK (default provider is anthropic).
 */
function normalizeLlmApiKey(merged: Record<string, unknown>): void {
  if (trimStr(merged.LLM_API_KEY)) return

  const providerUnset = !trimStr(merged.LLM_PROVIDER)

  const openaiM = trimStr(merged.OPENAI_API_KEY)
  const anthropicM = trimStr(merged.ANTHROPIC_API_KEY)
  if (openaiM || anthropicM) {
    if (openaiM) {
      merged.LLM_API_KEY = openaiM
      if (providerUnset) merged.LLM_PROVIDER = "openai"
    } else {
      merged.LLM_API_KEY = anthropicM
      if (providerUnset) merged.LLM_PROVIDER = "anthropic"
    }
    return
  }

  const fromFiles = mergedEnvFromDotenvFiles()
  const llmF = trimStr(fromFiles.LLM_API_KEY)
  const openaiF = trimStr(fromFiles.OPENAI_API_KEY)
  const anthropicF = trimStr(fromFiles.ANTHROPIC_API_KEY)

  if (llmF) {
    merged.LLM_API_KEY = llmF
    return
  }
  if (openaiF || anthropicF) {
    if (openaiF) {
      merged.LLM_API_KEY = openaiF
      if (providerUnset) merged.LLM_PROVIDER = "openai"
    } else {
      merged.LLM_API_KEY = anthropicF
      if (providerUnset) merged.LLM_PROVIDER = "anthropic"
    }
  }
}

/**
 * Nest passes only what it loaded from envFilePath; in a monorepo `.env` often lives
 * in the repo root while `cwd` is `apps/api`. Merge `process.env` and trim values.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const merged: Record<string, unknown> = { ...process.env }
  for (const [k, v] of Object.entries(config)) {
    if (v !== undefined) {
      merged[k] = v
    }
  }
  trimEnvStrings(merged)
  normalizeLlmApiKey(merged)

  const transformed = plainToInstance(EnvironmentVariables, merged)
  const errors = validateSync(transformed, { skipMissingProperties: false })
  if (errors.length > 0) {
    throw new Error(errors.map((e) => JSON.stringify(e.constraints)).join(", "))
  }
  return transformed
}
