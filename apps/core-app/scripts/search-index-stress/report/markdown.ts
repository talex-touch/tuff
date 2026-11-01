import { passRate, type ClassReport } from './classes'
import { code, dist3, fmtDuration, fmtMs, fmtPct, plural, table, thousands } from './format'
import type { ReportJson } from './model'
import { casesMarkdown } from './markdown-cases'
import { monitorMarkdown } from './markdown-monitor'

function header(json: ReportJson): string[] {
  const { run } = json
  const lines = [
    '# Search and index stress report',
    '',
    `**Verdict: ${json.verdict.toUpperCase()}**`
  ]
  if (json.attention.length > 0) {
    lines.push(
      '',
      `Not passing: ${json.attention.map((entry) => `${entry.id} ${entry.title} (${entry.status})`).join(', ')}.`
    )
  }
  lines.push(
    '',
    'The verdict fails when any gate is `fail` or `unknown`: what was not proven did not pass. `warn` is reported and does not fail it.',
    '',
    `- Run ${code(run.id)}, profile ${code(run.profile)}, seed ${run.seed}, ${plural(run.scenarioCount, 'scenario')}`,
    `- ${run.startedAtIso} to ${run.endedAtIso} (${fmtDuration(run.durationMs)})`,
    `- Host ${run.host.os}, ${run.host.cpus} CPUs, ${run.host.memGb} GB` +
      `${run.appVersion ? `, app ${run.appVersion}` : ''}${run.gitSha ? `, commit ${code(run.gitSha)}` : ''}`
  )
  const switches = Object.entries(run.switches)
  if (switches.length > 0)
    lines.push(`- Switches: ${switches.map(([key, value]) => code(`${key}=${value}`)).join(' ')}`)
  lines.push(`- Reproduce: ${code(run.command)}`)
  return lines
}

function gatesTable(json: ReportJson): string[] {
  return [
    '## Gates',
    '',
    table(
      [{ header: 'Gate' }, { header: 'Status' }, { header: 'Measured' }],
      json.gates.map((entry) => [
        `${entry.id} ${entry.title}`,
        entry.status.toUpperCase(),
        entry.detail
      ])
    )
  ]
}

function foundSection(json: ReportJson): string[] {
  if (json.found.length === 0) return []
  const right = { align: 'right' } as const
  const rate = (part: number, whole: number): string => (whole === 0 ? 'n/a' : fmtPct(part / whole))
  return [
    '## Are apps, files and images found?',
    '',
    table(
      [
        { header: 'What' },
        { header: 'Looked for', ...right },
        { header: 'Found', ...right },
        { header: 'Found rate', ...right },
        { header: 'Must stay out', ...right },
        { header: 'Stayed out', ...right },
        { header: 'Stayed-out rate', ...right }
      ],
      json.found.map((row) => [
        row.what,
        thousands(row.present),
        thousands(row.found),
        rate(row.found, row.present),
        thousands(row.absent),
        thousands(row.heldOut),
        rate(row.heldOut, row.absent)
      ])
    ),
    '',
    'Every decided check counts, hard and soft: a soft miss (a fuzzy query) lowers a rate without failing the run. Errors and skipped checks are not counted here.'
  ]
}

function classRows(classes: readonly ClassReport[]): Array<Array<string | number>> {
  return classes.map((entry) => {
    const hardBad = entry.hard.fail + entry.hard.error + entry.hard.skipped
    const softBad = entry.soft.fail + entry.soft.error + entry.soft.skipped
    return [
      entry.class,
      `${thousands(entry.executed)} / ${entry.planned === null ? 'n/a' : thousands(entry.planned)}`,
      thousands(entry.checks),
      entry.hard.total === 0
        ? 'n/a'
        : `${thousands(entry.hard.pass)} (${fmtPct(passRate(entry.hard))})`,
      thousands(hardBad),
      entry.soft.total === 0
        ? 'n/a'
        : `${thousands(entry.soft.pass)} (${fmtPct(passRate(entry.soft))})`,
      thousands(softBad)
    ]
  })
}

