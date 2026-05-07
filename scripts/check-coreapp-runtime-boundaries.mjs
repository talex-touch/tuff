#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_IGNORE_DIRS, TARGET_CODE_EXTENSIONS } from './lib/scan-config.mjs'
import { normalizeRelativePath, walk } from './lib/file-scan.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const scanRoot = 'apps/core-app/src'

const ignoredFilePattern = /(?:^|[./-])(?:test|spec)\.[cm]?[jt]sx?$/

const ruleDefs = [
  {
    id: 'loose-web-preferences',
    description: 'Disallow loose Electron WebPreferences outside named security profiles.',
    matcher:
      /\b(?:webSecurity\s*:\s*false|nodeIntegration\s*:\s*true|nodeIntegrationInSubFrames\s*:\s*true|contextIsolation\s*:\s*false|sandbox\s*:\s*false|webviewTag\s*:\s*true)\b/g,
    allowFiles: new Set(['apps/core-app/src/main/core/window-security-profile.ts'])
  },
  {
    id: 'raw-ipc-event-string',
    description: 'Keep raw IPC transport channel strings inside the internal adapter.',
    matcher: /@(?:main|plugin)-process-message/g,
    allowFiles: new Set(['apps/core-app/src/shared/ipc/raw-channel.ts'])
  },
  {
    id: 'bare-ipc-renderer',
    description: 'Disallow direct ipcRenderer access outside preload and the renderer channel adapter.',
    matcher: /\bipcRenderer\b/g,
    allowFiles: new Set([
      'apps/core-app/src/preload/index.ts',
      'apps/core-app/src/renderer/src/modules/channel/channel-core.ts'
    ])
  },
  {
    id: 'bare-ipc-main',
    description: 'Disallow direct ipcMain access outside internal main-process adapters.',
    matcher: /\bipcMain\b/g,
    allowFiles: new Set([
      'apps/core-app/src/main/core/channel-core.ts',
      'apps/core-app/src/main/utils/perf-monitor.ts'
    ])
  },
  {
    id: 'renderer-touch-channel-global',
    description: 'Disallow new business use of window.touchChannel.',
    matcher: /\bwindow\s*\.\s*touchChannel\b/g,
    allowFiles: new Set(['apps/core-app/src/renderer/src/modules/channel/channel-core.ts'])
  },
  {
    id: 'electron-ipc-renderer-global',
    description: 'Disallow window.electron.ipcRenderer outside the renderer channel adapter.',
    matcher: /\bwindow\s*\.\s*electron\s*\.\s*ipcRenderer\b/g,
    allowFiles: new Set(['apps/core-app/src/renderer/src/modules/channel/channel-core.ts'])
  },
  {
    id: 'renderer-global-i18n',
    description: 'Disallow window.$t/window.$i18n renderer globals.',
    matcher: /\bwindow\s*\.\s*\$(?:t|i18n)\b/g,
    allowFiles: new Set()
  },
  {
    id: 'old-sync-api-path',
    description: 'Disallow new /api/sync/* dependencies; use /api/v1/sync/*.',
    matcher: /\/api\/sync\//g,
    allowFiles: new Set()
  }
]

function countMatches(content, matcher) {
  const regex = new RegExp(matcher.source, matcher.flags)
  let count = 0
  while (regex.exec(content)) {
    count += 1
  }
  return count
}

function shouldScan(relativePath) {
  return !ignoredFilePattern.test(relativePath)
}

function collectFindings() {
  const findings = []
  const files = walk(path.join(workspaceRoot, scanRoot), {
    ignoreDirs: DEFAULT_IGNORE_DIRS,
    targetExtensions: TARGET_CODE_EXTENSIONS,
    includeDts: true
  })

  for (const filePath of files) {
    const relativePath = normalizeRelativePath(workspaceRoot, filePath)
    if (!shouldScan(relativePath)) {
      continue
    }

    const content = fs.readFileSync(filePath, 'utf8')
    for (const rule of ruleDefs) {
      if (rule.allowFiles.has(relativePath)) {
        continue
      }
      const count = countMatches(content, rule.matcher)
      if (count > 0) {
        findings.push({
          rule: rule.id,
          description: rule.description,
          file: relativePath,
          count
        })
      }
    }
  }

  return findings
}

function main() {
  const findings = collectFindings()
  if (findings.length === 0) {
    console.log('[coreapp-runtime-boundary] OK')
    return
  }

  console.error('[coreapp-runtime-boundary] Runtime boundary violations detected:')
  for (const finding of findings) {
    console.error(
      ` - ${finding.rule}: ${finding.file} (${finding.count}) - ${finding.description}`
    )
  }
  process.exitCode = 1
}

main()
