import { describe, expect, it } from 'vitest'
import type { ReportInputs } from '../eval-types'
import { buildReport } from './index'
import {
  T0,
  absentBad,
  breach,
  errored,
  found,
  framelessPhase,
  greenInputs,
  missed,
  sid,
  withMonitor,
  withResults
} from './testing/builders'

const markdownOf = (inputs: ReportInputs): string => buildReport(inputs).markdown

const SECTIONS = [
  '# Search and index stress report',
  '## Gates',
  '## Are apps, files and images found?',
  '## Classes',
  '## Indexing speed (create-image)',
  '## Search answer time',
  '## Case comparison',
  '## Slowest checks',
  '## Failures',
  '## Monitor',
  '### Load by phase',
  '### Responsiveness by phase',
  '### Breaches',
  '### App-reported lag against the probes',
  '## Database'
]

/** A run with something to say in every section. */
function busyInputs(): ReportInputs {
  const base = greenInputs()
  const results = [
    ...base.results.filter((r) => r.class !== 'create-image' && r.class !== 'search-file'),
    found('create-image', 0, { sinceStepsMs: 2_000, answerMs: 80 }),
    found('create-image', 1, { sinceStepsMs: 9_000, answerMs: 120 }),
    missed('create-image', 2),
    found('search-file', 0),
    missed('search-file', 1, { detail: 'a|b\nsecond line `tick`' }),
    errored('search-file', 2),
    missed('search-file', 3, { tier: 'soft' }),
    absentBad('ignore-image', 9)
  ]
  const dims: ReportInputs['dims'] = {
    ...base.dims,
    [sid('search-file', 1)]: { format: 'a|b', placement: 'deep' },
    [sid('create-image', 1)]: { format: 'heic', writeMode: 'slow|writer' }
  }
  return withMonitor(
    { ...base, results, dims, planned: { ...base.planned, 'ignore-image': 4, 'search-file': 4 } },
    {
      breaches: [
        breach({
          at: T0 + 125_000,
          kind: 'main-loop-block',
          value: 380,
          limit: 250,
          detail: 'event loop blocked | native call',
          evidence: '/private/tmp/evidence/stall-0001.cpuprofile',
          marks: ['batch:12', 'waiting-for-index-idle']
        }),
        breach({ at: T0 + 20_000, kind: 'cpu', severity: 'warn', value: 190, limit: 150 }),
        breach({ at: T0 + 30_000, kind: 'frame-drop', severity: 'warn', value: 0.015, limit: 0.01 })
      ],
      appReportedLag: [
        {
          at: T0 + 125_300,
          lagMs: 380,
          suspect: 'Intelligence.invoke',
          contexts: ['embedding.generate']
        },
        { at: T0 + 400_000, lagMs: 420, suspect: 'unattributed' }
      ],
      logMarkers: [
        {
          id: 'db-slow-open',
          cls: 'suspect',
          count: 2,
          firstAt: T0 + 10_000,
          sample: 'open took | 4 s'
        }
      ],
      windows: [
        {
          label: 'CoreBox',
          visibleSeconds: 500,
          hiddenSeconds: 100,
          frames: 72_000,
          over20ms: 1_500,
          over50ms: 20,
          worstFrameMs: 90,
          throttledIntervals: 0,
          worstBlockMs: 60
        }
      ],
      notes: ['sample() unavailable on this build'],
      harnessCpuPct: { avg: 4, max: 20 },
      blindByProbe: { renderer: 2_000 },
      blindMs: 2_000
    }
  )
}

/** Table lines grouped into blocks, each with the cell count of its header. */
function tables(markdown: string): Array<{ header: string; widths: number[] }> {
  const blocks: Array<{ header: string; widths: number[] }> = []
  let current: { header: string; widths: number[] } | null = null
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) {
      current = null
      continue
    }
    const cells = line.split(/(?<!\\)\|/).length - 2
    if (!current) {
      current = { header: line, widths: [] }
      blocks.push(current)
    }
    current.widths.push(cells)
  }
  return blocks
}

