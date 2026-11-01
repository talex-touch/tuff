import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DISABLE_AUTO_DEVTOOLS_ENV,
  STARTUP_BENCHMARK_USER_DATA_DIR_ENV,
  isAutoDevtoolsDisabled
} from './acceptance-mode'

describe('isAutoDevtoolsDisabled', () => {
  const saved = {
    flag: process.env[DISABLE_AUTO_DEVTOOLS_ENV],
    dir: process.env[STARTUP_BENCHMARK_USER_DATA_DIR_ENV]
  }

  beforeEach(() => {
    delete process.env[DISABLE_AUTO_DEVTOOLS_ENV]
    delete process.env[STARTUP_BENCHMARK_USER_DATA_DIR_ENV]
  })

  afterEach(() => {
    for (const [name, value] of [
      [DISABLE_AUTO_DEVTOOLS_ENV, saved.flag],
      [STARTUP_BENCHMARK_USER_DATA_DIR_ENV, saved.dir]
    ] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('leaves DevTools alone on an ordinary launch', () => {
    expect(isAutoDevtoolsDisabled()).toBe(false)
  })

  it('ignores the flag without an isolated profile, so a variable left in a shell changes nothing', () => {
    process.env[DISABLE_AUTO_DEVTOOLS_ENV] = '1'
    expect(isAutoDevtoolsDisabled()).toBe(false)
  })

  it('ignores an isolated profile without the flag', () => {
    process.env[STARTUP_BENCHMARK_USER_DATA_DIR_ENV] = '/tmp/profile'
    expect(isAutoDevtoolsDisabled()).toBe(false)
  })

  it('suppresses DevTools for a flagged launch on an isolated profile', () => {
    process.env[DISABLE_AUTO_DEVTOOLS_ENV] = '1'
    process.env[STARTUP_BENCHMARK_USER_DATA_DIR_ENV] = '/tmp/profile'
    expect(isAutoDevtoolsDisabled()).toBe(true)
  })

  it('reads an explicit off as off', () => {
    process.env[DISABLE_AUTO_DEVTOOLS_ENV] = '0'
    process.env[STARTUP_BENCHMARK_USER_DATA_DIR_ENV] = '/tmp/profile'
    expect(isAutoDevtoolsDisabled()).toBe(false)
  })
})
