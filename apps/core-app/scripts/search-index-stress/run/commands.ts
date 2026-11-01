import type { CommonOptions, ParsedArgs } from './args'
import { UsageError, USAGE } from './args'
import type { PlanDescription } from './deps'
import { describePlan } from './deps'
import { describeError, RunAbort, RunRefused } from './errors'
import { describeDiscovery, pickApps } from './installed-apps'
import { buildLayout, isValidRunId, resolveResumeTarget } from './layout'
import { formatPreflight, refusals } from './preflight'
import { runProbe } from './probe'
import { loadRunForReport } from './report-inputs'
import { writeJsonAtomic } from './run-meta'
import type { RunnerDeps } from './runner-deps'
import { runRun } from './runner'
import { estimatePlannedBytes } from './runner-setup'
import type { RunOutcome } from './runner-types'

export type ExitCode = 0 | 1 | 2 | 3

export interface CommandIo {
  out: (line: string) => void
  err: (line: string) => void
}

const mib = (bytes: number): string =>
  `${(bytes / 1024 ** 2).toFixed(bytes >= 10 * 1024 ** 2 ? 0 : 1)} MiB`
const counts = (record: Partial<Record<string, number>>): string =>
  Object.entries(record)
    .map(([name, count]) => `${name} ${count}`)
    .join(', ') || 'none'

/** 2 for anything the user can fix by changing the command or the machine, 1 for a run that ended early, 3 for a defect. */
export function exitCodeFor(error: unknown): ExitCode {
  if (error instanceof UsageError || error instanceof RunRefused) return 2
  if (error instanceof RunAbort) return 1
  return 3
}

export function describeFailure(error: unknown): string[] {
  if (error instanceof UsageError)
    return [`usage error: ${error.message}`, 'see "pnpm search:stress --help" for the options']
  if (error instanceof RunRefused)
    return error.reasons.length > 1
      ? ['refused:', ...error.reasons.map((reason) => `  - ${reason}`)]
      : [`refused: ${error.message}`]
  if (error instanceof RunAbort) return [`stopped: ${error.message}`]
  const stack =
    error instanceof Error && error.stack
      ? error.stack
          .split('\n')
          .slice(1, 7)
          .map((line) => line.trimEnd())
      : []
  return [`internal error: ${describeError(error)}`, ...stack]
}

export function formatPlanSummary(plan: PlanDescription): string[] {
  const classes = Object.entries(plan.classes).map(([name, { requested, actual }]) =>
    actual === requested ? `${name} ${actual}` : `${name} ${actual} (asked ${requested})`
  )
  const lines = [
    `plan: seed ${plan.seed}, ${plan.total} scenarios${plan.total === plan.count ? '' : ` (asked for ${plan.count})`}`,
    `classes: ${classes.join(', ')}`,
    plan.distinct.ids === plan.total && plan.distinct.tuples === plan.total
      ? `distinct: all ${plan.total} scenarios differ in id and in dimension values`
      : `distinct: NOT all different - ${plan.distinct.ids} ids and ${plan.distinct.tuples} dimension tuples among ${plan.total} scenarios`,
    `checks: present ${plan.checks.present.hard} hard / ${plan.checks.present.soft} soft, absent ${plan.checks.absent.hard} hard / ${plan.checks.absent.soft} soft`,
    `corpus: ${plan.corpus.directories} directories, ${plan.corpus.files} files, ${mib(plan.corpus.bytes)}`,
    `writes: ${mib(plan.writes.totalBytes)} in total, ${mib(plan.writes.maxScenarioBytes)} in the largest scenario`
  ]
  if (plan.shortfall.total > 0) {
    lines.push(
      `shortfall: ${plan.shortfall.total} scenarios could not be built as asked (short: ${counts(plan.shortfall.short)}; made up by: ${counts(plan.shortfall.reflowedInto)})`
    )
  }
  const uncovered = Object.entries(plan.uncovered)
  if (uncovered.length > 0)
    lines.push(
      `uncovered dimension values: ${uncovered.map(([dimension, values]) => `${dimension}: ${values.join(', ')}`).join('; ')}`
    )
  return lines
}

export function formatOutcome(outcome: RunOutcome): string[] {
  const headline = {
    pass: 'PASS',
    fail: 'FAIL',
    aborted: 'ABORTED',
    refused: 'REFUSED',
    error: 'ERROR'
  }[outcome.status]
  const lines = [
    `run ${outcome.runId}: ${headline}${outcome.abortReason ? ` (${outcome.abortReason}: ${outcome.abortDetail ?? 'no detail'})` : ''}`,
    `scenarios: ${outcome.counts.planned} planned, ${outcome.counts.withResults} with results, ${outcome.counts.notRun} not run`
  ]
  for (const gate of outcome.gates)
    lines.push(
      `  ${gate.status.toUpperCase().padEnd(7)} ${gate.id} ${gate.title}${gate.detail ? ` - ${gate.detail.replace(/\s+/g, ' ')}` : ''}`
    )
  for (const problem of outcome.problems) lines.push(`problem: ${problem}`)
  if (outcome.error) lines.push(`error: ${outcome.error}`)
  if (outcome.reportFiles)
    lines.push(`report: ${outcome.reportFiles.markdownFile} (${outcome.reportFiles.jsonFile})`)
  lines.push(`run directory: ${outcome.runDir}`)
  if (outcome.kept.length > 0) lines.push(`kept: ${outcome.kept.join(', ')}`)
  if (outcome.removed.length > 0) lines.push(`removed: ${outcome.removed.join(', ')}`)
  if ((outcome.status === 'aborted' || outcome.status === 'error') && outcome.counts.notRun > 0) {
    lines.push(`continue with: pnpm search:stress run --resume ${outcome.runId}`)
  }
  return lines
}

