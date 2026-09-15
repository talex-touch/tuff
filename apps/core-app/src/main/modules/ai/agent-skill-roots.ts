/**
 * Where the AI agents people run keep their skills.
 *
 * Tuff reads these directories in place — nothing is copied, an edit lands on the next turn — so a
 * skill someone already keeps for Codex or Claude Code is usable without an import step. cc-switch
 * is in the table for the same reason as the rest: it owns `~/.cc-switch/skills` and links entries
 * into several agent directories, which makes its library the largest one on most machines.
 *
 * Home-scoped only. A project's `.claude/skills` belongs to that repository, and a home conversation
 * has no workspace open, so linking those here would advertise skills the session cannot reach.
 *
 * The table is a claim about other tools' layouts, not a promise they are installed: every entry is
 * filtered by existence before use, so an absent agent simply contributes nothing.
 */

import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { stat } from 'node:fs/promises'

export interface AgentSkillRoot {
  /** The agent this directory belongs to. Display names are the renderer's business. */
  id: string
  /** Absolute directory that holds `<skill>/SKILL.md` entries. */
  path: string
}

interface AgentSkillRootSpec {
  id: string
  /** Segments under the home directory. */
  segments: readonly string[]
  /** Environment variable that relocates the agent's home, honored when absolute. */
  envVar?: string
}

/**
 * Deliberately the layout each agent documents for itself, not a guess: these are the same
 * directories the platform table in `.agents/skills/trellis-meta` writes into per platform.
 */
const AGENT_SKILL_ROOT_SPECS: readonly AgentSkillRootSpec[] = [
  { id: 'codex', segments: ['.codex', 'skills'], envVar: 'CODEX_HOME' },
  { id: 'claude', segments: ['.claude', 'skills'] },
  { id: 'cc-switch', segments: ['.cc-switch', 'skills'] },
  // The shared layer: Codex, Gemini CLI and their peers read it in addition to their own.
  { id: 'agents', segments: ['.agents', 'skills'] },
  { id: 'oh-my-pi', segments: ['.omp', 'agent', 'skills'] },
  { id: 'pi', segments: ['.pi', 'agent', 'skills'] },
  { id: 'opencode', segments: ['.config', 'opencode', 'skills'] },
  { id: 'cursor', segments: ['.cursor', 'skills'] },
  { id: 'gemini', segments: ['.gemini', 'skills'] },
  { id: 'kiro', segments: ['.kiro', 'skills'] },
  { id: 'qoder', segments: ['.qoder', 'skills'] },
  { id: 'codebuddy', segments: ['.codebuddy', 'skills'] },
  { id: 'factory', segments: ['.factory', 'skills'] },
  { id: 'reasonix', segments: ['.reasonix', 'skills'] },
  { id: 'kilocode', segments: ['.kilocode', 'skills'] },
  { id: 'devin', segments: ['.devin', 'skills'] }
]

/**
 * One root per agent, in table order. The `envVar` override replaces the agent's own home rather
 * than its skill directory, matching how those CLIs read the variable themselves.
 */
export function agentSkillRoots(
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env
): AgentSkillRoot[] {
  const roots: AgentSkillRoot[] = []
  const seen = new Set<string>()
  for (const spec of AGENT_SKILL_ROOT_SPECS) {
    const override = spec.envVar ? env[spec.envVar]?.trim() : undefined
    const path =
      override && isAbsolute(override) ? join(override, 'skills') : join(home, ...spec.segments)
    if (seen.has(path)) continue
    seen.add(path)
    roots.push({ id: spec.id, path })
  }
  return roots
}

/**
 * The subset of {@link agentSkillRoots} that exists on this machine. Agents not installed are simply
 * not in the answer, which is what lets the caller treat every returned root as a real library.
 */
export async function existingAgentSkillRoots(
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentSkillRoot[]> {
  const present: AgentSkillRoot[] = []
  for (const root of agentSkillRoots(home, env)) {
    const info = await stat(root.path).catch(() => null)
    if (info?.isDirectory()) present.push(root)
  }
  return present
}
