import type { H3Event } from 'h3'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePilotNexusOrigin } from '../pilot-config'

const ENV_KEYS = ['NODE_ENV', 'NUXT_PUBLIC_NEXUS_ORIGIN', 'PILOT_NEXUS_INTERNAL_ORIGIN'] as const
const ENV_SNAPSHOT = Object.fromEntries(
  ENV_KEYS.map(key => [key, process.env[key]]),
) as Record<string, string | undefined>

function createEvent(options: {
  cloudflareEnv?: Record<string, unknown>
  pilotConfig?: Record<string, unknown>
} = {}): H3Event {
  return {
    context: {
      cloudflare: {
        env: options.cloudflareEnv || {},
      },
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
  it('开发环境默认走本地 Nexus，并忽略 cloudflare 注入的线上 origin', () => {
    clearTestEnv()
    process.env.NODE_ENV = 'development'
    const event = createEvent({
      cloudflareEnv: {
        NUXT_PUBLIC_NEXUS_ORIGIN: 'https://tuff.tagzxia.com',
      },
    })

    expect(resolvePilotNexusOrigin(event)).toBe('http://127.0.0.1:3200')
  })

  it('开发环境允许通过进程环境变量覆盖默认 origin', () => {
    clearTestEnv()
    process.env.NODE_ENV = 'development'
    process.env.NUXT_PUBLIC_NEXUS_ORIGIN = 'http://127.0.0.1:3300'
    const event = createEvent({
      cloudflareEnv: {
        NUXT_PUBLIC_NEXUS_ORIGIN: 'https://tuff.tagzxia.com',
      },
    })

    expect(resolvePilotNexusOrigin(event)).toBe('http://127.0.0.1:3300')
  })

  it('生产环境优先读取 cloudflare origin', () => {
    clearTestEnv()
    process.env.NODE_ENV = 'production'
    process.env.NUXT_PUBLIC_NEXUS_ORIGIN = 'http://127.0.0.1:3200'
    const event = createEvent({
      cloudflareEnv: {
        NUXT_PUBLIC_NEXUS_ORIGIN: 'https://tuff.tagzxia.com',
      },
    })

    expect(resolvePilotNexusOrigin(event)).toBe('https://tuff.tagzxia.com')
  })

  it('internal origin 解析遵循 internal -> public 回退顺序', () => {
    clearTestEnv()
    process.env.NODE_ENV = 'production'
    const event = createEvent({
      cloudflareEnv: {
        NUXT_PUBLIC_NEXUS_ORIGIN: 'https://public.example.com',
        PILOT_NEXUS_INTERNAL_ORIGIN: 'https://internal.example.com',
      },
    })

    expect(resolvePilotNexusOrigin(event, { internal: true })).toBe('https://internal.example.com')
  })
})
