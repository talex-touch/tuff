import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Each activated demo has a tiny entry; the browser never downloads the full registry. */
export function nexusDemoLoadersPlugin(nexusRoot: string, loaderBase: string): Plugin {
  const prefix = '\0nexus-demo-loader:'
  const entries: Record<string, string> = {}
  const demoChunks: Record<string, string> = {}
  let clientBuild = false

  return {
    name: 'nexus-demo-loaders',
    apply: 'build',
    configResolved(config) {
      clientBuild = !config.build.ssr
    },
    buildStart() {
      if (!clientBuild)
        return
      const registryDir = resolve(nexusRoot, 'app/components/content')
      const source = readFileSync(resolve(registryDir, 'demo-registry.ts'), 'utf8')
      const pattern = /^\s+([A-Za-z]\w*):\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/gm
      for (const match of source.matchAll(pattern)) {
        const name = match[1]!
        entries[name] = resolve(registryDir, match[2]!)
        demoChunks[entries[name]!] = `demo-${name}`
        this.emitFile({
          type: 'chunk',
          id: `${prefix}${name}.js`,
          fileName: `${loaderBase.replace(/^\/+/, '')}${name}.js`,
          preserveSignature: 'strict',
        })
      }
    },
    outputOptions(options) {
      if (!clientBuild)
        return null
      return {
        ...options,
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          // Keep Demo implementations out of shared dependency chunks, even when
          // Rollup merges small automatic chunks into frequently used components.
          return demoChunks[id.split('?')[0] ?? id]
        },
      }
    },
    generateBundle(_options, bundle) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName]
        if (chunk?.type !== 'chunk' || !chunk.facadeModuleId?.startsWith(prefix))
          continue
        // These are runtime-selected imports, not application startup entries.
        // Nuxt's manifest must not put every emitted loader in the HTML script list.
        chunk.isEntry = false
        chunk.isDynamicEntry = true
      }
    },
    resolveId(id) {
      return id.startsWith(prefix) ? id : null
    },
    load(id) {
      if (!id.startsWith(prefix))
        return null
      const name = id.slice(prefix.length, -3)
      const entry = entries[name]
      if (!entry)
        throw new Error(`Unknown Nexus demo entry: ${name}`)
      // Vite handles the dynamic import and its CSS preloads as one dependency boundary.
      return `export default () => import(${JSON.stringify(entry)});`
    },
  }
}
