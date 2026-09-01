/// <reference types="node" />
import { spawn, spawnSync } from "node:child_process"
import type { SpawnOptions } from "node:child_process"

const NULL_BYTE_PATTERN = /\0/
const NEWLINE_PATTERN = /[\r\n]/

/**
 * Node 25 dropped the bundled corepack and this repo's baseline is Node 26, so
 * `corepack` is only on PATH when someone installed it separately. CI images
 * still ship it; a plain local checkout does not, and rewriting `pnpm` to
 * `corepack` unconditionally made every tuffex build there die on
 * `spawn corepack ENOENT`.
 */
const hasCorepack = ((): boolean => {
  try {
    return spawnSync("corepack", ["--version"], { stdio: "ignore" }).status === 0
  } catch {
    return false
  }
})()

const isPnpm = (command: string): boolean => command.toLowerCase() === "pnpm"

/** Only the corepack path takes a leading `pnpm` argument; see `spawnSafe`. */
const usesCorepack = (command: string): boolean => isPnpm(command) && hasCorepack

const resolveCommand = (command: string): string => {
  if (!isPnpm(command)) return command
  if (hasCorepack) return "corepack"
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm"
}

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
  options: SpawnOptions = {}
) => {
  const safeCommand = assertShellValue(resolveCommand(command), "COMMAND")
  const resolvedArgs = usesCorepack(command) ? ["pnpm", ...args] : args
  const safeArgs = resolvedArgs.map(assertShellArg)
  if (process.platform === "win32") {
    const commandLine = [safeCommand, ...safeArgs]
      .map((value) => {
        if (!/[\s"]/g.test(value)) return value
        return `"${value.replace(/"/g, '\\"')}"`
      })
      .join(" ")
    return spawn("cmd.exe", ["/d", "/s", "/c", commandLine], {
      ...options,
      shell: false
    })
  }
  return spawn(safeCommand, safeArgs, { ...options, shell: false })
}

export default async (command: any, path: string) => {
  const [cmd = "", ...args] = String(command ?? "").trim().split(" ")
  const displayCommand = [cmd, ...args].join(" ")
  console.log(`[build-run] ${displayCommand} (cwd: ${path})`)
  return new Promise((resolve, _reject) => {
    const app = spawnSafe(cmd, args, {
      cwd: path,
      stdio: "inherit"
    })

    app.on("error", _reject)
    app.on("close", (code, signal) => {
      if (signal) {
        _reject(new Error(`[build-run] Command terminated by signal: ${signal}`))
        return
      }
      if (code && code !== 0) {
        _reject(new Error(`[build-run] Command failed with exit code ${code}`))
        return
      }
      resolve(code ?? 0)
    })
  })
}
