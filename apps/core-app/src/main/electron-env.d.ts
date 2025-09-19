/// <reference types="vite-plugin-electron/electron-env" />

import { Logger } from 'log4js'
import { TouchApp } from './core/touch-app'

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
declare global {
  var logger: Logger
  var errLogger: Logger
  var $app: TouchApp
  var $pkg: typeof import('../../../package.json')
}

// add console types
declare global {
  interface Console {
    _log(message?: any, ...optionalParams: any[]): void
    _info(message?: any, ...optionalParams: any[]): void
    _warn(message?: any, ...optionalParams: any[]): void
    _error(message?: any, ...optionalParams: any[]): void
    _debug(message?: any, ...optionalParams: any[]): void
    _trace(message?: any, ...optionalParams: any[]): void
  }
}
