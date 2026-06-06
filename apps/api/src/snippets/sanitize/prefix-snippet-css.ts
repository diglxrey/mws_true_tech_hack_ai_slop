import postcss from "postcss"
import prefixSelector from "postcss-prefix-selector"

export async function prefixSnippetCss(css: string, slug: string): Promise<string> {
  const safeSlug = slug.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  const prefix = ` [data-sn-id="${safeSlug}"]`
  const result = await postcss([
    prefixSelector({
      prefix,
      transform(prefixStr: string, selector: string, prefixedSelector: string): string {
        if (selector.startsWith("@")) {
          return selector
        }
        return prefixedSelector
      },
    }),
  ]).process(css, { from: undefined })
  return result.css
}
