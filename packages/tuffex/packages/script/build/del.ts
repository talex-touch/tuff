import fs from 'node:fs'

export async function delPath(path: string) {
  if (!fs.existsSync(path))
    return

  fs.rmSync(path, { recursive: true, force: true })
}
