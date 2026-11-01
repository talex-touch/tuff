import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createOmpIsolation } from './omp-isolation'

describe('createOmpIsolation', () => {
  let source: string

  beforeEach(async () => {
    source = await mkdtemp(join(tmpdir(), 'omp-src-'))
    for (const [name, body] of Object.entries({
      'agent.db': 'login',
      'models.yml': 'providers: {}',
      'config.yml': 'memory:\n  backend: mnemopi\n',
      'AGENTS.md': 'call the user 老板',
      'ENVIRONMENT.md': 'machine notes'
    })) {
      await writeFile(join(source, name), body)
    }
  })

  afterEach(async () => {
    await rm(source, { recursive: true, force: true })
  })

  it('shares the login and model catalogue but never the user persona files', async () => {
    const isolation = await createOmpIsolation(source)
    try {
      const agentDir = isolation.env.PI_CODING_AGENT_DIR
      expect(agentDir).not.toBe(source)
      expect(lstatSync(join(agentDir, 'agent.db')).isSymbolicLink()).toBe(true)
      expect(readFileSync(join(agentDir, 'models.yml'), 'utf8')).toBe('providers: {}')
      expect(existsSync(join(agentDir, 'AGENTS.md'))).toBe(false)
      expect(existsSync(join(agentDir, 'ENVIRONMENT.md'))).toBe(false)
      expect(readFileSync(isolation.configOverlayPath, 'utf8')).toContain('backend: "off"')
    } finally {
      await isolation.dispose()
    }
  })

  it('removes only its own directory on dispose and leaves the source untouched', async () => {
    const isolation = await createOmpIsolation(source)
    const agentDir = isolation.env.PI_CODING_AGENT_DIR
    await isolation.dispose()
    expect(existsSync(agentDir)).toBe(false)
    expect(readFileSync(join(source, 'agent.db'), 'utf8')).toBe('login')
    expect(readFileSync(join(source, 'AGENTS.md'), 'utf8')).toBe('call the user 老板')
  })
})
