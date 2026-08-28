import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SourceFile } from './repo'

/**
 * Byte-exact copies of the code that shipped each bug, frozen as `.txt` so that
 * neither Nuxt's component scanner, ESLint, nor `vitest`'s SFC handling ever
 * touches them.
 *
 * They exist because every guard needs a positive control, and `git show
 * HEAD:<path>` cannot serve as one: the moment the fixes land on `master`,
 * `HEAD` stops containing the bug and the control silently stops proving
 * anything. Line numbers below are the real line numbers in the original file.
 */
export interface HistoricalFixture {
  /** Fixture file name inside `test/guards/fixtures/`. */
  fixture: string
  /** `apps/nexus`-relative path the fixture was taken from. */
  originalPath: string
  /** Git blob sha of the buggy content, resolvable with `git cat-file -p <sha>`. */
  blob: string
  /** What the guard is expected to find, and where. */
  expectation: string
}

export const historicalFixtures = {
  componentAutoImportSubscriptions: {
    fixture: 'subscriptions.buggy.vue.txt',
    originalPath: 'app/pages/dashboard/admin/subscriptions.vue',
    blob: '12f1fe05f181fdf956d12cd790a6b9373fdde947',
    expectation: '<AccountTabs /> at line 389 resolves to nothing (auto-import name is DashboardAdminAccountTabs)',
  },
  componentAutoImportDocComments: {
    fixture: 'doc-comments.buggy.vue.txt',
    originalPath: 'app/pages/dashboard/admin/doc-comments.vue',
    blob: 'd68ce8dfbd331b4ef52590eb2d976eee7eebea66',
    expectation: '<CommentTabs /> at line 232 resolves to nothing (auto-import name is DashboardAdminCommentTabs)',
  },
  formSubmitButton: {
    fixture: 'intelligence-chat.buggy.vue.txt',
    originalPath: 'app/pages/dashboard/admin/intelligence-chat.vue',
    blob: '18aada7403ac6ce21c8cfeb5680b4e8d8a8896f9',
    expectation: 'TxButton at line 246 inside the @submit.prevent form has neither native-type nor @click',
  },
  featureFlagCoercion: {
    fixture: 'feature-gates.global.buggy.ts.txt',
    originalPath: 'app/middleware/feature-gates.global.ts',
    blob: '45b48a9631c527e82d12350b45756d1737bf7e05',
    expectation: 'runtimeConfig.public?.riskControl?.enabled === true at line 13 rejects the number 1',
  },
  pageTopLevelThrow: {
    fixture: 'intelligence-lab.buggy.vue.txt',
    originalPath: 'app/pages/dashboard/admin/intelligence-lab.vue',
    blob: '1ef54f622a7e4ca7f5d5b5a6c8f2b65d01835294',
    expectation: 'throw createError(...) at line 11 runs at <script setup> top level',
  },
  i18nFallbackMismatch: {
    fixture: 'risk.buggy.vue.txt',
    originalPath: 'app/pages/dashboard/admin/risk.vue',
    blob: 'b290a624b0b2d20ba7dc3c6e701f966bfc98fded',
    expectation: 't(\'dashboard.sections.analytics.title\', \'Risk Control\') at line 146 contradicts the locale value',
  },
} as const satisfies Record<string, HistoricalFixture>

const fixturesDir = fileURLToPath(new URL('../fixtures/', import.meta.url))

/**
 * Load a frozen fixture as a `SourceFile` addressed by its original path, so
 * guard output during a positive control reads exactly like a real finding.
 */
export function loadHistoricalFixture(entry: HistoricalFixture): SourceFile {
  return {
    path: entry.originalPath,
    content: readFileSync(`${fixturesDir}${entry.fixture}`, 'utf8'),
  }
}
