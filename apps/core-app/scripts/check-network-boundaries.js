#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const sourceRoot = path.join(projectRoot, 'src')

const ALLOWED_FILES = new Set([
  'main/modules/ai/provider-models.ts',
  'main/modules/analytics/analytics-module.ts',
  'main/modules/analytics/startup-analytics.ts',
  'main/modules/auth/index.ts',
  'main/modules/box-tool/addon/preview/providers/fx-rate-provider.ts',
  'main/modules/build-verification/index.ts',
  'main/modules/download/network-monitor.ts',
  'main/modules/file-protocol/index.ts',
  'main/modules/network/network-service.ts',
  'main/modules/plugin/plugin.ts',
  'main/modules/plugin/providers/tpex-provider.ts',
  'main/modules/sentry/sentry-service.ts',
  'main/modules/system-update/index.ts',
  'main/modules/update/UpdateService.ts',
  'main/modules/update/update-system.ts',
  'main/service/protocol-handler.ts',
  'main/utils/release-signature.ts',
  'renderer/src/components/base/input/FlatCompletion.vue',
  'renderer/src/components/render/addon/preview/CodePreview.vue',
  'renderer/src/components/render/addon/preview/MarkdownPreview.vue',
  'renderer/src/components/render/addon/preview/TextPreview.vue',
  'renderer/src/composables/store/useStoreRating.ts',
  'renderer/src/composables/store/useStoreReadme.ts',
  'renderer/src/modules/hooks/useSvgContent.ts',
  'renderer/src/modules/lang/i18n.ts',
  'renderer/src/modules/layout/useWallpaper.ts',
  'renderer/src/modules/update/CustomUpdateProvider.ts',
  'renderer/src/modules/update/GithubUpdateProvider.ts',
  'renderer/src/modules/update/OfficialUpdateProvider.ts'
])

const PATTERN = /(import\s+axios\s+from\s+['"]axios['"]|\baxios\.|\bfetch\()/m
const TARGET_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue'])

function walk(dir, result = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(absolute, result)
      continue
    }
    if (!TARGET_EXTENSIONS.has(path.extname(entry.name))) {
      continue
    }
    result.push(absolute)
  }
  return result
}

const violations = []
for (const filePath of walk(sourceRoot)) {
  const relativePath = path.relative(sourceRoot, filePath).replace(/\\/g, '/')
  const content = fs.readFileSync(filePath, 'utf-8')

  if (!PATTERN.test(content)) {
    continue
  }

  if (!ALLOWED_FILES.has(relativePath)) {
    violations.push(relativePath)
  }
}

if (violations.length > 0) {
  console.error('[network-boundary] Found disallowed direct fetch/axios usage:')
  for (const filePath of violations) {
    console.error(` - ${filePath}`)
  }
  process.exit(1)
}

console.log('[network-boundary] OK: no new direct fetch/axios entrypoints detected.')
