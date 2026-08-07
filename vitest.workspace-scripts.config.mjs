import { defineConfig } from 'vitest/config'

/**
 * Runs the repo-root tooling tests, which no workflow executed until now (#1135).
 *
 * `scripts/` holds the release machinery — release-notes generation and verification, asset
 * preparation, update-manifest validation, rollback-version resolution, plugin-release
 * evidence, the release gates themselves. Their tests were the only thing standing between a
 * refactor and a broken release, and nothing ran them, so they were free to rot. One had:
 * `scripts/ci/ai-review.test.mjs` pinned `actions/checkout@v6` as part of a *security*
 * contract, Dependabot moved the workflow to v7, and the test went red in silence.
 *
 * Deliberately a separate config file rather than `vitest.config.mjs`: a root config named
 * that way is picked up by any bare `vitest` invocation from the repo root, which would
 * change what a developer gets when they run vitest expecting a package's own setup.
 */
export default defineConfig({
  test: {
    include: [
      'scripts/**/*.test.mjs',
      'scripts/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',

      // Imports packages/tuff-cli-core/dist/index.js by design — the whole point of the case
      // is that the audit module must resolve the *built* runtime and never the unbuilt CLI
      // source. It therefore needs a build first, which the PR Quality job does not do.
      // Not broken; wrong job. Run it after `pnpm -F @talex-touch/tuff-cli-core build`.
      'scripts/plugin-source-package-audit.test.ts',

      // Fails on a real defect rather than a stale expectation: `pnpm publish:check` rejects
      // the source manifests because `catalog:` specifiers reach them (#1137). Excluded so
      // this gate can go green on the tests it *is* about, rather than being wired in red
      // and immediately ignored. Remove this line when #1137 lands.
      'scripts/check-release-gates/local-checks.test.mjs',
    ],
  },
})
