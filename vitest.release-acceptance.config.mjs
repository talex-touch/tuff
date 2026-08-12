import { defineConfig } from 'vitest/config'

/**
 * The release-acceptance tests, which only hold on an Apple-silicon Mac.
 *
 * `scripts/lib/update-downgrade-evidence.mjs:122` permits `executionMode: 'runtime'` for
 * `darwin/arm64` and nothing else — every other pair must be static-only, because the release
 * acceptance host *is* an Apple-silicon Mac. That is the specification, not an accident: the
 * suite carries a dedicated rejection case for `'a fake Linux runtime pass'`.
 *
 * So these two files cannot pass on `ubuntu-latest`, and the main script-test gate
 * (vitest.workspace-scripts.config.mjs) excludes them. Excluding them was honest but left the
 * contract untested everywhere, which is the same hole #1135 had just closed one layer up.
 * This config gives them the runner they actually need (#1139).
 *
 * Kept separate rather than merged into the main config with a platform guard: a `skipIf`
 * would report green on Linux while executing nothing, which is precisely the state that
 * let `actions/checkout@v6` rot inside a security contract.
 */
export default defineConfig({
  test: {
    include: [
      'scripts/validate-update-downgrade-evidence.test.mjs',
      'scripts/generate-release-test-summary.test.mjs',
    ],
  },
})
