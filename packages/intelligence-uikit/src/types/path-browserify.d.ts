declare module 'path-browserify' {
  import type * as path from 'node:path'

  const pathBrowserify: typeof path
  export = pathBrowserify
}
