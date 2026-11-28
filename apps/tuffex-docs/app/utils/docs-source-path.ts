import type { ComputedRef, InjectionKey } from 'vue'

export const DOCS_SOURCE_PATH_KEY: InjectionKey<ComputedRef<string | null>> = Symbol('tuffex-docs-source-path')
