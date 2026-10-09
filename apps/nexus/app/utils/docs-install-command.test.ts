import { describe, expect, it } from 'vitest'
import { formatInstallCommand, PACKAGE_MANAGERS, parseInstallCommand } from './docs-install-command'

const all = (code: string) => {
  const parsed = parseInstallCommand(code, 'bash')
  return parsed && Object.fromEntries(PACKAGE_MANAGERS.map(m => [m, formatInstallCommand(parsed, m)]))
}

describe('docs install command', () => {
  it('translates a plain add for every manager', () => {
    expect(all('pnpm add @talex-touch/tuffex')).toEqual({
      pnpm: 'pnpm add @talex-touch/tuffex',
      npm: 'npm install @talex-touch/tuffex',
      yarn: 'yarn add @talex-touch/tuffex',
      bun: 'bun add @talex-touch/tuffex',
    })
  })

  it('keeps a dev install a dev install, in each manager\'s spelling', () => {
    expect(all('pnpm add -D @talex-touch/unplugin-export-plugin')).toEqual({
      pnpm: 'pnpm add -D @talex-touch/unplugin-export-plugin',
      npm: 'npm install -D @talex-touch/unplugin-export-plugin',
      yarn: 'yarn add -D @talex-touch/unplugin-export-plugin',
      bun: 'bun add -d @talex-touch/unplugin-export-plugin',
    })
  })

  it('maps dlx to each manager\'s runner', () => {
    expect(all('pnpm dlx create-tuff-plugin my-plugin')).toEqual({
      pnpm: 'pnpm dlx create-tuff-plugin my-plugin',
      npm: 'npx create-tuff-plugin my-plugin',
      yarn: 'yarn dlx create-tuff-plugin my-plugin',
      bun: 'bunx create-tuff-plugin my-plugin',
    })
  })

  it('carries a dlx command\'s arguments over exactly as written', () => {
    expect(all('pnpm dlx tool "hello  world" --flag=\'a b\'')).toEqual({
      pnpm: 'pnpm dlx tool "hello  world" --flag=\'a b\'',
      npm: 'npx tool "hello  world" --flag=\'a b\'',
      yarn: 'yarn dlx tool "hello  world" --flag=\'a b\'',
      bun: 'bunx tool "hello  world" --flag=\'a b\'',
    })
  })

  it('leaves anything it cannot translate faithfully as written', () => {
    expect(parseInstallCommand('pnpm add -g @talex-touch/tuffex', 'bash')).toBeNull() // other flags
    expect(parseInstallCommand('pnpm add @a/b --filter docs', 'bash')).toBeNull()
    expect(parseInstallCommand('pnpm dlx create-tuff-plugin my-plugin\ncd my-plugin\npnpm install', 'bash')).toBeNull() // several lines
    expect(parseInstallCommand('pnpm build', 'bash')).toBeNull()
    expect(parseInstallCommand('npm install @talex-touch/tuffex', 'bash')).toBeNull() // only pnpm is the source form
    expect(parseInstallCommand('pnpm add @talex-touch/tuffex', 'typescript')).toBeNull()
    expect(parseInstallCommand('pnpm add "@scope/pkg@>=1  <2"', 'bash')).toBeNull() // quoting
  })
})
