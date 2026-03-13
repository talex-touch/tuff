import type { H3Event } from 'h3'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePilotNexusOrigin } from '../pilot-config'

const ENV_KEYS = ['NODE_ENV', 'NUXT_PUBLIC_NEXUS_ORIGIN'] as const
const ENV_SNAPSHOT = Object.fromEntries(
  ENV_KEYS.map(key => [key, process.env[key]]),
) as Record<string, string | undefined>

function createEvent(options: {
  pilotConfig?: Record<string, unknown>
} = {}): H3Event {
  return {
    context: {
      runtimeConfig: {
        pilot: options.pilotConfig || {},
      },
    },
  } as unknown as H3Event
}

function clearTestEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

function restoreEnvSnapshot(): void {
  for (const key of ENV_KEYS) {
    const value = ENV_SNAPSHOT[key]
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }
}

afterEach(() => {
  restoreEnvSnapshot()
})

describe('resolvePilotNexusOrigin', () => {
  it('开发环境默认走本地 Nexus', () => {
    clearTestEnv()
    process.env.NODE_ENV = 'development'
    const event = createEvent()

    expect(resolvePilotNexusOrigin(event)).toBe('http://127.0.0.1:3200')
  })

  it('开发环境允许通过进程环境变量覆盖默认 origin', () => {
    clearTestEnv()
    process.env.NODE_ENV = 'development'
    process.env.NUXT_PUBLIC_NEXUS_ORIGIN = 'http://127.0.0.1:3300'
    const event = createEvent()

    expect(resolvePilotNexusOrigin(event)).toBe('http://127.0.0.1:3300')
  })

  it('生产环境读取进程环境变量', () => {
    clearTestEnv()
    process.env.NODE_ENV = 'production'
    process.env.NUXT_PUBLIC_NEXUS_ORIGIN = 'https://tuff.tagzxia.com'
    const event = createEvent()

    expect(resolvePilotNexusOrigin(event)).toBe('https://tuff.tagzxia.com')
  })

  it('未配置时生产环境回退到默认线上域名', () => {
    clearTestEnv()
    process.env.NODE_ENV = 'production'
    const event = createEvent()

    expect(resolvePilotNexusOrigin(event)).toBe('https://tuff.tagzxia.com')
  })
})
