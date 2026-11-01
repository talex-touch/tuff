import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BuildReport, Report, ReportInputs, WriteReport } from '../eval-types'
import { buildClassReports } from './classes'
import { compareCases, slowestChecks } from './compare'
import { collectFailures } from './failures'
import { foundSummary } from './found'
import { evaluateGates, verdictOf } from './gates'
import { resolveLimits } from './limits'
import { renderMarkdown } from './markdown'
import { assemble, type ReportJson } from './model'
import { buildDatabaseSection, buildMonitorSection } from './monitor-section'
import { prepare } from './results'
import { answerStats, indexingStats } from './speed'

const SLOWEST_COUNT = 15

/** The contract's `Report` with its `json` typed, so callers in this package need no cast. */
export interface BuiltReport extends Report {
  json: ReportJson
}

export const buildReport = ((inputs: ReportInputs): BuiltReport => {
  const limits = resolveLimits(inputs.limits)
  const prepared = prepare(inputs.results, inputs.dims)
  const classes = buildClassReports(prepared, inputs.planned, inputs.notRun)
  const failures = collectFailures(prepared)
  const indexing = indexingStats(prepared)
  const answers = answerStats(prepared)
  const monitor = buildMonitorSection(inputs)
  const database = buildDatabaseSection(inputs.monitor, inputs.db)

  const gates = evaluateGates({
    inputs,
    limits,
    prepared,
    classes,
    failures,
    indexing,
    answers,
    monitor,
    database
  })
  const verdict = verdictOf(gates)
  const json = assemble({
    inputs,
    limits,
    verdict,
    gates,
    duplicates: prepared.duplicates,
    withoutDims: prepared.withoutDims,
    classes,
    found: foundSummary(classes),
    indexing,
    answers,
    comparison: compareCases(prepared, limits.outlierFactor),
    slowest: slowestChecks(prepared, SLOWEST_COUNT),
    failures,
    monitor,
    database
  })
  return { verdict, gates, json, markdown: renderMarkdown(json) }
}) satisfies BuildReport

async function writeAtomically(file: string, text: string): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`
  try {
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export const writeReport: WriteReport = async (dir, report) => {
  await mkdir(dir, { recursive: true })
  const jsonFile = join(dir, 'report.json')
  const markdownFile = join(dir, 'report.md')
  await writeAtomically(jsonFile, `${JSON.stringify(report.json, null, 2)}\n`)
  await writeAtomically(markdownFile, report.markdown)
  return { jsonFile, markdownFile }
}
