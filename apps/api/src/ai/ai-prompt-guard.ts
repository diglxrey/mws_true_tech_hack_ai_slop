export interface PromptGuardResult {
  passed: boolean
  pattern?: string
  sanitized?: string
}

const PATTERNS: { re: RegExp; label: string }[] = [
  { re: /ignore (all )?(previous|above|prior) instructions?/i, label: "ignore_previous_instructions" },
  { re: /you are now|forget you are|pretend (you are|to be)/i, label: "role_override" },
  {
    re: /system prompt|reveal your instructions|what are your instructions/i,
    label: "prompt_extraction",
  },
  { re: /\[INST\]|\[SYSTEM\]|<\|im_start\|>|<\|system\|>/i, label: "chat_template_tokens" },
  { re: /do anything now|dan mode|jailbreak/i, label: "jailbreak" },
]

const MAX_INSTRUCTION_HEURISTIC_LEN = 8000

/** Heuristic: very long message that is mostly imperative lines (no normal prose). */
function looksLikeInstructionOnlyBlock(text: string): boolean {
  if (text.length < 2000 || text.length > MAX_INSTRUCTION_HEURISTIC_LEN) return false
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 8) return false
  let imperative = 0
  for (const line of lines) {
    const t = line.trim()
    if (/^(do |don't |never |always |must |ignore |forget |reveal |output |print )/i.test(t)) {
      imperative += 1
    }
  }
  return imperative / lines.length > 0.55
}

export function runPromptGuard(
  rawMessage: string,
  options: { enabled: boolean; maxLength: number },
): PromptGuardResult {
  if (!options.enabled) {
    return { passed: true, sanitized: wrapUserInput(rawMessage) }
  }
  if (rawMessage.length > options.maxLength) {
    return { passed: false, pattern: "max_length_exceeded" }
  }
  for (const { re, label } of PATTERNS) {
    if (re.test(rawMessage)) {
      return { passed: false, pattern: label }
    }
  }
  if (looksLikeInstructionOnlyBlock(rawMessage)) {
    return { passed: false, pattern: "instruction_only_heuristic" }
  }
  return { passed: true, sanitized: wrapUserInput(rawMessage) }
}

export function wrapUserInput(text: string): string {
  return `<user_input>\n${text}\n</user_input>`
}
