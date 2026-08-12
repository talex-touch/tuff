/**
 * Builds only the main process, for jobs that need out/main artifacts and nothing else.
 *
 * Derived from the real config rather than restating it: `main` is taken straight from
 * electron.vite.config.ts, so a change there is picked up here and the two cannot drift.
 * The renderer half is what pulls in tuffex's dist and most of the build time, and a job that
 * only needs the plugin SQLite worker has no use for it.
 */
import { defineConfig } from 'electron-vite'
import full from './electron.vite.config'

const resolved = typeof full === 'function' ? full({ command: 'build', mode: 'production' }) : full

export default defineConfig({ main: (resolved as { main: unknown }).main as never })
