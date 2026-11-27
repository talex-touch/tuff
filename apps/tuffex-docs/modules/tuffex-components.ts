import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { addComponent, addPluginTemplate, defineNuxtModule } from 'nuxt/kit'
import { isTuffexSourceRequested } from '../build/tuffex-dev-mode'

const COMPONENTS_SRC = fileURLToPath(
  new URL('../../../packages/tuffex/packages/components/src', import.meta.url),
)

const COMPONENT_NAME = /^(?:Tx|Tuff)[A-Z][A-Za-z0-9]*$/
const AGGREGATE_DIRECTORIES = new Set(['ai', 'base', 'pro', 'utils'])

function readBarrelExports(barrel: string, followStar = true): string[] {
  let source: string
  try {
    source = readFileSync(barrel, 'utf8')
  }
  catch {
    return []
  }

  const names = new Set<string>()

  for (const declaration of source.matchAll(/export\s+(?:const|let|var)\s+((?:Tx|Tuff)[A-Z][A-Za-z0-9]*)\b/g)) {
    if (declaration[1])
      names.add(declaration[1])
  }

  for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const entry of (block[1] ?? '').split(',')) {
      const trimmed = entry.trim()
      if (!trimmed || trimmed.startsWith('type '))
        continue
      const name = (trimmed.split(/\s+as\s+/).pop() ?? '').trim()
      if (COMPONENT_NAME.test(name))
        names.add(name)
    }
  }

  if (followStar) {
    for (const star of source.matchAll(/export\s+\*\s+from\s+['"](\.[^'"]*)['"]/g)) {
      const target = join(barrel, '..', star[1] ?? '')
      for (const name of [
        ...readBarrelExports(`${target}.ts`, false),
        ...readBarrelExports(join(target, 'index.ts'), false),
      ]) {
        names.add(name)
      }
    }
  }

  return [...names]
}

export default defineNuxtModule({
  meta: { name: 'tuffex-components' },
  setup(_options, nuxt) {
    const useTuffexSource = isTuffexSourceRequested(
      nuxt.options.dev === true && process.env.NODE_ENV !== 'test',
      process.env,
    )
    const componentSpecifierPrefix = useTuffexSource ? '@tuffex-components' : '@talex-touch/tuffex'
    const directories = readdirSync(COMPONENTS_SRC).filter((entry) => {
      if (AGGREGATE_DIRECTORIES.has(entry))
        return false
      const barrel = join(COMPONENTS_SRC, entry, 'index.ts')
      try {
        return statSync(barrel).isFile()
      }
      catch {
        return false
      }
    })

    const claimed = new Map<string, string>()
    const collisions: string[] = []

    for (const directory of directories.sort()) {
      for (const name of readBarrelExports(join(COMPONENTS_SRC, directory, 'index.ts'))) {
        const owner = claimed.get(name)
        if (owner) {
          collisions.push(`${name}: ${owner} and ${directory}`)
          continue
        }
        claimed.set(name, directory)

        addComponent({
          name,
          filePath: `${componentSpecifierPrefix}/${directory}`,
          export: name,
        })
      }
    }

    if (collisions.length) {
      throw new Error(
        `[tuffex-components] duplicate component exports across barrels:\n  ${collisions.join('\n  ')}`,
      )
    }

    // Dynamically import UnoCSS `icons` and `demo-icons` layers after Suspense resolves so
    // ~190 KiB of inline SVG Carbon/Logos rules are split out of render-blocking `entry.css`.
    // The `[class^="i-"],[class*=" i-"]{width:1.2em;height:1.2em}` preflight in `uno.config.ts`
    // reserves glyph dimensions on SSR byte 1 with zero CLS.
    addPluginTemplate({
      filename: 'tuffex-unocss-icons.client.mjs',
      mode: 'client',
      getContents: () => `
import { defineNuxtPlugin } from '#app'

export default defineNuxtPlugin((nuxtApp) => {
  let loaded = false
  const loadIconLayers = () => {
    if (loaded)
      return
    loaded = true
    void import('uno:icons.css')
    void import('uno:demo-icons.css')
  }

  nuxtApp.hook('app:suspense:resolve', () => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(loadIconLayers, { timeout: 250 })
    }
    else {
      setTimeout(loadIconLayers, 0)
    }
  })
})
`,
    })
  },
})
