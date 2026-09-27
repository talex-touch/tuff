import { describe, expect, it } from 'vitest'
import {
  INSTALL_CONFIRM_BUDGET_MS,
  INSTALL_DOWNLOAD_MIN_THROUGHPUT_BYTES_PER_SECOND,
  INSTALL_DOWNLOAD_TIMEOUT_CEILING_MS,
  INSTALL_DOWNLOAD_TIMEOUT_FLOOR_MS,
  INSTALL_TRANSPORT_TIMEOUT_MS,
  INSTALL_UNPACK_BUDGET_MS,
  resolvePackageDownloadTimeout,
} from '../plugin/install-budgets'

/** The largest package that still fits the floor at the pessimistic throughput. */
const floorBoundaryBytes = (INSTALL_DOWNLOAD_MIN_THROUGHPUT_BYTES_PER_SECOND * INSTALL_DOWNLOAD_TIMEOUT_FLOOR_MS) / 1000
/** The largest package whose scaled deadline is still below the ceiling. */
const ceilingBoundaryBytes =
  (INSTALL_DOWNLOAD_MIN_THROUGHPUT_BYTES_PER_SECOND * INSTALL_DOWNLOAD_TIMEOUT_CEILING_MS) / 1000

/**
 * The download deadline is a deadline for the *whole* body, so a fixed 30s only covered links
 * faster than ~0.5 MB/s and the 14 MB JSON Formatter package died mid-download with
 * `NETWORK_TIMEOUT after 30000ms`. The policy is a floor, a size-scaled middle, and a ceiling.
 */
describe('resolvePackageDownloadTimeout', () => {
  it.each([
    { name: 'an unknown size', packageSize: undefined },
    { name: 'a zero size', packageSize: 0 },
    { name: 'a negative size', packageSize: -1 },
    { name: 'a NaN size', packageSize: Number.NaN },
    { name: 'an infinite size', packageSize: Number.POSITIVE_INFINITY },
    { name: 'the 277 KiB Clipboard History artifact', packageSize: 277 * 1024 },
  ])('keeps the floor for $name', ({ packageSize }) => {
    expect(resolvePackageDownloadTimeout(packageSize)).toBe(INSTALL_DOWNLOAD_TIMEOUT_FLOOR_MS)
  })

  it('keeps the floor for the largest package that still fits it', () => {
    expect(resolvePackageDownloadTimeout(floorBoundaryBytes)).toBe(INSTALL_DOWNLOAD_TIMEOUT_FLOOR_MS)
  })

  it('scales past the floor one byte after the floor boundary', () => {
    expect(resolvePackageDownloadTimeout(floorBoundaryBytes + 1)).toBe(INSTALL_DOWNLOAD_TIMEOUT_FLOOR_MS + 1)
  })

  it('covers the 14 MB JSON Formatter artifact past the floor, scaled at the pessimistic throughput', () => {
    const packageSize = 14_334_464
    const timeout = resolvePackageDownloadTimeout(packageSize)

    expect(timeout).toBe(Math.ceil((packageSize / INSTALL_DOWNLOAD_MIN_THROUGHPUT_BYTES_PER_SECOND) * 1000))
    expect(timeout).toBeGreaterThan(INSTALL_DOWNLOAD_TIMEOUT_FLOOR_MS)
  })

  it('clamps a size whose scaled deadline would cross the ceiling', () => {
    expect(resolvePackageDownloadTimeout(ceilingBoundaryBytes + 1)).toBe(INSTALL_DOWNLOAD_TIMEOUT_CEILING_MS)
    expect(resolvePackageDownloadTimeout(10 * 1024 ** 3)).toBe(INSTALL_DOWNLOAD_TIMEOUT_CEILING_MS)
  })

  it('never leaves the floor..ceiling band and never shortens as the package grows', () => {
    const sizes = [1, 277 * 1024, 14_334_464, 512 * 1024 * 1024, 10 * 1024 ** 3, Number.MAX_SAFE_INTEGER]
    const timeouts = sizes.map(size => resolvePackageDownloadTimeout(size))

    for (const timeout of timeouts) {
      expect(timeout).toBeGreaterThanOrEqual(INSTALL_DOWNLOAD_TIMEOUT_FLOOR_MS)
      expect(timeout).toBeLessThanOrEqual(INSTALL_DOWNLOAD_TIMEOUT_CEILING_MS)
    }
    expect(timeouts).toEqual([...timeouts].sort((left, right) => left - right))
  })
})

/**
 * `plugin:install-source` spans the download, the user's permission prompt and the unpack, so the
 * renderer only hears back once the main process has finished all three. Anything shorter than the
 * sum of the per-stage budgets reports "install failed" for an install that is still running — the
 * flat 3-minute wall did exactly that.
 */
describe('INSTALL_TRANSPORT_TIMEOUT_MS', () => {
  it('outlasts the slowest install the main process can still be working on', () => {
    expect(INSTALL_TRANSPORT_TIMEOUT_MS).toBeGreaterThan(3 * 60 * 1000)
    expect(INSTALL_TRANSPORT_TIMEOUT_MS).toBeGreaterThanOrEqual(
      INSTALL_DOWNLOAD_TIMEOUT_CEILING_MS + INSTALL_CONFIRM_BUDGET_MS + INSTALL_UNPACK_BUDGET_MS,
    )
  })

  it.each([
    { name: 'unknown-size', packageSize: undefined },
    { name: '277 KiB', packageSize: 277 * 1024 },
    { name: '14 MB', packageSize: 14_334_464 },
    { name: '10 GiB', packageSize: 10 * 1024 ** 3 },
  ])('covers the full budget of a $name install', ({ packageSize }) => {
    expect(INSTALL_TRANSPORT_TIMEOUT_MS).toBeGreaterThanOrEqual(
      resolvePackageDownloadTimeout(packageSize) + INSTALL_CONFIRM_BUDGET_MS + INSTALL_UNPACK_BUDGET_MS,
    )
  })
})
