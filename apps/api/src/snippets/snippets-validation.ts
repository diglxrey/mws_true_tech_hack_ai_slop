import { BadRequestException } from "@nestjs/common"

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const MAX_TEMPLATE_BYTES = 64 * 1024
export const MAX_HTML_TEMPLATE_BYTES = 64 * 1024
export const MAX_CSS_BYTES = 64 * 1024
export const MAX_VARIABLES_PER_SNIPPET = 50

export function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new BadRequestException(
      "slug must be lowercase alphanumeric with hyphens (e.g. total-revenue-banner)",
    )
  }
}

export function assertTemplateSize(template: string): void {
  const bytes = Buffer.byteLength(template, "utf8")
  if (bytes > MAX_TEMPLATE_BYTES) {
    throw new BadRequestException(`template exceeds ${MAX_TEMPLATE_BYTES} bytes`)
  }
}

export function assertHtmlTemplateSize(html: string): void {
  const bytes = Buffer.byteLength(html, "utf8")
  if (bytes > MAX_HTML_TEMPLATE_BYTES) {
    throw new BadRequestException(`html_template exceeds ${MAX_HTML_TEMPLATE_BYTES} bytes`)
  }
}

export function assertCssSize(css: string): void {
  const bytes = Buffer.byteLength(css, "utf8")
  if (bytes > MAX_CSS_BYTES) {
    throw new BadRequestException(`css exceeds ${MAX_CSS_BYTES} bytes`)
  }
}

export function assertPlaceholderName(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new BadRequestException("Invalid placeholder_name")
  }
}
