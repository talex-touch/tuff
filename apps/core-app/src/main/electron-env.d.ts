/// <reference types="vite-plugin-electron/electron-env" />

import type { Logger } from 'log4js'
import type { TouchApp } from './core/touch-app'

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    DIST: string
    /** /dist/ or /public/ */
    PUBLIC: string
  }
}

// add global types
declare namespace NodeJS {
  interface Global {
    logger: Logger
    errLogger: Logger
    $app: TouchApp
    $pkg: typeof import('../../../package.json')
  }
}

// add console types
declare global {
  var logger: Logger
  var errLogger: Logger
  var $app: TouchApp
  var $pkg: typeof import('../../../package.json')

  interface Console {
    _log: (message?: unknown, ...optionalParams: unknown[]) => void
    _info: (message?: unknown, ...optionalParams: unknown[]) => void
    _warn: (message?: unknown, ...optionalParams: unknown[]) => void
    _error: (message?: unknown, ...optionalParams: unknown[]) => void
    _debug: (message?: unknown, ...optionalParams: unknown[]) => void
    _trace: (message?: unknown, ...optionalParams: unknown[]) => void
  }
}
