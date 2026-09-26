import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { planProviderReasoning, withReasoningPlan } from '../reasoning-effort-runtime'
import { PiCliProvider } from './pi-cli-provider'
import {
  buildOmpArgs,
  buildPiArgs,
  CLAUDE_CLI_ORIGIN,
  CLAUDE_CLI_PROVIDER_ID,
  cliReasoningLevel,
  CODEX_CLI_ORIGIN,
  CODEX_CLI_PROVIDER_ID,
  OMP_CLI_ORIGIN,
  OMP_CLI_PROVIDER_ID,
  PI_CLI_ORIGIN,
  PI_CLI_PROVIDER_ID,
  resetAllCliExecutableCaches
} from './pi-cli-runtime'

const prompt = { systemPrompt: 'sys', prompt: 'hi' }

describe('buildPiArgs --thinking', () => {
  it('adds the planned level and nothing on auto', () => {
    expect(buildPiArgs(prompt, 'codex/gpt-5.5', undefined, [], 'high')).toEqual([
      ...buildPiArgs(prompt, 'codex/gpt-5.5').slice(0, -1),
      '--thinking',
      'high',
      'hi'
    ])
    // Auto keeps the argv byte-for-byte: pi then uses the user's own defaultThinkingLevel.
    expect(buildPiArgs(prompt, 'codex/gpt-5.5', undefined, [], undefined)).toEqual(
      buildPiArgs(prompt, 'codex/gpt-5.5')
    )
    expect(buildPiArgs(prompt)).not.toContain('--thinking')
  })
})

describe('buildOmpArgs --thinking', () => {
  it('keeps the long-standing off on auto and swaps in the planned level otherwise', () => {
    const auto = buildOmpArgs(prompt, 'openai/gpt-5.5')
    expect(auto.slice(auto.indexOf('--thinking'), auto.indexOf('--thinking') + 2)).toEqual([
      '--thinking',
      'off'
    ])
    const planned = buildOmpArgs(prompt, 'openai/gpt-5.5', [], 'max')
    expect(planned).toEqual(auto.map((arg) => (arg === 'off' ? 'max' : arg)))
    // omp is not pi: its isolation flag is `--no-rules`, never pi's `--no-context-files`.
    expect(planned).toContain('--no-rules')
    expect(planned).not.toContain('--no-context-files')
  })
})

describe('cliReasoningLevel', () => {
  it("answers only for the plan's own wire", () => {
    const codex: IntelligenceProviderConfig = {
      id: CODEX_CLI_PROVIDER_ID,
      type: IntelligenceProviderType.LOCAL,
      name: 'Codex',
      enabled: true
    }
    const plan = planProviderReasoning({ reasoningEffort: 'max' }, codex, 'gpt-5.5')
    expect(cliReasoningLevel(plan, 'codex-config')).toBe('xhigh')
    expect(cliReasoningLevel(plan, 'cli-thinking')).toBeUndefined()
    expect(cliReasoningLevel(undefined, 'codex-config')).toBeUndefined()
    const unsupported = planProviderReasoning({ reasoningEffort: 'high' }, codex, 'gpt-4o')
    expect(cliReasoningLevel(unsupported, 'codex-config')).toBeUndefined()
  })
})

/**
 * The same through the provider itself, against stubs that record the argv they were spawned with
 * and then answer in their CLI's own protocol — so what is asserted is what would have been run.
 */
