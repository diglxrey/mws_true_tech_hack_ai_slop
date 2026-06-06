export interface OutputValidationResult {
  passed: boolean
  reason?: string
}

const SECRET_PATTERNS = [
  /password\s*=\s*\S+/i,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /DB_PASSWORD/i,
  /sk-[A-Za-z0-9]{20,}/,
  /api[_-]?key\s*[:=]\s*\S+/i,
]

const SYSTEM_LEAK_MARKERS = [
  /<\s*system\s*>/i,
  /Content inside `<user_input>`/i,
  /You are Snippeter's snippet assistant/i,
]

export function validateAssistantOutput(text: string): OutputValidationResult {
  for (const re of SYSTEM_LEAK_MARKERS) {
    if (re.test(text)) {
      return { passed: false, reason: "system_content_leak" }
    }
  }
  for (const re of SECRET_PATTERNS) {
    if (re.test(text)) {
      return { passed: false, reason: "possible_secret" }
    }
  }
  return { passed: true }
}

export const OUTPUT_VALIDATION_FALLBACK =
  "Could not show the model reply due to a safety check. Please try rephrasing your request."
