import type { InjectionKey, Ref } from 'vue'

/**
 * The path of the document a docs page is rendering, as the docs API returns it
 * (`/docs/dev/components/index.zh`). The page provides it; `ProseA` resolves an author's
 * relative content link (`./installation.zh.mdc`) against it, since such a link is relative
 * to the source file rather than to the URL.
 */
export const DOCS_SOURCE_PATH_KEY: InjectionKey<Readonly<Ref<string | null>>> = Symbol('docs-source-path')
