#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

function readCurrentSdkVersion() {
  const filePath = join(rootDir, 'packages/utils/plugin/sdk-version.ts')
  const content = readFileSync(filePath, 'utf8')
  const match = content.match(/CURRENT_SDK_VERSION:\s*SdkApiVersion\s*=\s*SdkApi\.V(\d{6})/)
  if (!match) {
    throw new Error('Failed to locate CURRENT_SDK_VERSION in sdk-version.ts')
  }
  return match[1]
}

function formatSdkDate(version) {
  const padded = String(version).padStart(6, '0')
  const year = `20${padded.slice(0, 2)}`
  const month = padded.slice(2, 4)
  const day = padded.slice(4, 6)
  return `${year}-${month}-${day}`
}

function updateFile(filePath, updater) {
  const content = readFileSync(filePath, 'utf8')
  const next = updater(content)
  if (next !== content) {
    writeFileSync(filePath, next)
  }
}

const currentVersion = readCurrentSdkVersion()
const currentDate = formatSdkDate(currentVersion)

const manifestDocs = [
  'apps/nexus/content/docs/dev/reference/manifest.zh.mdc',
  'apps/nexus/content/docs/dev/reference/manifest.en.mdc',
]

for (const doc of manifestDocs) {
  updateFile(join(rootDir, doc), (content) => {
    let next = content
    next = next.replace(
      /\*\*当前版本\*\*:\s*`(\d{6})`\s*\((\d{4}-\d{2}-\d{2})\)/g,
      `**当前版本**: \`${currentVersion}\` (${currentDate})`,
    )
    next = next.replace(
      /\*\*Current version\*\*:\s*`(\d{6})`\s*\((\d{4}-\d{2}-\d{2})\)/g,
      `**Current version**: \`${currentVersion}\` (${currentDate})`,
    )
    next = next.replace(
      /YYMMDD（如\s*\d{6}）/g,
      `YYMMDD（如 ${currentVersion}）`,
    )
    next = next.replace(
      /YYMMDD \(e\.g\.,?\s*\d{6}\)/g,
      `YYMMDD (e.g., ${currentVersion})`,
    )
    next = next.replace(
      /"sdkapi":\s*\d{6}/g,
      `"sdkapi": ${currentVersion}`,
    )
    return next
  })
}

const permissionDocs = [
  'apps/nexus/content/docs/dev/api/permission.zh.mdc',
  'apps/nexus/content/docs/dev/api/permission.en.mdc',
]

for (const doc of permissionDocs) {
  updateFile(join(rootDir, doc), (content) => {
    let next = content
    next = next.replace(
      /\*\*当前版本\*\*:\s*`(\d{6})`\s*\((\d{4}-\d{2}-\d{2})\)/g,
      `**当前版本**: \`${currentVersion}\` (${currentDate})`,
    )
    next = next.replace(
      /\*\*Current version\*\*:\s*`(\d{6})`\s*\((\d{4}-\d{2}-\d{2})\)/g,
      `**Current version**: \`${currentVersion}\` (${currentDate})`,
    )
    return next
  })
}

console.log(`[sdkapi-docs] synced CURRENT_SDK_VERSION=${currentVersion}`)
