import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
// `nuxt/kit`, not `@nuxt/kit`: the latter is only a transitive dependency here,
// so its types do not resolve without adding a direct dependency.
import { addComponent, defineNuxtModule } from 'nuxt/kit'

/**
 * Registers every tuffex component with Nuxt's own component system.
 *
 * This replaces a hand-written plugin that called `app.component()` for a
 * literal list of names. That list was maintained by hand and drifted: sixteen
 * components were used by shipped demos but had never been added to it, so
 * those doc pages rendered unresolved components with nothing but a console
 * warning to show for it. A list derived from the barrels cannot drift — a new
 * component is registered the moment it is exported.
 *
 * Going through `addComponent` also hands laziness, chunking and template
 * resolution back to Nuxt, and means a route that references no tuffex
 * component pulls no tuffex chunk. The plugin, by contrast, ran on every route.
 */

const COMPONENTS_SRC = fileURLToPath(
  new URL('../../../packages/tuffex/packages/components/src', import.meta.url),
)

/** Components are exported as `TxFoo` / `TuffFoo`; everything else is a type, a key or a helper. */
const COMPONENT_NAME = /^(?:Tx|Tuff)[A-Z][A-Za-z0-9]*$/

/**
 * Suite and utility aggregates, not component directories. They re-export the
 * real barrels wholesale, so walking them would register every component a
 * second time under the same name and trip the collision check below.
 */
const AGGREGATE_DIRECTORIES = new Set(['ai', 'base', 'pro', 'utils'])

/**
 * Reads the component names a barrel exports, following `export * from './x'`
 * one hop: three component barrels (breadcrumb, pagination, steps) are a bare
 * star re-export of `./src`, and reading only the top file would silently miss
 * them — which is the same failure mode as the hand-written list this module
 * replaces.
 *
 * Deliberately textual. Importing the barrel would pull Vue SFCs into the
 * config context, and these files are flat re-exports with no logic to run.
 */
function readBarrelExports(barrel: string, followStar = true): string[] {
  let source: string
  try {
    source = readFileSync(barrel, 'utf8')
  }
  catch {
    return []
  }

  const names = new Set<string>()

  for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const entry of (block[1] ?? '').split(',')) {
      const trimmed = entry.trim()
      // `export type { X }` and `export { type X }` are both type-only.
      if (!trimmed || trimmed.startsWith('type '))
        continue
      // `A as B` registers under B, which is what consumers write.
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
  setup() {
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

    /** name -> directory, so a collision can name both sides. */
    const claimed = new Map<string, string>()
    const collisions: string[] = []

    for (const directory of directories.sort()) {
      for (const name of readBarrelExports(join(COMPONENTS_SRC, directory, 'index.ts'))) {
        const owner = claimed.get(name)
        if (owner) {
          // Two barrels exporting one name is ambiguous, and picking a winner
          // silently is how a component starts rendering as something else.
          collisions.push(`${name}: ${owner} and ${directory}`)
          continue
        }
        claimed.set(name, directory)

        addComponent({
          name,
          // Always the source alias — it is the one specifier that resolves the
          // same way in dev and in a production build.
          filePath: `@tuffex-components/${directory}`,
          export: name,
        })
      }
    }

    if (collisions.length) {
      throw new Error(
        `[tuffex-components] duplicate component exports across barrels:\n  ${collisions.join('\n  ')}`,
      )
    }
  },
})
