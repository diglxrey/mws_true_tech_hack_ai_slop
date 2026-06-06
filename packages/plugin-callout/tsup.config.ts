import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "@blocknote/core", "@blocknote/react", "@snipeter/editor-sdk"],
  esbuildOptions(options) {
    options.jsx = "automatic"
  },
})