function classesSection(json: ReportJson): string[] {
  const right = { align: 'right' } as const
  return [
    '## Classes',
    '',
    'Correctness. A hard miss fails the run; a soft miss is reported only. Undecided = error or skipped.',
    '',
    table(
      [
        { header: 'Class' },
        { header: 'Run / planned', ...right },
        { header: 'Checks', ...right },
        { header: 'Hard pass', ...right },
        { header: 'Hard fail + undecided', ...right },
        { header: 'Soft pass', ...right },
        { header: 'Soft miss + undecided', ...right }
      ],
      classRows(json.classes)
    ),
    '',
    'Speed. Cells are p50 / p95 / p99. Present checks that passed feed the first two columns; answered present checks feed the third. Absent checks measure a deadline and are left out.',
    '',
    table(
      [
        { header: 'Class' },
        { header: 'Since last step' },
        { header: 'Found in' },
        { header: 'Answer time' },
        { header: 'n found', ...right }
      ],
      json.classes.map((entry) => [
        entry.class,
        dist3(entry.sinceStepsMs),
        dist3(entry.latencyMs),
        dist3(entry.answerMs),
        thousands(entry.presentPass)
      ])
    )
  ]
}

function indexingSection(json: ReportJson): string[] {
  const { indexing, limits } = json
  const lines = ['## Indexing speed (create-image)', '']
  if (indexing.decided === 0) return [...lines, 'No create-image check was decided.']
  const found = indexing.sinceStepsMs
  lines.push(
    `- Found: ${thousands(indexing.found)} of ${thousands(indexing.decided)} decided; since the last file step p50 ${fmtMs(found.p50)} / p90 ${fmtMs(found.p90)} / p95 ${fmtMs(found.p95)} / p99 ${fmtMs(found.p99)} / max ${fmtMs(found.max)}.`,
    `- Never searchable before the deadline (hard checks, counted as infinite in the gate): ${thousands(indexing.neverSearchable)}.`,
    `- Left out of the gate: ${thousands(indexing.softMissesExcluded)} soft misses (a fuzzy query can miss an indexed file), ${thousands(indexing.rankMissesExcluded)} found below the requested rank, ${thousands(indexing.undecidedExcluded)} undecided.`,
    `- Resolution: the check polls with growing gaps; the figures can overstate by up to the longest gap (p95 ${indexing.resolutionP95Ms === null ? 'n/a' : fmtMs(indexing.resolutionP95Ms)}).`,
    `- Gate limits are provisional until calibrated: p95 <= ${fmtMs(limits.indexP95WarnMs)} warns, p99 <= ${fmtMs(limits.indexP99FailMs)} fails. The steady state observed on a real profile was 1.2 to 2.2 s.`
  )
  return lines
}

function answersSection(json: ReportJson): string[] {
  const { answers, limits } = json
  const lines = ['## Search answer time', '']
  const scope =
    answers.scope === 'steady' ? 'steady-phase' : 'all-phase (no check carries a steady tag)'
  lines.push(
    `Typing to the end of the result stream, over ${scope} present checks: ${dist3(answers.answerMs)} (p50 / p95 / p99), max ${fmtMs(answers.answerMs.max)}, n=${thousands(answers.answerMs.count)}. ` +
      `Provisional limits: p95 <= ${fmtMs(limits.answerP95WarnMs)} warns, p99 <= ${fmtMs(limits.answerP99FailMs)} fails.`
  )
  if (answers.byPhase.length > 1) {
    lines.push(
      '',
      table(
        [
          { header: 'Phase' },
          { header: 'n', align: 'right' },
          { header: 'p50 / p95 / p99' },
          { header: 'max', align: 'right' }
        ],
        answers.byPhase.map((entry) => [
          entry.phase,
          thousands(entry.answerMs.count),
          dist3(entry.answerMs),
          fmtMs(entry.answerMs.max)
        ])
      )
    )
  }
  return lines
}

function caveats(json: ReportJson): string[] {
  const lines: string[] = []
  const { coverage } = json
  if (coverage.duplicates > 0)
    lines.push(
      `- Repeated results for one check, ignored (the last one counts): ${thousands(coverage.duplicates)}.`
    )
  if (coverage.withoutDims > 0)
    lines.push(
      `- Results without dimensions, missing from the case comparison: ${thousands(coverage.withoutDims)}.`
    )
  if (coverage.notRun.total > 0) {
    const shown = coverage.notRun.ids.map((id) => code(id)).join(', ')
    lines.push(
      `- Scenarios never started: ${thousands(coverage.notRun.total)}${shown ? `, e.g. ${shown}` : ''}.`
    )
  }
  return lines.length > 0 ? ['## Caveats', '', ...lines] : []
}

export function renderMarkdown(json: ReportJson): string {
  const sections = [
    header(json),
    gatesTable(json),
    foundSection(json),
    classesSection(json),
    indexingSection(json),
    answersSection(json),
    casesMarkdown(json),
    monitorMarkdown(json),
    caveats(json)
  ].filter((section) => section.length > 0)
  return `${sections.map((section) => section.join('\n')).join('\n\n')}\n`
}
