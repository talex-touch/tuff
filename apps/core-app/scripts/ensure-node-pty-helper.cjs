const fs = require('node:fs')
const path = require('node:path')

if (process.platform !== 'win32') {
  const entry = require.resolve('node-pty')
  const helper = path.resolve(
    path.dirname(entry),
    '..',
    'prebuilds',
    `${process.platform}-${process.arch}`,
    'spawn-helper'
  )
  if (!fs.existsSync(helper)) {
    throw new Error(`node-pty spawn-helper is missing for ${process.platform}-${process.arch}`)
  }
  fs.chmodSync(helper, 0o755)
}
