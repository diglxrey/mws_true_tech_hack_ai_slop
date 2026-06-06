import path from "node:path"
import { fileURLToPath } from "node:url"
import createNextIntlPlugin from "next-intl/plugin"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Include workspace packages (`@workspace/ui`, editor SDK) in standalone trace.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@workspace/ui", "@blocknote/core", "@blocknote/react", "@blocknote/mantine", "@snipeter/editor-sdk", "@snipeter/plugin-callout"],
}

export default withNextIntl(nextConfig)
