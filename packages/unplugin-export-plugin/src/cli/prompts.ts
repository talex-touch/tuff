import type { Locale } from './i18n'
import * as readline from 'node:readline'
import { setLocale, t } from './i18n'

export interface SelectOption<T = string> {
  label: string
  value: T
  hint?: string
}

/**
 * Create readline interface
 */
function createRL(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

/**
 * Clear current line and move cursor up
 */
function clearLine(): void {
  process.stdout.write('\x1B[1A\x1B[2K')
}

function clearRenderedLines(count: number): void {
  if (count <= 0)
    return
  readline.moveCursor(process.stdout, 0, -(count - 1))
  readline.cursorTo(process.stdout, 0)
  readline.clearScreenDown(process.stdout)
}

function canUseArrowSelect(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

/**
 * Print styled text
 */
export function print(text: string): void {
  console.log(text)
}

/**
 * Print with color (ANSI escape codes)
 */
export const colors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  cyan: '\x1B[36m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  red: '\x1B[31m',
  blue: '\x1B[34m',
  magenta: '\x1B[35m',
  gray: '\x1B[90m',
}

export function styled(text: string, ...styles: string[]): string {
  return styles.join('') + text + colors.reset
}

/**
 * Ask a simple text question
 */
export async function askText(
  question: string,
  options?: {
    defaultValue?: string
    hint?: string
    validate?: (value: string) => boolean | string
  },
): Promise<string> {
  const rl = createRL()

  return new Promise((resolve) => {
    const hint = options?.hint ? styled(` (${options.hint})`, colors.dim) : ''
    const defaultHint = options?.defaultValue ? styled(` [${options.defaultValue}]`, colors.gray) : ''
    const prompt = `${styled('?', colors.cyan)} ${question}${hint}${defaultHint} `

    const ask = () => {
      rl.question(prompt, (answer) => {
        const value = answer.trim() || options?.defaultValue || ''

        if (options?.validate) {
          const result = options.validate(value)
          if (result !== true) {
            console.log(styled(`  ${typeof result === 'string' ? result : 'Invalid input'}`, colors.red))
            ask()
            return
          }
        }

        rl.close()
        resolve(value)
      })
    }

    ask()
  })
}

/**
 * Ask a yes/no question
 */
export async function askConfirm(
  question: string,
  defaultValue = true,
): Promise<boolean> {
  const rl = createRL()

  return new Promise((resolve) => {
    const hint = defaultValue ? 'Y/n' : 'y/N'
    const prompt = `${styled('?', colors.cyan)} ${question} ${styled(`(${hint})`, colors.dim)} `

    rl.question(prompt, (answer) => {
      rl.close()
      const value = answer.trim().toLowerCase()
      if (value === '') {
        resolve(defaultValue)
      }
      else {
        resolve(value === 'y' || value === 'yes')
      }
    })
  })
}

/**
 * Select from a list of options
 */
export async function askSelect<T = string>(
  question: string,
  options: SelectOption<T>[],
): Promise<T> {
  if (!canUseArrowSelect()) {
    const rl = createRL()
    console.log(`${styled('?', colors.cyan)} ${question}`)

    options.forEach((opt, index) => {
      const num = styled(`  ${index + 1})`, colors.cyan)
      const hint = opt.hint ? styled(` - ${opt.hint}`, colors.dim) : ''
      console.log(`${num} ${opt.label}${hint}`)
    })

    return new Promise((resolve) => {
      const prompt = styled('  Enter choice (number): ', colors.dim)

      const ask = () => {
        rl.question(prompt, (answer) => {
          const num = Number.parseInt(answer.trim(), 10)
          if (num >= 1 && num <= options.length) {
            rl.close()
            resolve(options[num - 1].value)
          }
          else {
            console.log(styled(`  Please enter a number between 1 and ${options.length}`, colors.red))
            ask()
          }
        })
      }

      ask()
    })
  }

  const rl = createRL()
  readline.emitKeypressEvents(process.stdin, rl)
  process.stdin.setRawMode(true)
  process.stdin.resume()

  let selectedIndex = 0
  let firstRender = true
  const renderedLines = options.length + 2

  return new Promise((resolve) => {
    const render = () => {
      if (!firstRender) {
        clearRenderedLines(renderedLines)
      }
      console.log(`${styled('?', colors.cyan)} ${question}`)
      options.forEach((opt, index) => {
        const isSelected = index === selectedIndex
        const prefix = isSelected ? styled('›', colors.cyan) : ' '
        const label = isSelected ? styled(opt.label, colors.bold) : opt.label
        const hint = opt.hint ? styled(` - ${opt.hint}`, colors.dim) : ''
        console.log(`  ${prefix} ${label}${hint}`)
      })
      console.log(styled(`  ${t('prompt.selectHint')}`, colors.dim))
      firstRender = false
    }

    function finish(value: T) {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener('keypress', onKeypress)
      rl.close()
      resolve(value)
    }

    function onKeypress(input: string, key: readline.Key) {
      if (key?.name === 'up' || key?.name === 'k') {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length
        render()
        return
      }
      if (key?.name === 'down' || key?.name === 'j') {
        selectedIndex = (selectedIndex + 1) % options.length
        render()
        return
      }
      if (key?.name === 'return' || key?.name === 'enter') {
        finish(options[selectedIndex].value)
        return
      }
      if (key?.ctrl && key?.name === 'c') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        rl.close()
        process.exit(1)
      }
      const numeric = Number.parseInt(input, 10)
      if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= options.length) {
        selectedIndex = numeric - 1
        render()
      }
    }

    render()
    process.stdin.on('keypress', onKeypress)
  })
}

