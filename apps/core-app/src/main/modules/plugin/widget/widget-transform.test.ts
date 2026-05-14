import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyWidgetCompileError,
  resolvePackagedEsbuildBinaryPathForTest
} from './widget-transform'

const tempRoots: string[] = []
const originalResourcesPath = process.resourcesPath

function createTempRoot(): string {
  const root = path.join(tmpdir(), `tuff-widget-transform-${Date.now()}-${Math.random()}`)
  tempRoots.push(root)
  mkdirSync(root, { recursive: true })
  return root
}

afterEach(() => {
  vi.unstubAllGlobals()
  tempRoots.splice(0).forEach((root) => {
    rmSync(root, { force: true, recursive: true })
  })
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: originalResourcesPath
  })
})

describe('widget esbuild transform helpers', () => {
  it('classifies esbuild spawn failures as binary unavailable', () => {
    const error = Object.assign(new Error('spawn ENOTDIR'), { code: 'ENOTDIR' })

    expect(classifyWidgetCompileError(error)).toBe('WIDGET_COMPILER_BINARY_UNAVAILABLE')
  })

  it('keeps ordinary compile failures under the generic compile code', () => {
    expect(classifyWidgetCompileError(new Error('Unexpected token'))).toBe('WIDGET_COMPILE_FAILED')
  })

  it('classifies stopped esbuild service failures explicitly', () => {
    const error = Object.assign(new Error('The service is no longer running: write EPIPE'), {
      code: 'EPIPE'
    })

    expect(classifyWidgetCompileError(error)).toBe('WIDGET_COMPILER_SERVICE_UNAVAILABLE')
  })

  it('resolves packaged esbuild binary from resources node_modules', () => {
    const root = createTempRoot()
    const platformPackage =
      process.platform === 'win32'
        ? '@esbuild/win32-x64'
        : process.platform === 'darwin'
          ? `@esbuild/darwin-${process.arch}`
          : `@esbuild/linux-${process.arch}`
    const binarySubpath = process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'
    const binaryPath = path.join(root, 'node_modules', platformPackage, binarySubpath)
    mkdirSync(path.dirname(binaryPath), { recursive: true })
    writeFileSync(binaryPath, '')
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: root
    })

    expect(resolvePackagedEsbuildBinaryPathForTest()).toBe(binaryPath)
  })
})
