const path = require('node:path')

const PLUGIN_RELEASE_TARGETS = Object.freeze([
  Object.freeze({
    pluginName: 'clipboard-history',
    packageName: '@talex-touch/clipboard-history-plugin',
    root: path.join('plugins', 'clipboard-history'),
    manifest: 'manifest.json',
    bundledProjection: path.join('apps', 'core-app', 'resources', 'bundled-plugins', 'clipboard-history'),
    gates: Object.freeze({
      build: Object.freeze({ command: 'pnpm', args: ['run', 'build'] }),
      test: Object.freeze({ command: 'pnpm', args: ['run', 'test'] }),
      typecheck: Object.freeze({ command: 'pnpm', args: ['run', 'typecheck'] }),
      lint: Object.freeze({
        notApplicable: true,
        reason: 'The package has an ESLint configuration but no standalone lint script; repository scoped lint covers its maintained source.',
      }),
    }),
  }),
  Object.freeze({
    pluginName: 'touch-quickops',
    packageName: '@talex-touch/touch-quickops-plugin',
    root: path.join('plugins', 'touch-quickops'),
    manifest: 'manifest.json',
    bundledProjection: path.join('apps', 'core-app', 'resources', 'bundled-plugins', 'touch-quickops'),
    gates: Object.freeze({
      build: Object.freeze({ command: 'pnpm', args: ['run', 'build'] }),
      test: Object.freeze({ command: 'pnpm', args: ['run', 'test'] }),
      typecheck: Object.freeze({
        notApplicable: true,
        reason: 'The package ships a JavaScript Prelude and declares no standalone typecheck script.',
      }),
      lint: Object.freeze({
        notApplicable: true,
        reason: 'The package declares no standalone lint script; repository plugin lint covers its maintained source.',
      }),
    }),
  }),
  Object.freeze({
    pluginName: 'touch-snippets',
    packageName: '@talex-touch/touch-snippets-plugin',
    root: path.join('plugins', 'touch-snippets'),
    manifest: 'manifest.json',
    bundledProjection: path.join('apps', 'core-app', 'resources', 'bundled-plugins', 'touch-snippets'),
    gates: Object.freeze({
      build: Object.freeze({ command: 'pnpm', args: ['run', 'build'] }),
      test: Object.freeze({ command: 'pnpm', args: ['run', 'test'] }),
      typecheck: Object.freeze({
        notApplicable: true,
        reason: 'The package ships a JavaScript Prelude and declares no standalone typecheck script.',
      }),
      lint: Object.freeze({
        notApplicable: true,
        reason: 'The package declares no standalone lint script; repository plugin lint covers its maintained source.',
      }),
    }),
  }),
  Object.freeze({
    pluginName: 'touch-translation',
    packageName: '@talex-touch/touch-translation-plugin',
    root: path.join('plugins', 'touch-translation'),
    manifest: 'manifest.json',
    bundledProjection: path.join('apps', 'core-app', 'resources', 'bundled-plugins', 'touch-translation'),
    gates: Object.freeze({
      build: Object.freeze({ command: 'pnpm', args: ['run', 'build'] }),
      test: Object.freeze({ command: 'pnpm', args: ['exec', 'vitest', 'run'] }),
      typecheck: Object.freeze({ command: 'pnpm', args: ['run', 'typecheck'] }),
      lint: Object.freeze({ command: 'pnpm', args: ['run', 'lint'] }),
    }),
  }),
  Object.freeze({
    pluginName: 'touch-intelligence',
    packageName: '@talex-touch/touch-intelligence-plugin',
    root: path.join('plugins', 'touch-intelligence'),
    manifest: 'manifest.json',
    bundledProjection: path.join('apps', 'core-app', 'resources', 'bundled-plugins', 'touch-intelligence'),
    gates: Object.freeze({
      build: Object.freeze({ command: 'pnpm', args: ['run', 'build'] }),
      test: Object.freeze({
        notApplicable: true,
        reason: 'The package currently has no test script or test files; runtime behavior is covered by CoreApp official-plugin integration tests.',
      }),
      typecheck: Object.freeze({
        notApplicable: true,
        reason: 'The package currently ships precompiled JavaScript and declares no standalone typecheck script.',
      }),
      lint: Object.freeze({
        notApplicable: true,
        reason: 'The package currently declares no standalone lint script; repository lint still covers shared code.',
      }),
    }),
  }),
])

const PLUGIN_RELEASE_PREREQUISITES = Object.freeze([
  '@talex-touch/tuff-cli-core',
  '@talex-touch/unplugin-export-plugin',
  '@talex-touch/tuff-cli',
  '@talex-touch/tuffex',
])

module.exports = {
  PLUGIN_RELEASE_PREREQUISITES,
  PLUGIN_RELEASE_TARGETS,
}
