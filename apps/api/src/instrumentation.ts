import { LangfuseSpanProcessor } from "@langfuse/otel"
import { NodeSDK } from "@opentelemetry/sdk-node"

if (!process.env["LANGFUSE_BASE_URL"]?.trim() && process.env["LANGFUSE_HOST"]?.trim()) {
  process.env["LANGFUSE_BASE_URL"] = process.env["LANGFUSE_HOST"]
}

const publicKey = process.env["LANGFUSE_PUBLIC_KEY"]?.trim()
const secretKey = process.env["LANGFUSE_SECRET_KEY"]?.trim()

let sdk: NodeSDK | null = null
let langfuseSpanProcessor: LangfuseSpanProcessor | null = null

if (publicKey && secretKey) {
  const baseUrl = process.env["LANGFUSE_BASE_URL"]?.trim() || "https://cloud.langfuse.com"
  langfuseSpanProcessor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl,
  })
  sdk = new NodeSDK({
    spanProcessors: [langfuseSpanProcessor],
  })
  sdk.start()
}

export function getLangfuseOtelSdk(): NodeSDK | null {
  return sdk
}

export async function flushLangfuseSpanProcessor(): Promise<void> {
  await langfuseSpanProcessor?.forceFlush()
}

export async function shutdownLangfuseOtelSdk(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
    sdk = null
    langfuseSpanProcessor = null
  }
}
