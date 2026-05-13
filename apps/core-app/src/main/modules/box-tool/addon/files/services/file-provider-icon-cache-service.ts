import type { DbUtils } from '../../../../../db/utils'

export const FILE_ICON_META_EXTENSION_KEY = 'iconMeta'

export interface FileIconCacheMeta {
  mtime: number | null
  size: number | null
}

export function persistFileIconCache(
  deps: {
    dbUtils: DbUtils
    withDbWrite: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  },
  fileId: number,
  iconValue: string,
  meta: FileIconCacheMeta
): Promise<unknown> {
  return deps.withDbWrite('file-icon.persist', () =>
    deps.dbUtils.addFileExtensions([
      { fileId, key: 'icon', value: iconValue },
      { fileId, key: FILE_ICON_META_EXTENSION_KEY, value: JSON.stringify(meta) }
    ])
  )
}
