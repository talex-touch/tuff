import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The active-task table must not ship dead links or finished work (#630).
 *
 * ROADMAP.md says its own statuses come from each task's `task.json`, but nothing enforced that, so
 * rows outlived the tasks they point at. A maintainer picking up something marked in_progress got a
 * 404 and no way to tell whether the task had been completed, renamed, or lost.
 *
 * Two rules, both derived from the table rather than from a copy of it: every link resolves, and a
 * task whose committed status is `completed` does not sit in a table of active work. The second is
 * deliberately one-directional — it demands removal when a task is finished and stays quiet
 * otherwise, so an author whose local task.json is mid-edit does not get a spurious failure.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const ROADMAP = readFileSync(path.join(REPO_ROOT, 'ROADMAP.md'), 'utf8')

const activeTable = (() => {
  const lines = ROADMAP.split('\n')
  const header = lines.findIndex((line) => line.startsWith('| 任务 |'))
  if (header === -1) return []
  const rows: string[] = []
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break
    rows.push(line)
  }
  return rows
})()

function linkedTasks(rows: string[]): Array<{ slug: string; row: string }> {
  return rows.flatMap((row) => {
    const match = /\]\(\.trellis\/tasks\/([^/]+)\/prd\.md\)/.exec(row)
    return match ? [{ slug: match[1]!, row }] : []
  })
}

function committedStatus(slug: string): string | null {
  const file = path.join(REPO_ROOT, '.trellis/tasks', slug, 'task.json')
  if (!existsSync(file)) return null
  return (JSON.parse(readFileSync(file, 'utf8')) as { status?: string }).status ?? null
}

describe('ROADMAP active-task table', () => {
  it('is found and populated', () => {
    // Positive control: both rules below are vacuous against an empty table, which is exactly what
    // a parser that missed the header would produce.
    expect(activeTable.length).toBeGreaterThan(10)
    expect(linkedTasks(activeTable).length).toBeGreaterThan(10)
  })

  it('agrees with the count in its own heading', () => {
    const declared = /活跃 Trellis 任务（部分，本表 (\d+) 个）/.exec(ROADMAP)?.[1]

    expect(Number(declared)).toBe(activeTable.length)
  })

  it('links only to tasks that exist in the repository', () => {
    // A row may be unlinked — one task is kept out of version control via .git/info/exclude, so it
    // is listed as plain text rather than as a link that 404s for every other clone.
    const dead = linkedTasks(activeTable).filter(
      ({ slug }) => !existsSync(path.join(REPO_ROOT, '.trellis/tasks', slug, 'prd.md'))
    )

    expect(dead.map(({ slug }) => slug)).toEqual([])
  })

  it('does not keep completed tasks in a table of active work', () => {
    const finished = linkedTasks(activeTable).filter(
      ({ slug }) => committedStatus(slug) === 'completed'
    )

    expect(finished.map(({ slug }) => slug)).toEqual([])
  })

  it('reads task.json for the rows it checks', () => {
    // Third control, on the data rather than the parser: if every task.json were unreadable the
    // rule above would pass by finding nothing.
    const statuses = linkedTasks(activeTable).map(({ slug }) => committedStatus(slug))

    expect(statuses.filter(Boolean).length).toBe(statuses.length)
  })
})