describe('PiCliProvider argv under a reasoning plan', () => {
  let workDir: string
  let argvFile: string

  const ANSWERS = {
    pi: [
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'ok' } },
      { type: 'agent_settled' }
    ],
    codex: [
      { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'ok' } },
      { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }
    ],
    claude: [
      {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } }
      },
      { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
    ]
  }

  async function writeStub(env: string, lines: unknown[]): Promise<void> {
    const stub = join(workDir, `${env}.js`)
    await writeFile(
      stub,
      [
        '#!/usr/bin/env node',
        `require('node:fs').writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)))`,
        ...lines.map(
          (line) => `process.stdout.write(${JSON.stringify(`${JSON.stringify(line)}\n`)})`
        )
      ].join('\n'),
      'utf8'
    )
    await chmod(stub, 0o755)
    process.env[env] = stub
    resetAllCliExecutableCaches()
  }

  async function run(
    config: IntelligenceProviderConfig,
    model: string,
    reasoningEffort?: 'low' | 'medium' | 'high' | 'max'
  ): Promise<string[]> {
    const options = { modelPreference: [model], ...(reasoningEffort ? { reasoningEffort } : {}) }
    const planned = withReasoningPlan(options, planProviderReasoning(options, config, model))
    for await (const _chunk of new PiCliProvider(config).chatStream(
      { messages: [{ role: 'user', content: 'hi' }] },
      planned
    )) {
      void _chunk
    }
    return JSON.parse(await readFile(argvFile, 'utf8')) as string[]
  }

  function cli(id: string, origin: string): IntelligenceProviderConfig {
    return {
      id,
      type: IntelligenceProviderType.LOCAL,
      name: id,
      enabled: true,
      models: [],
      capabilities: ['text.chat'],
      metadata: { origin }
    }
  }

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'cli-reasoning-'))
    argvFile = join(workDir, 'argv.json')
  })

  afterEach(async () => {
    for (const env of [
      'TUFF_PI_CLI_PATH',
      'TUFF_OMP_CLI_PATH',
      'TUFF_CODEX_CLI_PATH',
      'TUFF_CLAUDE_CLI_PATH'
    ]) {
      delete process.env[env]
    }
    resetAllCliExecutableCaches()
    await rm(workDir, { recursive: true, force: true })
  })

  it('pi: --thinking with the level asked for', async () => {
    await writeStub('TUFF_PI_CLI_PATH', ANSWERS.pi)
    const argv = await run(cli(PI_CLI_PROVIDER_ID, PI_CLI_ORIGIN), 'openai/gpt-5.5', 'max')
    expect(argv.slice(argv.indexOf('--thinking'), argv.indexOf('--thinking') + 2)).toEqual([
      '--thinking',
      'max'
    ])

    const auto = await run(cli(PI_CLI_PROVIDER_ID, PI_CLI_ORIGIN), 'openai/gpt-5.5')
    expect(auto).not.toContain('--thinking')
  })

  it('omp: the planned level replaces off', async () => {
    await writeStub('TUFF_OMP_CLI_PATH', ANSWERS.pi)
    const argv = await run(cli(OMP_CLI_PROVIDER_ID, OMP_CLI_ORIGIN), 'openai/gpt-5.5', 'low')
    expect(argv.slice(argv.indexOf('--thinking'), argv.indexOf('--thinking') + 2)).toEqual([
      '--thinking',
      'low'
    ])
    const auto = await run(cli(OMP_CLI_PROVIDER_ID, OMP_CLI_ORIGIN), 'openai/gpt-5.5')
    expect(auto.slice(auto.indexOf('--thinking'), auto.indexOf('--thinking') + 2)).toEqual([
      '--thinking',
      'off'
    ])
  })

  it("codex: a -c override with the model's strongest level for 极高, never ultra", async () => {
    await writeStub('TUFF_CODEX_CLI_PATH', ANSWERS.codex)
    const argv = await run(cli(CODEX_CLI_PROVIDER_ID, CODEX_CLI_ORIGIN), 'gpt-5.6-sol', 'max')
    expect(argv).toContain('model_reasoning_effort="max"')
    expect(argv[argv.indexOf('model_reasoning_effort="max"') - 1]).toBe('-c')

    const xhigh = await run(cli(CODEX_CLI_PROVIDER_ID, CODEX_CLI_ORIGIN), 'gpt-5.5', 'max')
    expect(xhigh).toContain('model_reasoning_effort="xhigh"')

    // A model that takes no effort, and auto, leave the user's own config.toml in charge.
    for (const argvWithout of [
      await run(cli(CODEX_CLI_PROVIDER_ID, CODEX_CLI_ORIGIN), 'gpt-4o', 'high'),
      await run(cli(CODEX_CLI_PROVIDER_ID, CODEX_CLI_ORIGIN), 'gpt-5.5')
    ]) {
      expect(argvWithout.some((arg) => arg.startsWith('model_reasoning_effort'))).toBe(false)
    }
  })

  it('claude: --effort, rounded to high for the budget-thinking haiku', async () => {
    await writeStub('TUFF_CLAUDE_CLI_PATH', ANSWERS.claude)
    const opus = await run(cli(CLAUDE_CLI_PROVIDER_ID, CLAUDE_CLI_ORIGIN), 'opus', 'max')
    expect(opus.slice(opus.indexOf('--effort'), opus.indexOf('--effort') + 2)).toEqual([
      '--effort',
      'max'
    ])
    const haiku = await run(cli(CLAUDE_CLI_PROVIDER_ID, CLAUDE_CLI_ORIGIN), 'haiku', 'max')
    expect(haiku.slice(haiku.indexOf('--effort'), haiku.indexOf('--effort') + 2)).toEqual([
      '--effort',
      'high'
    ])
    const auto = await run(cli(CLAUDE_CLI_PROVIDER_ID, CLAUDE_CLI_ORIGIN), 'opus')
    expect(auto).not.toContain('--effort')
  })

  it('runs every CLI on auto with exactly the argv it had before the setting existed', async () => {
    // Whole vectors, written out from the pre-setting argv builders: "the new flag is absent" alone
    // would not catch auto adding, dropping or reordering anything else. Only the dated system
    // prompt and codex's temporary isolation root vary between runs.
    const systemPrompt = expect.any(String)

    await writeStub('TUFF_PI_CLI_PATH', ANSWERS.pi)
    expect(await run(cli(PI_CLI_PROVIDER_ID, PI_CLI_ORIGIN), 'openai/gpt-5.5')).toEqual([
      '--print',
      '--mode',
      'json',
      '--no-tools',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--no-context-files',
      '--system-prompt',
      systemPrompt,
      '--model',
      'openai/gpt-5.5',
      'hi'
    ])

    await writeStub('TUFF_OMP_CLI_PATH', ANSWERS.pi)
    expect(await run(cli(OMP_CLI_PROVIDER_ID, OMP_CLI_ORIGIN), 'openai/gpt-5.5')).toEqual([
      '--print',
      '--mode',
      'json',
      '--no-tools',
      '--no-extensions',
      '--no-skills',
      '--no-rules',
      '--no-session',
      '--thinking',
      'off',
      '--system-prompt',
      systemPrompt,
      '--model',
      'openai/gpt-5.5',
      'hi'
    ])

    await writeStub('TUFF_CODEX_CLI_PATH', ANSWERS.codex)
    expect(await run(cli(CODEX_CLI_PROVIDER_ID, CODEX_CLI_ORIGIN), 'gpt-5.5')).toEqual([
      'exec',
      '--json',
      '--ephemeral',
      '--skip-git-repo-check',
      '--ignore-rules',
      '-s',
      'read-only',
      '-C',
      expect.any(String),
      '--color',
      'never',
      '-c',
      'mcp_servers={}',
      '-m',
      'gpt-5.5',
      expect.stringMatching(/\n\n---\n\nhi$/)
    ])

    await writeStub('TUFF_CLAUDE_CLI_PATH', ANSWERS.claude)
    expect(await run(cli(CLAUDE_CLI_PROVIDER_ID, CLAUDE_CLI_ORIGIN), 'opus')).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--tools',
      '',
      '--disable-slash-commands',
      '--no-chrome',
      '--system-prompt',
      systemPrompt,
      '--model',
      'opus',
      'hi'
    ])
  })
})
