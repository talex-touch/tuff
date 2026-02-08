export interface EverythingSearchOptions {
  maxResults?: number
  offset?: number
  sort?: number
  regex?: boolean
  matchCase?: boolean
  matchPath?: boolean
  matchWholeWord?: boolean
}

export interface EverythingSearchResult {
  fullPath?: string
  path?: string
  filename?: string
  name?: string
  extension?: string
  size?: number
  fileSize?: number
  isFolder?: boolean
  dateModified?: number | string | Date
  dateCreated?: number | string | Date
  modifiedAt?: number | string | Date
  createdAt?: number | string | Date
}

export declare function search(
  query: string,
  options?: EverythingSearchOptions
): EverythingSearchResult[]

export declare function query(
  query: string,
  options?: EverythingSearchOptions
): EverythingSearchResult[]

export declare function getVersion(): string | null
