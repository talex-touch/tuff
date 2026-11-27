'use strict'

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

if (process.platform !== 'darwin') {
  throw new Error('The native macOS update helper must be built on macOS')
}
const universal = process.argv.includes('--universal')
const root = path.resolve(__dirname, '..')
const source = path.join(root, 'native-update', 'update.c')
const output = path.join(root, 'build', 'Release', 'tuff-native-update')
const architectures = universal ? ['arm64', 'x86_64'] : [process.arch === 'x64' ? 'x86_64' : 'arm64']
const newestInput = Math.max(fs.statSync(source).mtimeMs, fs.statSync(__filename).mtimeMs)
if (fs.existsSync(output) && fs.lstatSync(output).isFile() && fs.statSync(output).mtimeMs >= newestInput) {
  try {
    execFileSync('lipo', [output, '-verify_arch', ...architectures], { stdio: 'pipe' })
    execFileSync('codesign', ['--verify', '--strict', output], { stdio: 'pipe' })
    fs.accessSync(output, fs.constants.X_OK)
    console.log(`[build-update] Reusing ${architectures.join('+')} helper`)
    process.exit(0)
  }
  catch {}
}
fs.mkdirSync(path.dirname(output), { recursive: true })
const temporary = fs.mkdtempSync(path.join(path.dirname(output), '.tuff-update-build-'))
try {
  const binaries = architectures.map((arch) => {
    const binary = path.join(temporary, `update-${arch}`)
    execFileSync('xcrun', [
      'clang',
      '-std=c11',
      '-O2',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-target',
      `${arch}-apple-macos11.0`,
      source,
      '-o',
      binary,
    ], { stdio: 'inherit' })
    return binary
  })
  const staged = path.join(temporary, 'tuff-native-update')
  if (binaries.length === 1)
    fs.renameSync(binaries[0], staged)
  else execFileSync('lipo', ['-create', ...binaries, '-output', staged], { stdio: 'inherit' })
  fs.chmodSync(staged, 0o755)
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', staged], { stdio: 'inherit' })
  // Replace rather than truncate an executable a detached updater may still be running.
  fs.renameSync(staged, output)
  console.log(`[build-update] Built ${architectures.join('+')} helper: ${output}`)
}
finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
