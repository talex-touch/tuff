import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import type { GenerateOptions, ScenarioClass, ScenarioPlan } from '../types'
import { describePlan, generatePlan, validatePlan } from './index'
import { CLASSES } from './plan'

const USAGE = `usage:
  main.ts generate --seed N --count N [--apps-file apps.json] [--mix class=weight,...] [--out plan.json]
  main.ts describe plan.json
  main.ts validate plan.json`

export interface Io {
  out: (text: string) => void
  err: (text: string) => void
}

function parseMix(text: string | undefined): Partial<Record<ScenarioClass, number>> | undefined {
  if (!text) return undefined
  const mix: Partial<Record<ScenarioClass, number>> = {}
  for (const pair of text.split(',')) {
    const [name, weight] = pair.split('=')
    if (!CLASSES.includes(name as ScenarioClass) || !Number.isFinite(Number(weight)))
      throw new Error(`bad --mix entry: ${pair}`)
    mix[name as ScenarioClass] = Number(weight)
  }
  return mix
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

function generate(args: string[], io: Io): number {
  const { values } = parseArgs({
    args,
    options: {
      seed: { type: 'string' },
      count: { type: 'string' },
      'apps-file': { type: 'string' },
      mix: { type: 'string' },
      out: { type: 'string' }
    }
  })
  const apps = values['apps-file'] ? readJson<string[]>(values['apps-file']) : []
  if (!Array.isArray(apps) || apps.some((app) => typeof app !== 'string'))
    throw new Error('--apps-file must hold a JSON array of strings')
  const mix = parseMix(values.mix)
  const options: GenerateOptions = {
    seed: Number(values.seed),
    count: Number(values.count),
    apps,
    ...(mix ? { mix } : {})
  }
  const plan = generatePlan(options)
  const json = JSON.stringify(plan)
  if (values.out) writeFileSync(values.out, json)
  else io.out(json)
  const bytes = plan.corpus.files.reduce((sum, file) => sum + file.payload.bytes, 0)
  io.err(
    `plan: ${plan.scenarios.length} scenarios, corpus ${plan.corpus.files.length} files / ${bytes} bytes, ${json.length} bytes of JSON`
  )
  return 0
}

/** Runs one CLI command; returns the process exit code. */
export function runCli(argv: string[], io: Io): number {
  const [command, ...rest] = argv
  try {
    if (command === 'generate') return generate(rest, io)
    if ((command === 'describe' || command === 'validate') && rest[0]) {
      const plan = readJson<ScenarioPlan>(rest[0])
      if (command === 'describe') {
        io.out(JSON.stringify(describePlan(plan), null, 2))
        return 0
      }
      const problems = validatePlan(plan)
      for (const problem of problems.slice(0, 50)) io.err(problem)
      io.out(problems.length === 0 ? 'valid' : `${problems.length} problems`)
      return problems.length === 0 ? 0 : 1
    }
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error))
    return 2
  }
  io.err(USAGE)
  return 2
}

if (process.argv[1]?.endsWith('gen/main.ts')) {
  process.exitCode = runCli(process.argv.slice(2), {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`)
  })
}
