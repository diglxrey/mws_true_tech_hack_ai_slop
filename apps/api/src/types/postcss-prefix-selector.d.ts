declare module "postcss-prefix-selector" {
  import type { Plugin } from "postcss"

  interface PostcssPrefixSelectorOptions {
    prefix?: string
    transform?: (prefix: string, selector: string, prefixedSelector: string) => string
  }

  function postcssPrefixSelector(options?: PostcssPrefixSelectorOptions): Plugin

  export = postcssPrefixSelector
}
