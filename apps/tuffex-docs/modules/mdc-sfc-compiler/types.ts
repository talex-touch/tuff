export interface MdcTocLink {
  id: string
  text: string
  depth: number
  children?: MdcTocLink[]
}

export interface MdcToc {
  title: string
  searchDepth: number
  depth: number
  links: MdcTocLink[]
}

export interface MdcComponentImportResolution {
  /** Import specifier (absolute file path or Vite alias) for the Vue component. */
  path: string
  /** Optional named export (uses default export when omitted or `'default'`). */
  export?: string
}

export type MdcComponentImportResolver = (pascalTagName: string) => MdcComponentImportResolution | null

export interface MdcPluginEntry {
  instance: unknown
  options?: Record<string, unknown>
}

export interface MdcMetaContext {
  filePath?: string
  frontmatter: Record<string, unknown>
  toc: MdcToc
  demoNames: string[]
  hasMath: boolean
  hasMermaid: boolean
}

export interface CompileMdcToSfcOptions<TMeta = Record<string, unknown>> {
  /** Absolute path to the `.mdc` file (used for diagnostics and `buildMeta`). */
  filePath?: string
  /**
   * Optional base URL prefix (e.g. `'/tuffex'`) prepended to static internal doc links
   * matching `internalLinkPattern`. Defaults to `''` (no prefixing).
   */
  baseURL?: string
  /**
   * Pattern identifying internal doc links that should receive `baseURL` prefixing.
   * Defaults to `/^\/(en|zh)(?:\/|$|\?|#)/i`.
   */
  internalLinkPattern?: RegExp
  /** Class placed on the compiled SFC's single root `<div>` element. Defaults to `'mdc-sfc-doc'`. */
  rootClass?: string
  /**
   * Optional resolver mapping PascalCase dynamic MDC component names to explicit ES imports
   * inside `<script setup lang="ts">`. When omitted or returning `null`, Vue resolves the tag
   * via standard component registration / auto-import.
   */
  resolveComponentImport?: MdcComponentImportResolver
  /**
   * Optional metadata builder producing the exported `docMeta` object for this document.
   * Defaults to returning `{ ...frontmatter, toc, demoNames, hasMath, hasMermaid }`.
   */
  buildMeta?: (ctx: MdcMetaContext) => TMeta
  /** Additional remark plugins appended AFTER `remark-mdc` and `remark-gfm`. */
  remarkPlugins?: Record<string, MdcPluginEntry | false>
  /** Additional rehype plugins appended AFTER `rehype-raw`. */
  rehypePlugins?: Record<string, MdcPluginEntry | false>
  /** Maximum heading depth extracted into `toc.links` (defaults to `4`). */
  tocDepth?: number
}

export interface CompiledMdcSfcResult<TMeta = Record<string, unknown>> {
  /** Valid Vue 3 SFC source (`<script lang="ts">`, optional `<script setup>`, `<template>`, optional `<style>`). */
  sfc: string
  /** Metadata object identical to the SFC's exported `docMeta`. */
  meta: TMeta
  /** PascalCase dynamic component names rendered in `<template>`. */
  usedComponents: string[]
  /** Extracted `demo` prop names from `TuffDemoWrapper` / `TuffDemo`. */
  demoNames: string[]
  /** True when the compiled body contains KaTeX math markup. */
  hasMath: boolean
  /** True when the compiled body contains Mermaid diagram containers. */
  hasMermaid: boolean
}

export interface MdcDocRouteEntry {
  /** Canonical lookup key (e.g. `'en:'`, `'en:button'`, `'zh:concepts/curvature'`). */
  key: string
  /** Absolute filesystem path to the `.mdc` file. */
  filePath: string
}

export interface MdcVuePluginOptions<TMeta = Record<string, unknown>> {
  /** Absolute directory containing `.mdc` documents. */
  contentDir: string
  /** Virtual module id for the generated lazy route table (e.g. `'virtual:tuffex-doc-pages'`). */
  virtualIndexId: string
  /** Discover all `.mdc` route entries inside `contentDir`. */
  discoverRoutes: (contentDir: string) => MdcDocRouteEntry[]
  /**
   * Emit the virtual index module source code from discovered route entries.
   * Receives the resolved entries so each app can expose its exact typed API.
   */
  generateVirtualIndexCode: (entries: MdcDocRouteEntry[]) => string
  /** Build compiler options for a given `.mdc` file path. */
  getCompileOptions: (filePath: string) => CompileMdcToSfcOptions<TMeta>
  /**
   * Optional cache revision string (e.g. hash of component map) so stale entries
   * are invalidated if component import mappings change.
   */
  getCacheKeySalt?: () => string
}
