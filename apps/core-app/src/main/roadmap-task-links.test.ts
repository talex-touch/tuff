import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The ROADMAP task table must not ship dead links or finished work as open work (#630).
 *
 * ROADMAP said its statuses came from each task's record, but nothing enforced that, so rows
 * outlived the tasks they pointed at. A maintainer picking up something marked in_progress got a
 * 404 and no way to tell whether the task had been completed, renamed, or lost.
 *
 * The task tree those rows linked into is retired. A row now links the task's frozen backlog entry
 * (`docs/engineering/workflow/backlog.md#<dated-slug>`), its surviving handoff, or a live Comet
 * change, and task identity comes from the retired task registry. Three rules, each derived from
 * the table and the registry rather than from a copy of either:
 *
 * - every link resolves, fragment included. docs:verify checks that a linked file exists but not
 *   that its anchor does, and a backlog row is nothing but an anchor;
 * - nothing links into the retired tree, which does not survive the cutover;
 * - every retired task the table names was still open when the tree was retired. An archived task
 *   is history; listing it beside open work is the old "completed task in the active table"
 *   mistake in its new form.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const ROADMAP = readFileSync(path.join(REPO_ROOT, 'ROADMAP.md'), 'utf8')
const BACKLOG = 'docs/engineering/workflow/backlog.md'
const HANDOFFS = 'docs/engineering/workflow/handoffs/'
const REGISTRY = 'docs/engineering/workflow/retired-task-index.json'
const DATED_SLUG = /^\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/

interface TableLink {
  row: string
  file: string
  fragment: string | null
}

function taskTableRows(): string[] {
  const lines = ROADMAP.split('\n')
  const header = lines.findIndex((line) => line.startsWith('| 任务 |'))
  if (header === -1) {
    throw new Error('ROADMAP.md has no task table: no header row starting with "| 任务 |"')
  }
  const rows: string[] = []
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break
    rows.push(line)
  }
  return rows
}

/** Repository-relative links in the table. External URLs are not this test's business. */
function tableLinks(): TableLink[] {
  return taskTableRows().flatMap((row) =>
    [...row.matchAll(/\]\(([^)\s]+)\)/g)].flatMap((match): TableLink[] => {
      const href = match[1] ?? ''
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return []
      const hash = href.indexOf('#')
      const rawFile = hash === -1 ? href : href.slice(0, hash)
      const fragment = hash === -1 ? null : decodeURIComponent(href.slice(hash + 1))
      const file = path.posix.normalize(decodeURIComponent(rawFile || 'ROADMAP.md'))
      return [{ row, file, fragment }]
    })
  )
}

/** GitHub's heading anchors: rendered text, lower-cased, punctuation dropped, spaces to hyphens. */
function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>()
  const seen = new Map<string, number>()
  let fence: string | null = null
  for (const line of markdown.split('\n')) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker !== undefined) {
      if (fence === null) fence = marker.charAt(0)
      else if (marker.charAt(0) === fence) fence = null
      continue
    }
    if (fence !== null) continue
    const prefix = /^\s{0,3}#{1,6}\s+/.exec(line)
    if (prefix === null) continue
    let heading = line.slice(prefix[0].length).trim()
    let closingStart = heading.length
    while (closingStart > 0 && heading.charAt(closingStart - 1) === '#') closingStart--
    if (
      closingStart < heading.length &&
      (closingStart === 0 || /\s/.test(heading.charAt(closingStart - 1)))
    ) {
      heading = heading.slice(0, closingStart).trimEnd()
    }
    const anchor = heading
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-')
    const count = seen.get(anchor) ?? 0
    seen.set(anchor, count + 1)
    anchors.add(count === 0 ? anchor : `${anchor}-${count}`)
  }
  return anchors
}

function resolves(link: TableLink): boolean {
  const absolute = path.join(REPO_ROOT, link.file)
  if (!existsSync(absolute)) return false
  if (link.fragment === null || !link.file.endsWith('.md')) return true
  return headingAnchors(readFileSync(absolute, 'utf8')).has(link.fragment.toLowerCase())
}

/** The dated slug a link names when it points at a retired task's backlog entry or handoff. */
function retiredTaskSlug(link: TableLink): string | null {
  if (link.file === BACKLOG && link.fragment !== null && DATED_SLUG.test(link.fragment)) {
    return link.fragment
  }
  if (link.file.startsWith(HANDOFFS)) return link.file.slice(HANDOFFS.length).split('/')[0] ?? null
  return null
}

function frozenSlugs(): Set<string> {
  const registry = JSON.parse(readFileSync(path.join(REPO_ROOT, REGISTRY), 'utf8')) as {
    tasks?: unknown
  }
  if (!Array.isArray(registry.tasks)) throw new Error(`${REGISTRY} has no tasks array`)
  const tasks = registry.tasks as Array<{ slug?: unknown; disposition?: unknown }>
  return new Set(
    tasks.flatMap((task) =>
      task.disposition === 'frozen' && typeof task.slug === 'string' ? [task.slug] : []
    )
  )
}

function describeLink(link: TableLink): string {
  return `${link.file}${link.fragment === null ? '' : `#${link.fragment}`} (row: ${link.row.slice(0, 80)})`
}

describe('rOADMAP task table', () => {
  it('links only to files and headings that exist', () => {
    const links = tableLinks()
    // Positive control: the rule below passes vacuously for a table whose links the parser missed.
    expect(links.length).toBeGreaterThan(0)

    expect(links.filter((link) => !resolves(link)).map(describeLink)).toEqual([])
  })

  it('does not link into the retired task tree', () => {
    const retired = tableLinks().filter(
      (link) => link.file === '.trellis' || link.file.startsWith('.trellis/')
    )

    expect(retired.map(describeLink)).toEqual([])
  })

  it('names only tasks that were still open when the task tree was retired', () => {
    const named = tableLinks().flatMap((link) => {
      const slug = retiredTaskSlug(link)
      return slug === null ? [] : [{ link, slug }]
    })
    // Same control: a table naming no retired task would pass the rule by finding nothing.
    expect(named.length).toBeGreaterThan(0)

    const frozen = frozenSlugs()
    expect(
      named.filter(({ slug }) => !frozen.has(slug)).map(({ link }) => describeLink(link))
    ).toEqual([])
  })
})
