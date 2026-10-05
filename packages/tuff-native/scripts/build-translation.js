'use strict'

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')

const universal = process.argv.includes('--universal')
if (process.platform !== 'darwin' || (!universal && Number.parseInt(os.release(), 10) < 25)) {
  console.log('[build-translation] macOS 26 or newer is required; skipping on this host')
  process.exit(0)
}
const root = path.resolve(__dirname, '..')
const source = path.join(root, 'native-translation', 'TranslationHelper.swift')
const output = path.join(root, 'build', 'Release', 'tuff-native-translation')
const architectures = universal ? ['arm64', 'x86_64'] : [process.arch === 'x64' ? 'x86_64' : 'arm64']
if (fs.existsSync(output) && fs.statSync(output).mtimeMs >= fs.statSync(source).mtimeMs) {
  try {
    execFileSync('lipo', ['-verify_arch', ...architectures, output], { stdio: 'pipe' })
    fs.accessSync(output, fs.constants.X_OK)
    console.log(`[build-translation] Reusing ${architectures.join('+')} helper`)
    process.exit(0)
  }
  catch {}
}
const sdkVersion = execFileSync('xcrun', ['--show-sdk-version'], { encoding: 'utf8' }).trim()
if (Number.parseInt(sdkVersion, 10) < 26)
  throw new Error('Apple Translation helper requires the macOS 26 SDK or newer')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-translation-build-'))
try {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const binaries = architectures.map((arch) => {
    const binary = path.join(temporary, `translation-${arch}`)
    execFileSync('xcrun', ['swiftc', '-parse-as-library', '-O', '-target', `${arch}-apple-macos26.0`, '-module-cache-path', path.join(temporary, 'modules'), source, '-o', binary], { stdio: 'inherit' })
    return binary
  })
  if (binaries.length === 1)
    fs.copyFileSync(binaries[0], output)
  else execFileSync('lipo', ['-create', ...binaries, '-output', output], { stdio: 'inherit' })
  fs.chmodSync(output, 0o755)
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', output], { stdio: 'inherit' })
  console.log(`[build-translation] Built ${architectures.join('+')} helper: ${output}`)
}
finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
