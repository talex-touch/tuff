import type { ScenarioClass } from '../types'
import type { ClassReport } from './classes'

export interface FoundRow {
  what: string
  classes: ScenarioClass[]
  /** Decided checks that expected the target to be there. */
  present: number
  found: number
  /** Decided checks that expected it to stay out. */
  absent: number
  heldOut: number
}

const GROUPS: ReadonlyArray<{ what: string; classes: readonly ScenarioClass[] }> = [
  { what: 'Apps', classes: ['search-app'] },
  { what: 'Files', classes: ['search-file'] },
  { what: 'Images already on disk', classes: ['search-image'] },
  { what: 'Images added during the run', classes: ['create-image', 'search-created'] },
  { what: 'Images renamed, overwritten or deleted', classes: ['change-image'] },
  { what: 'Images that must not be indexed', classes: ['ignore-image'] }
]

/** Whether apps, files and images are found at all, and whether excluded images stay out. */
export function foundSummary(classes: readonly ClassReport[]): FoundRow[] {
  const rows: FoundRow[] = []
  for (const group of GROUPS) {
    const members = classes.filter((entry) => group.classes.includes(entry.class))
    const row: FoundRow = {
      what: group.what,
      classes: members.map((entry) => entry.class),
      present: 0,
      found: 0,
      absent: 0,
      heldOut: 0
    }
    for (const entry of members) {
      row.present += entry.presentPass + entry.presentFail
      row.found += entry.presentPass
      row.absent += entry.absentPass + entry.absentFail
      row.heldOut += entry.absentPass
    }
    if (row.present + row.absent > 0) rows.push(row)
  }
  return rows
}
