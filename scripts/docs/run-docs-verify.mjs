import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'tuff-docs-verify-'))
const outputFile = path.join(tempDir, 'vitest-output.txt')

try {
  const test = spawnSync('corepack', ['pnpm', 'exec', 'vitest', 'run', 'scripts/docs.test.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  writeFileSync(outputFile, `${test.stdout ?? ''}${test.stderr ?? ''}`, 'utf8')
  if (test.error || test.status !== 0) {
    process.stdout.write(readFileSync(outputFile, 'utf8'))
    process.exitCode = test.status ?? 1
  }
  else {
    const verifier = spawnSync(process.execPath, ['scripts/docs/verify-docs.mjs'], { cwd: process.cwd(), stdio: 'inherit' })
    if (verifier.error)
      throw verifier.error
    process.exitCode = verifier.status ?? 1
  }
}
finally {
  rmSync(tempDir, { recursive: true, force: true })
}