/** Sizes the full profile (the largest run) so the disk check does not pass a machine that only fits the smoke run. */
export async function runDoctor(
  options: CommonOptions,
  deps: RunnerDeps,
  io: CommandIo
): Promise<ExitCode> {
  const discovered = await deps.discoverApps()
  const apps = pickApps(discovered.names, 1)
  io.out(describeDiscovery(discovered, apps.length))
  const count = deps.plan.profileCounts.full ?? 10_000
  io.out(`sizing the full profile (${count} scenarios) ...`)
  const plan = deps.plan.generatePlan({ seed: 1, count, apps })
  const items = await deps.preflight({
    embedding: options.embedding,
    ...(options.corpusRoot ? { corpusRoot: options.corpusRoot } : {}),
    plannedBytes: estimatePlannedBytes(plan),
    appCount: discovered.names.length
  })
  for (const line of formatPreflight(items).split('\n')) io.out(line)
  return refusals(items).length > 0 ? 2 : 0
}

export async function runGen(
  options: { seed: number; count: number; out?: string; appsFile?: string },
  deps: RunnerDeps,
  io: CommandIo
): Promise<ExitCode> {
  let apps: string[]
  if (options.appsFile) {
    apps = await deps.readAppsFile(options.appsFile)
    io.out(`apps: ${apps.length} names from ${options.appsFile}`)
  } else {
    const discovered = await deps.discoverApps()
    apps = pickApps(discovered.names, options.seed)
    io.out(describeDiscovery(discovered, apps.length))
  }
  const plan = deps.plan.generatePlan({ seed: options.seed, count: options.count, apps })
  const problems = deps.plan.validatePlan(plan)
  for (const line of formatPlanSummary(describePlan(plan))) io.out(line)
  if (options.out) {
    await writeJsonAtomic(options.out, plan)
    io.out(`plan written to ${options.out}`)
  }
  if (problems.length > 0)
    throw new Error(
      `the generated plan is invalid (${problems.length} problem(s)): ${problems.slice(0, 5).join('; ')}`
    )
  return 0
}

/** Rebuilds report.md and report.json from the files a run left on disk. */
export async function runReport(
  options: { runDir: string },
  deps: RunnerDeps,
  io: CommandIo
): Promise<ExitCode> {
  const target = resolveResumeTarget(options.runDir)
  if (!isValidRunId(target.runId))
    throw new UsageError(`"${options.runDir}" is neither a run directory nor a run id`)
  const layout = buildLayout({ runId: target.runId, runDir: target.runDir })
  let loaded: Awaited<ReturnType<typeof loadRunForReport>>
  try {
    loaded = await loadRunForReport(layout, deps.clock.now)
  } catch (error) {
    throw new RunRefused(`cannot report on ${target.runDir}: ${describeError(error)}`)
  }
  const report = deps.report.build(loaded.inputs)
  const files = await deps.report.write(target.runDir, report)
  const { status, abortReason } = loaded.stored
  io.out(
    `run ${loaded.stored.runId}: ${status}${abortReason ? ` (${abortReason})` : ''}, verdict ${report.verdict.toUpperCase()}`
  )
  for (const gate of report.gates)
    io.out(
      `  ${gate.status.toUpperCase().padEnd(7)} ${gate.id} ${gate.title}${gate.detail ? ` - ${gate.detail.replace(/\s+/g, ' ')}` : ''}`
    )
  io.out(`report: ${files.markdownFile} (${files.jsonFile})`)
  return report.verdict === 'pass' ? 0 : 1
}

/** Runs one parsed command and turns whatever it throws into an exit code and a message. */
export async function executeCommand(
  parsed: ParsedArgs,
  deps: RunnerDeps,
  io: CommandIo
): Promise<ExitCode> {
  try {
    switch (parsed.command) {
      case 'help':
        io.out(USAGE)
        return 0
      case 'doctor':
        return await runDoctor(parsed.options, deps, io)
      case 'gen':
        return await runGen(parsed.options, deps, io)
      case 'report':
        return await runReport(parsed.options, deps, io)
      case 'probe':
        return (await runProbe(parsed.options, deps, io.out)).exitCode
      case 'run': {
        const outcome = await runRun(parsed.options, deps)
        for (const line of formatOutcome(outcome)) io.out(line)
        return outcome.exitCode
      }
    }
  } catch (error) {
    for (const line of describeFailure(error)) io.err(line)
    return exitCodeFor(error)
  }
}
