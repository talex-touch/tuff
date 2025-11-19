import fs from 'node:fs'
import path from 'node:path'
import fse from 'fs-extra'

export function genFileTree(basePath: string, depth: number = 0, options = {
  maxDepth: 1,
  ignores: [
    'node_modules',
    '.git',
    '.vscode',
    '.idea',
    '.github',
    '.gitignore',
  ],
}) {
  if (depth > options.maxDepth)
    return
  const name = path.basename(basePath)

  if (options.ignores.includes(name))
    return

  if (depth === 0) {
    console.log('Touch tree helper: ')
    console.log(` > ${name}:`)
  }

  fse.readdirSync(basePath).forEach((file) => {
    const fullPath = path.join(basePath, file)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      console.log(`   ├${'─'.repeat(depth + 2)} ${file}:`)
      genFileTree(fullPath, depth + 1)
    }
    else {
      console.log(`       ├${'─'.repeat(depth * 2)} ${file}`)
    }
  })
}
