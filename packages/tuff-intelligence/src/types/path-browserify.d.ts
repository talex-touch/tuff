declare module 'path-browserify' {
  export interface ParsedPath {
    root: string
    dir: string
    base: string
    ext: string
    name: string
  }

  export interface PathLike {
    resolve(...paths: string[]): string
    join(...paths: string[]): string
    dirname(path: string): string
    basename(path: string, ext?: string): string
    extname(path: string): string
    normalize(path: string): string
    parse(path: string): ParsedPath
    isAbsolute(path: string): boolean
  }

  const path: PathLike
  export default path
}
