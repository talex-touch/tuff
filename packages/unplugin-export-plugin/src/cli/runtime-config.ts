import type { Locale } from './i18n'
import path from 'node:path'
import process from 'node:process'
import fs from 'fs-extra'

export interface CliRuntimeConfig {
  locale?: Locale
  onboardingCompleted?: boolean
  termsAcceptedAt?: string
}

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || process.cwd()
}

export function getCliConfigPath(): string {
  return path.join(getHomeDir(), '.tuff', 'cli.json')
}

export async function readCliConfig(): Promise<CliRuntimeConfig> {
  const configPath = getCliConfigPath()
  try {
    if (await fs.pathExists(configPath)) {
      const data = await fs.readJson(configPath)
      return typeof data === 'object' && data ? data : {}
    }
  }
  catch {
    // Ignore
  }
  return {}
}

export async function writeCliConfig(partial: Partial<CliRuntimeConfig>): Promise<CliRuntimeConfig> {
  const configPath = getCliConfigPath()
  const current = await readCliConfig()
  const next = { ...current, ...partial }
  await fs.ensureDir(path.dirname(configPath))
  await fs.writeJson(configPath, next, { spaces: 2 })
  return next
}
