import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * What a headless `omp` run may share with the user's own `~/.omp/agent`: the login, the model
 * catalogue and the settings. Everything else in that directory is the user's persona and is
 * deliberately left out - `AGENTS.md` (how to address them), `ENVIRONMENT.md`, `memories/`,
 * `skills/`, `extensions/`.
 *
 * `--no-rules` only covers `.omp/rules/`; it does not stop omp from loading the user-level
 * `AGENTS.md` into the system prompt, so without this a Tuff coordinator answered in the user's
 * personal voice and rules. Entries are symlinks so a refreshed token or an edited model list is
 * seen by the run, and a token the run refreshes is written back to the real file.
 */
const SHARED_ENTRIES = [
  'agent.db',
  'models.db',
  'models.yml',
  'models.yaml',
  'models.json',
  'config.yml'
] as const

/**
 * Applied on top of the shared `config.yml` for this run only. The memory backend injects recalled
 * memories (and a memory tool prompt) into the system prompt, which is another route for the
 * user's own conversations into a run that must answer from its own prompt alone.
 */
const OVERLAY = 'memory:\n  backend: "off"\n'

export interface OmpIsolation {
  /** Environment for the child: points omp at the isolated agent directory. */
  env: Record<string, string>
  /** Path for omp's `--config` overlay flag. */
  configOverlayPath: string
  /** Removes the throwaway directory. Never throws; the real agent directory is never touched. */
  dispose: () => Promise<void>
}

export function resolveOmpAgentSourceDir(): string {
  return (
    process.env.TUFF_OMP_AGENT_DIR ||
    process.env.PI_CODING_AGENT_DIR ||
    join(homedir(), '.omp', 'agent')
  )
}

export async function createOmpIsolation(
  sourceDir: string = resolveOmpAgentSourceDir()
): Promise<OmpIsolation> {
  const root = await mkdtemp(join(tmpdir(), 'tuff-omp-'))
  const dispose = () => rm(root, { recursive: true, force: true }).catch(() => undefined)
  try {
    const agentDir = join(root, 'agent')
    await mkdir(agentDir, { recursive: true })
    for (const name of SHARED_ENTRIES) {
      const source = join(sourceDir, name)
      if (existsSync(source)) await symlink(source, join(agentDir, name))
    }
    const configOverlayPath = join(root, 'overlay.yml')
    await writeFile(configOverlayPath, OVERLAY, 'utf8')
    return { env: { PI_CODING_AGENT_DIR: agentDir }, configOverlayPath, dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}
