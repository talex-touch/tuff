import { describe, expect, it } from 'vitest'
import { normalizeAsarUnpackedPath } from './native-binary-path'

/**
 * A packaged app resolves binaries through `app.asar/...`, but the archive is not a directory on
 * disk: spawning from that spelling fails with ENOTDIR. electron-builder unpacks those files
 * beside the archive, so the resolved path has to be redirected to `app.asar.unpacked`.
 */
describe('normalizeAsarUnpackedPath', () => {
  it('returns null for values that cannot be a module path', () => {
    for (const value of [null, undefined, '', '   ', 42, {}, []]) {
      expect(normalizeAsarUnpackedPath(value)).toBeNull()
    }
  })

  it('leaves a path outside an asar archive untouched', () => {
    expect(normalizeAsarUnpackedPath('/opt/homebrew/bin/fd')).toBe('/opt/homebrew/bin/fd')
    expect(normalizeAsarUnpackedPath(String.raw`C:\tools\fd.exe`)).toBe(String.raw`C:\tools\fd.exe`)
  })

  it('redirects a packed path to its unpacked twin', () => {
    expect(
      normalizeAsarUnpackedPath(
        '/Applications/Tuff.app/Contents/Resources/app.asar/node_modules/@prebuilt-binary/fd-darwin-arm64/bin/fd'
      )
    ).toBe(
      '/Applications/Tuff.app/Contents/Resources/app.asar.unpacked/node_modules/@prebuilt-binary/fd-darwin-arm64/bin/fd'
    )
    expect(
      normalizeAsarUnpackedPath(
        String.raw`C:\Tuff\resources\app.asar\node_modules\ffmpeg-static\ffmpeg.exe`
      )
    ).toBe(String.raw`C:\Tuff\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe`)
  })

  it('leaves an already unpacked path alone', () => {
    // The unpacked spelling is the destination, not another archive path: a second pass must not
    // produce `app.asar.unpacked.unpacked`. User-supplied override paths arrive this way.
    const unpackedPosix =
      '/Applications/Tuff.app/Contents/Resources/app.asar.unpacked/node_modules/@prebuilt-binary/fd-darwin-arm64/bin/fd'
    const unpackedWindows = String.raw`C:\Tuff\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe`

    expect(normalizeAsarUnpackedPath(unpackedPosix)).toBe(unpackedPosix)
    expect(normalizeAsarUnpackedPath(unpackedWindows)).toBe(unpackedWindows)
  })

  it('is idempotent for the packed path it redirects', () => {
    const packed =
      '/Applications/Tuff.app/Contents/Resources/app.asar/node_modules/ffmpeg-static/ffmpeg'
    const unpacked = normalizeAsarUnpackedPath(packed)

    expect(normalizeAsarUnpackedPath(unpacked)).toBe(unpacked)
  })

  it('trims the surrounding whitespace a resolved path may carry', () => {
    expect(
      normalizeAsarUnpackedPath(' /Applications/Tuff.app/Contents/Resources/app.asar/bin/fd\n')
    ).toBe('/Applications/Tuff.app/Contents/Resources/app.asar.unpacked/bin/fd')
  })
})