describe('the Markdown report', () => {
  it('has every section, in reading order', () => {
    const markdown = markdownOf(busyInputs())
    const positions = SECTIONS.map(
      (heading) => markdown.indexOf(`\n${heading}\n`) + 1 || markdown.indexOf(`${heading}\n`)
    )
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('never prints a placeholder of a bug', () => {
    const empty: ReportInputs = { ...greenInputs(), results: [], planned: {}, dims: {}, notRun: [] }
    const never = withResults(busyInputs(), 'create-image', [
      missed('create-image', 0),
      missed('create-image', 1)
    ])
    for (const inputs of [
      greenInputs(),
      busyInputs(),
      empty,
      never,
      withMonitor(greenInputs(), { phases: [framelessPhase()] })
    ]) {
      expect(markdownOf(inputs)).not.toMatch(/undefined|NaN|\[object Object\]|Infinity/)
    }
  })

  it('is the same text every time for the same inputs', () => {
    expect(markdownOf(busyInputs())).toBe(markdownOf(busyInputs()))
  })

  it('ends with exactly one newline and has no trailing spaces', () => {
    const markdown = markdownOf(busyInputs())
    expect(markdown.endsWith('\n')).toBe(true)
    expect(markdown.endsWith('\n\n')).toBe(false)
    expect(markdown.split('\n').filter((line) => /\s$/.test(line))).toEqual([])
  })

  it('opens with the verdict and the gates that need attention, then explains the rule', () => {
    const lines = markdownOf(busyInputs()).split('\n')
    expect(lines[0]).toBe('# Search and index stress report')
    expect(lines[2]).toBe('**Verdict: FAIL**')
    expect(lines[4]).toMatch(/^Not passing: G1 Hard-check correctness \(fail\), /)
    expect(lines[6]).toContain('The verdict fails when any gate is `fail` or `unknown`')
  })

  it('gives the exact command that repeats the run, the seed and the host', () => {
    const markdown = markdownOf(greenInputs())
    expect(markdown).toContain('- Reproduce: `pnpm search:stress run --profile full --seed 1030`')
    expect(markdown).toContain('Run `run-0001`, profile `full`, seed 1030, 21 scenarios')
    expect(markdown).toContain('- 2026-10-30T12:00:00Z to 2026-10-30T12:10:00Z (10m00s)')
    expect(markdown).toContain('- Host darwin 27.0.0, 14 CPUs, 48 GB')
    expect(markdown).toContain('- Switches: `ui=visible` `embedding=false`')
  })

  it('tabulates every gate with its status and its measured figures', () => {
    const markdown = markdownOf(busyInputs())
    const buildGates = buildReport(busyInputs()).gates
    for (const entry of buildGates) {
      expect(markdown).toContain(`| ${entry.id} ${entry.title} | ${entry.status.toUpperCase()} |`)
    }
  })

  it('answers whether apps, files and images are found, as numbers and rates', () => {
    const markdown = markdownOf(busyInputs())
    const section = markdown.slice(
      markdown.indexOf('## Are apps, files and images found?'),
      markdown.indexOf('## Classes')
    )
    expect(section).toContain('| Apps | 3 | 3 | 100.0% | 0 | 0 | n/a |')
    expect(section).toContain('| Images that must not be indexed |')
    expect(section).toContain('Errors and skipped checks are not counted here.')
  })

  it('shows the dimensions, the evidence file and the runner marks of a breach', () => {
    const markdown = markdownOf(busyInputs())
    expect(markdown).toContain('`/private/tmp/evidence/stall-0001.cpuprofile`')
    expect(markdown).toContain('batch:12 > waiting-for-index-idle')
    expect(markdown).toContain('+2m05s')
    expect(markdown).toContain('380 ms / 250 ms')
    expect(markdown).toContain('1.5% / 1.0%')
  })

  it('states what the app reported against what the probes saw', () => {
    const markdown = markdownOf(busyInputs())
    expect(markdown).toContain(
      'It reported 2 lags (longest 420 ms): 1 inside a probe episode, 1 outside any (1 of them at or above the fail limit).'
    )
    expect(markdown).toContain('The two disagree')
    expect(markdown).toContain('Intelligence.invoke')
    expect(markdown).toContain('embedding.generate')
  })

  it('says when the app and the probes agree and when neither saw a stall', () => {
    const agree = markdownOf(
      withMonitor(greenInputs(), {
        breaches: [breach({ at: T0 + 100_000, value: 300 })],
        appReportedLag: [{ at: T0 + 100_300, lagMs: 300 }]
      })
    )
    expect(agree).toContain('The two agree.')
    expect(markdownOf(greenInputs())).toContain("Neither the app's own detector")
  })

  it('lists the limits the monitor ran with', () => {
    const markdown = markdownOf(greenInputs())
    expect(markdown).toContain('| Main-loop single block | 100 ms | 250 ms |')
    expect(markdown).toContain('| App CPU, % of one core, 5 s average | 150% | 300% |')
    expect(markdown).toContain('| App RSS | 2.50 GB | 4.00 GB |')
    expect(markdown).toContain(
      '| Frames over 20 ms (dropped), share per 10 s window | 2.0% | 5.0% |'
    )
    expect(markdown).toContain('| Frames over 50 ms, share per 10 s window | 1.0% | 3.0% |')
  })

  it('says a phase had no visible window instead of printing frame figures', () => {
    expect(markdownOf(withMonitor(greenInputs(), { phases: [framelessPhase()] }))).toContain(
      'no visible window'
    )
  })

  it('shows window figures, the monitor caveats and the harness cost when they exist', () => {
    const markdown = markdownOf(busyInputs())
    expect(markdown).toContain('### Windows')
    expect(markdown).toContain('| CoreBox |')
    expect(markdown).toMatch(/\| CoreBox \| [^|]+ \| [^|]+ \| 72,000 \| 1,500 \| 20 \|/)
    expect(markdown).toContain('Chrome replays the vsyncs a blocked main thread missed')
    expect(markdown).toContain('### Monitor caveats')
    expect(markdown).toContain('- sample() unavailable on this build')
    expect(markdown).toContain('The harness process used 4% of a core on average, 20% at most')
    expect(markdown).toContain('Blind 2 s (0.33%): renderer 2 s')
  })

  it('prints n/a for a window whose summary did not count the frames over 20 ms', () => {
    const windows = [
      {
        label: 'Older',
        visibleSeconds: 10,
        hiddenSeconds: 0,
        frames: 600,
        over50ms: 1,
        worstFrameMs: 60,
        throttledIntervals: 0,
        worstBlockMs: 10
      }
    ]
    expect(markdownOf(withMonitor(greenInputs(), { windows }))).toMatch(
      /\| Older \| [^|]+ \| [^|]+ \| 600 \| n\/a \| 1 \|/
    )
  })

  it('reports the database: quick_check results, markers and the rule for each class', () => {
    const failing = markdownOf({
      ...busyInputs(),
      db: {
        checked: true,
        results: [
          { file: 'a.db', ok: true },
          { file: 'b.db', ok: false, detail: 'row 9 missing' }
        ]
      }
    })
    expect(failing).toContain('quick_check ran after a clean shutdown on 2 files.')
    expect(failing).toContain('Repair markers seen: 0. Quarantined files: 0.')
    expect(failing).toContain('| `b.db` | FAILED | row 9 missing |')
    expect(failing).toContain('| db-slow-open | suspect | 2 |')
    expect(failing).toContain('`repair` fails the gate, `suspect` warns')
  })

  it('shows an image that never became searchable as "never", with the reason the gate fails', () => {
    const markdown = markdownOf(
      withResults(greenInputs(), 'create-image', [
        missed('create-image', 0),
        found('create-image', 1)
      ])
    )
    expect(markdown).toContain(
      'Never searchable before the deadline (hard checks, counted as infinite in the gate): 1.'
    )
    expect(markdown).toMatch(/\| G3 Indexing speed \| FAIL \|.*p99 never/)
  })

  it('states that the indexing limits are provisional and where the number comes from', () => {
    const markdown = markdownOf(greenInputs())
    expect(markdown).toContain(
      'Gate limits are provisional until calibrated: p95 <= 6 s warns, p99 <= 15 s fails. The steady state observed on a real profile was 1.2 to 2.2 s.'
    )
  })

  it('keeps every table rectangular, even when a cell holds a pipe, a newline or a backtick', () => {
    const markdown = markdownOf(busyInputs())
    const blocks = tables(markdown)
    expect(blocks.length).toBeGreaterThan(8)
    for (const block of blocks)
      expect(new Set(block.widths), block.header).toEqual(new Set([block.widths[0]]))
    expect(markdown).toContain('a\\|b second line')
  })

  it('names the scenarios that were never started, at most twenty, in the caveats', () => {
    const notRun = Array.from({ length: 30 }, (_, n) => sid('change-image', 200 + n))
    const markdown = markdownOf({ ...greenInputs(), notRun })
    const caveats = markdown.slice(markdown.indexOf('## Caveats'))
    expect(caveats).toContain('- Scenarios never started: 30, e.g. ')
    expect(caveats.match(/change-image-/g)).toHaveLength(20)
  })

  it('has no caveats section for a complete run', () => {
    expect(markdownOf(greenInputs())).not.toContain('## Caveats')
  })

  it('mentions repeated results and results without dimensions among the caveats', () => {
    const inputs = {
      ...greenInputs(),
      results: [...greenInputs().results, greenInputs().results[0]],
      dims: {}
    }
    const markdown = markdownOf(inputs)
    expect(markdown).toContain(
      '- Repeated results for one check, ignored (the last one counts): 1.'
    )
    expect(markdown).toContain(
      '- Results without dimensions, missing from the case comparison: 21.'
    )
  })
})
