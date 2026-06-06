import { existsSync } from "fs"
import { resolve } from "path"
import { config } from "dotenv"

/** Same paths as `ConfigModule.forRoot({ envFilePath })` — must run before `./instrumentation`. */
const envPaths = [".env", "../.env", "../../.env"]
for (const relative of envPaths) {
  const path = resolve(process.cwd(), relative)
  if (existsSync(path)) {
    config({ path })
  }
}