/**
 * Show a spinner while executing async task
 */
export async function withSpinner<T>(
  message: string,
  task: () => Promise<T>,
): Promise<T> {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let frameIndex = 0
  let running = true

  const spin = () => {
    if (!running)
      return
    process.stdout.write(`\r${styled(frames[frameIndex], colors.cyan)} ${message}`)
    frameIndex = (frameIndex + 1) % frames.length
    setTimeout(spin, 80)
  }

  spin()

  try {
    const result = await task()
    running = false
    process.stdout.write(`\r${styled('✔', colors.green)} ${message}\n`)
    return result
  }
  catch (error) {
    running = false
    process.stdout.write(`\r${styled('✖', colors.red)} ${message}\n`)
    throw error
  }
}

/**
 * Print a boxed header
 */
export function printHeader(title: string, subtitle?: string): void {
  console.log('')
  console.log(styled(title, colors.bold, colors.cyan))
  if (subtitle) {
    console.log(styled(subtitle, colors.dim))
  }
  console.log('')
}

/**
 * Print success message
 */
export function printSuccess(message: string): void {
  console.log(`${styled('✔', colors.green)} ${message}`)
}

/**
 * Print error message
 */
export function printError(message: string): void {
  console.log(`${styled('✖', colors.red)} ${message}`)
}

/**
 * Print warning message
 */
export function printWarning(message: string): void {
  console.log(`${styled('⚠', colors.yellow)} ${message}`)
}

/**
 * Print info message
 */
export function printInfo(message: string): void {
  console.log(`${styled('ℹ', colors.blue)} ${message}`)
}

/**
 * Print a list of items
 */
export function printList(items: string[], indent = 2): void {
  const spaces = ' '.repeat(indent)
  items.forEach((item) => {
    console.log(`${spaces}${styled('•', colors.dim)} ${item}`)
  })
}

/**
 * Ask to select language
 */
export async function askLanguageSwitch(): Promise<Locale> {
  const options: SelectOption<Locale>[] = [
    { label: 'English', value: 'en' },
    { label: '中文', value: 'zh' },
  ]

  const selected = await askSelect(t('settings.selectLanguage'), options)
  setLocale(selected)
  return selected
}
