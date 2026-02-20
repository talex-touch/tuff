/// <reference types="node" />
import { spawn } from "node:child_process"
import type { SpawnOptionsWithoutStdio } from "node:child_process"

const NULL_BYTE_PATTERN = /\0/
const NEWLINE_PATTERN = /[\r\n]/

const assertShellValue = (value: string, label: string): string => {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label}_EMPTY`)
  if (NULL_BYTE_PATTERN.test(trimmed)) throw new Error(`${label}_NULL_BYTE`)
  if (NEWLINE_PATTERN.test(trimmed)) throw new Error(`${label}_NEWLINE`)
  return trimmed
}

const assertShellArg = (value: string): string => {
  if (NULL_BYTE_PATTERN.test(value)) throw new Error("ARG_NULL_BYTE")
  return value
}

const spawnSafe = (
  command: string,
  args: string[] = [],
  options: SpawnOptionsWithoutStdio = {}
) => {
  const safeCommand = assertShellValue(command, "COMMAND")
  const safeArgs = args.map(assertShellArg)
  return spawn(safeCommand, safeArgs, { ...options, shell: false })
}

export default async (command: any, path: string) => {
  const [cmd, ...args] = String(command ?? "").trim().split(" ")
  return new Promise((resolve, _reject) => {
    const app = spawnSafe(cmd, args, {
      cwd: path,
    })

    app.on("close", resolve)
  })
}
