import type { TuffItem } from '@talex-touch/utils'
import type { InjectionKey, Ref } from 'vue'
import { computed, getCurrentInstance, provide } from 'vue'

/**
 * Same-name file rows (D-b, 2026-09-26).
 *
 * A file row's subtitle names only its folder, so two files that share a name look identical: the
 * KaTeX font every Vite build copies into its `assets` showed up as two rows reading
 * `KaTeX_Caligraphic-Regular… · assets`. Rows that share a name show the last two levels of their
 * directory instead (`…/renderer/assets` next to `…/dist/assets`), and more levels only where two
 * still read the same. Every other row keeps its folder name.
 */

/** Directory levels a same-name row shows: its folder and the one above it. */
const FOLDER_LEVELS = 2
const ANY_SEPARATOR = /[\\/]/

/** Item id → folder label, for the rows whose file name appears more than once. */
export const DUPLICATE_FILE_FOLDER_LABELS: InjectionKey<
  Readonly<Ref<ReadonlyMap<string, string>>>
> = Symbol('duplicate-file-folder-labels')

interface FileRow {
  id: string
  directories: string[]
  separator: string
  rooted: boolean
}

/** The rows ItemSubtitle shows a folder for, with the path it takes it from. */
function toFileRow(item: TuffItem): FileRow | null {
  if (item.source?.type !== 'file' && item.kind !== 'file') return null
  const path = item.meta?.file?.path
  if (typeof path !== 'string' || !path) return null
  return {
    id: item.id,
    directories: path.split(ANY_SEPARATOR).filter(Boolean).slice(0, -1),
    // A Windows path keeps its backslashes; anything else reads with `/`.
    separator: path.includes('\\') && !path.includes('/') ? '\\' : '/',
    rooted: ANY_SEPARATOR.test(path.charAt(0))
  }
}

function formatFolderLabel(file: FileRow, levels: number): string {
  const { directories, separator } = file
  if (directories.length > levels) {
    return `…${separator}${directories.slice(-levels).join(separator)}`
  }
  // Nothing left to elide: the whole directory.
  return `${file.rooted ? separator : ''}${directories.join(separator)}`
}

function labelSameNameFiles(files: FileRow[]): string[] {
  const directoryKeys = files.map((file) => file.directories.join('/'))
  const labels: Array<string | undefined> = files.map(() => undefined)
  let unresolved = files.length
  // Two `…/dist/assets` still look alike: a row goes up a level until no other directory reads the
  // same. Each level labels every row once and groups the directories by label, so a page of
  // same-name rows (`index.ts` across a monorepo) costs one pass per level, not one per pair; this
  // runs on every change to the results.
  for (let levels = FOLDER_LEVELS; unresolved > 0; levels += 1) {
    const atLevel = files.map((file) => formatFolderLabel(file, levels))
    const directoriesByLabel = new Map<string, Set<string>>()
    atLevel.forEach((label, index) => {
      const directories = directoriesByLabel.get(label)
      if (directories) directories.add(directoryKeys[index])
      else directoriesByLabel.set(label, new Set([directoryKeys[index]]))
    })
    files.forEach((file, index) => {
      if (labels[index] !== undefined) return
      const shared = (directoriesByLabel.get(atLevel[index])?.size ?? 0) > 1
      if (shared && levels < file.directories.length) return
      labels[index] = atLevel[index]
      unresolved -= 1
    })
  }
  return labels as string[]
}

/** Folder labels for the file rows in `items` that share their name with another file row. */
export function resolveDuplicateFileFolderLabels(items: readonly TuffItem[]): Map<string, string> {
  const filesByName = new Map<string, FileRow[]>()
  for (const item of items) {
    const name = item.render?.basic?.title
    const file = name ? toFileRow(item) : null
    if (!name || !file) continue
    const files = filesByName.get(name)
    if (files) files.push(file)
    else filesByName.set(name, [file])
  }

  const labels = new Map<string, string>()
  for (const files of filesByName.values()) {
    if (files.length < 2) continue
    const fileLabels = labelSameNameFiles(files)
    files.forEach((file, index) => labels.set(file.id, fileLabels[index]))
  }
  return labels
}

/**
 * Lets the rows rendered from `items` tell same-name files apart; ItemSubtitle injects the labels.
 * Like VueUse's `tryOn*` helpers it does nothing outside a component's setup, since useSearch also
 * runs bare in its unit tests.
 */
export function provideDuplicateFileFolderLabels(items: Readonly<Ref<readonly TuffItem[]>>): void {
  if (!getCurrentInstance()) return
  provide(
    DUPLICATE_FILE_FOLDER_LABELS,
    computed(() => resolveDuplicateFileFolderLabels(items.value))
  )
}
