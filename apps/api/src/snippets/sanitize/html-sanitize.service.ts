import { Injectable } from "@nestjs/common"
import DOMPurify from "isomorphic-dompurify"

/** Allowed tags for sanitized HTML embed output. */
const ALLOWED_TAGS = new Set([
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "table",
  "tr",
  "td",
  "th",
  "strong",
  "em",
  "a",
  "img",
  "br",
  "hr",
])

const ALLOWED_ATTR = ["class", "id", "style", "href", "src", "alt", "title", "rel"]

@Injectable()
export class HtmlSanitizeService {
  sanitize(html: string): string {
    const s = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [...ALLOWED_TAGS],
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: true,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      /** Только http(s) для href/src (ТЗ). Без этого относительные URL удаляют атрибут; см. KEEP_CONTENT. */
      ALLOWED_URI_REGEXP: /^https?:\/\//i,
      /** По умолчанию true: при удалении небезопасного тега (например `<a>` с невалидным href) текст внутри сохраняется. */
      KEEP_CONTENT: true,
      RETURN_TRUSTED_TYPE: false,
    })
    return typeof s === "string" ? s : String(s)
  }
}
