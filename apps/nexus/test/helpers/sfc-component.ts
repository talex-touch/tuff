import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileScript, parse } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import type { Component } from 'vue'

/**
 * Compiles a Nexus SFC — `<script setup>` with its template inlined — and runs it
 * against modules the test supplies.
 *
 * apps/nexus has no `@vitejs/plugin-vue`, `@vue/test-utils` or DOM environment,
 * so a `.vue` file cannot be imported in a test. This compiles it with the
 * `@vue/compiler-sfc` the package already declares and evaluates the result as
 * CommonJS, resolving every `import` from `modules` (the test imports those
 * through vitest, so they are the same instances its own `vue` uses). An import
 * the test did not supply fails loudly instead of rendering something else.
 * Nuxt auto-imports (`useI18n`, `useRoute`…) stay free identifiers: stub them with
 * `vi.stubGlobal`. Styles are ignored.
 *
 * Pair it with `vue/server-renderer` to assert on the markup a component renders.
 */

const NEXUS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export async function loadSfcComponent(relativePath: string, modules: Record<string, unknown>): Promise<Component> {
  const filename = path.join(NEXUS_ROOT, relativePath)
  const { descriptor, errors } = parse(readFileSync(filename, 'utf8'), { filename })
  if (errors.length)
    throw errors[0]

  const id = createHash('sha256').update(relativePath).digest('hex').slice(0, 8)
  const compiled = compileScript(descriptor, { id, inlineTemplate: true })
  const { code } = await transform(compiled.content, {
    loader: 'ts',
    format: 'cjs',
    target: 'es2022',
    sourcefile: relativePath,
  })

  const module = { exports: {} as Record<string, unknown> }
  const requireModule = (specifier: string) => {
    if (!(specifier in modules))
      throw new Error(`${relativePath} imports "${specifier}", which the test did not supply.`)
    // Marked as an ES module so esbuild's interop reads `default` and the named
    // exports straight off it instead of wrapping it.
    return { __esModule: true, ...(modules[specifier] as object) }
  }
  // eslint-disable-next-line no-new-func -- evaluating the compiled SFC is the point of this helper
  new Function('require', 'module', 'exports', code)(requireModule, module, module.exports)
  return (module.exports.default ?? module.exports) as Component
}
