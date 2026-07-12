import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import {
  parseImageDataUrl,
  toImageDataUrl,
} from '@talex-touch/utils/plugin'
import { describe, expect, it } from 'vitest'

interface ImageDataUrlFunctions {
  parseImageDataUrl: (dataUrl: string) => { mime: string, base64: string } | null
  toImageDataUrl: (base64: string, mime: string) => string
}

interface NodeModuleInstance {
  filename: string
  paths: string[]
  exports: unknown
  _compile: (code: string, filename: string) => void
}

interface NodeModuleConstructor {
  new (id?: string): NodeModuleInstance
  _nodeModulePaths: (from: string) => string[]
}

const ModuleCtor = Module as unknown as NodeModuleConstructor

function isImageDataUrlFunctions(value: unknown): value is ImageDataUrlFunctions {
  return Boolean(
    value
    && typeof value === 'object'
    && 'parseImageDataUrl' in value
    && typeof value.parseImageDataUrl === 'function'
    && 'toImageDataUrl' in value
    && typeof value.toImageDataUrl === 'function',
  )
}

function isRuntimeImageDataUrlExports(value: unknown): value is { __test: ImageDataUrlFunctions } {
  return Boolean(
    value
    && typeof value === 'object'
    && '__test' in value
    && isImageDataUrlFunctions(value.__test),
  )
}

function loadRuntimeImageDataUrlHelpers(): ImageDataUrlFunctions {
  const filename = resolve(dirname(__filename), 'index.js')
  const mod = new ModuleCtor(filename)
  mod.filename = filename
  mod.paths = ModuleCtor._nodeModulePaths(dirname(filename))
  mod._compile(readFileSync(filename, 'utf8'), filename)

  const runtimePlugin = mod.exports
  if (!isRuntimeImageDataUrlExports(runtimePlugin)) {
    throw new Error('Touch Translation runtime does not expose image data URL helpers')
  }

  return runtimePlugin.__test
}

function loadSharedRuntimeImageDataUrlHelpers(): ImageDataUrlFunctions {
  const sharedHelpers = createRequire(__filename)('../../packages/utils/plugin/translation.cjs')
  if (!isImageDataUrlFunctions(sharedHelpers)) {
    throw new Error('Shared translation module does not expose image data URL helpers')
  }

  return sharedHelpers
}

const runtimeImageDataUrlHelpers = loadRuntimeImageDataUrlHelpers()
const sharedRuntimeImageDataUrlHelpers = loadSharedRuntimeImageDataUrlHelpers()

const encodedPng = 'iVBORw0KGgoAAAANSUhEUg=='

describe('image data URL helpers', () => {
  it('preserves encoded image bytes through the public API build/parse round trip', () => {
    const dataUrl = toImageDataUrl(encodedPng, 'image/jpeg')

    expect(dataUrl).toBe(`data:image/jpeg;base64,${encodedPng}`)
    expect(parseImageDataUrl(dataUrl)).toEqual({
      mime: 'image/jpeg',
      base64: encodedPng,
    })
  })

  it('canonicalizes image MIME variants and removes presentation whitespace from encoded data', () => {
    expect(parseImageDataUrl(' data:IMAGE/SVG+XML;base64,aGVs\n bG8= ')).toEqual({
      mime: 'image/svg+xml',
      base64: 'aGVsbG8=',
    })
  })

  it.each([
    'data:text/plain;base64,aGVsbG8=',
    'data:image/png;base64,',
    'data:image/png;charset=utf-8;base64,aGVsbG8=',
    'not a data URL',
  ])('rejects malformed and non-image data URL %j', (dataUrl) => {
    expect(parseImageDataUrl(dataUrl)).toBeNull()
  })

  it('replaces an invalid output MIME with the safe image MIME', () => {
    expect(toImageDataUrl(encodedPng, 'application/octet-stream')).toBe(`data:image/png;base64,${encodedPng}`)
  })

  it('exposes the exact shared CommonJS image data URL helpers through the runtime test API', () => {
    expect(runtimeImageDataUrlHelpers.parseImageDataUrl).toBe(sharedRuntimeImageDataUrlHelpers.parseImageDataUrl)
    expect(runtimeImageDataUrlHelpers.toImageDataUrl).toBe(sharedRuntimeImageDataUrlHelpers.toImageDataUrl)
  })
})
