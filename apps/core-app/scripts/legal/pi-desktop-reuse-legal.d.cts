import type { Plugin } from 'vite'

export declare const ARCHIVE_FILE: string
export declare const MANIFEST_FILE: string
export declare const PINNED_COMMIT: string

export type PiDesktopReuseBuildTarget = 'main' | 'preload' | 'renderer'

export interface PiDesktopReuseLegalCollector {
  plugin: (target: PiDesktopReuseBuildTarget) => Plugin
}

export interface PiDesktopReuseBundleSummary {
  bundleDir: string
  archiveSha256: string
  entries: number
}

export declare function createPiDesktopReuseLegalCollector(options: {
  appRoot: string
}): PiDesktopReuseLegalCollector

export declare function validatePackage(appRoot: string): unknown

export declare function verifyBundle(options: {
  appRoot: string
  bundleDir?: string
}): PiDesktopReuseBundleSummary

export declare function verifyPackagedBundle(options: { appRoot: string; resourcesDir: string }): {
  packagedDir: string
  archiveSha256: string
}

export declare function reproduceBundle(options: {
  appRoot: string
  outDir: string
  bundleDir?: string
}): PiDesktopReuseBundleSummary
