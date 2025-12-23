import fs from 'node:fs'
import { resolve } from 'node:path'
import { rootPath } from './path'

const stayFile = ['package.json', 'README.md']

export async function delPath(path: string) {
  let files: string[] = []

  if (fs.existsSync(path)) {
    files = fs.readdirSync(path)

    files.forEach(async (file) => {
      const currentPath = resolve(path, file)

      if (fs.statSync(currentPath).isDirectory()) {
        if (file !== 'node_modules') await delPath(currentPath)
      }
      else {
        if (!stayFile.includes(file)) fs.unlinkSync(currentPath)
      }
    })

    if (path !== `${rootPath}/dist`) fs.rmdirSync(path)
  }
}
