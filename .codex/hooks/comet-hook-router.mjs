import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const routerPath = path.join(projectRoot, '.agents/skills/comet/scripts/comet-hook-router.mjs')

/** Codex reports native apply_patch input as tool_input.command, not a Write file_path. */
export function patchTargets(patch) {
  if (typeof patch !== 'string')
    throw new Error('Codex apply_patch hook input must contain tool_input.command')
  const lines = patch.trim().split(/\r?\n/u)
  if (lines[0] !== '*** Begin Patch' || lines.at(-1) !== '*** End Patch')
    throw new Error('Codex apply_patch hook input is not a complete patch')

  const targets = new Set()
  let operation = null
  let canMove = false
  for (const line of lines.slice(1, -1)) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/u.exec(line)
    if (header) {
      const target = header[2].trim()
      if (!target)
        throw new Error('Codex apply_patch contains an empty file target')
      targets.add(target)
      operation = header[1]
      canMove = operation === 'Update'
      continue
    }
    if (line.startsWith('*** Move to: ')) {
      const target = line.slice('*** Move to: '.length).trim()
      if (!canMove || !target)
        throw new Error('Codex apply_patch contains an invalid move target')
      targets.add(target)
      canMove = false
      continue
    }
    if (operation === 'Add') {
      if (!line.startsWith('+'))
        throw new Error('Codex apply_patch Add content must start with + or an exact file header')
      continue
    }
    if (operation === 'Delete')
      throw new Error('Codex apply_patch Delete must be followed by an exact file header')
    if (operation !== 'Update')
      throw new Error('Codex apply_patch content has no file target')
    canMove = false
    if (line === '*** End of File')
      continue
    if (line.startsWith('*** ') || !/^(?:[ +\-@]|$)/u.test(line))
      throw new Error('Codex apply_patch contains unsupported update content')
  }
  if (targets.size === 0)
    throw new Error('Codex apply_patch contains no file targets')
  return [...targets]
}

export function normalizeCodexEvent(event) {
  if (event.tool_name !== 'apply_patch')
    return [event]
  return [{
    ...event,
    tool_name: 'Write',
    tool_input: {
      file_paths: patchTargets(event.tool_input?.command).map(filePath => path.resolve(event.cwd || projectRoot, filePath)),
    },
  }]
}

export function runCodexHook(event) {
  let normalized
  try {
    [normalized] = normalizeCodexEvent(event)
  }
  catch (error) {
    return { code: 2, stdout: '', stderr: `Comet Codex Hook: ${error.message}\n` }
  }

  // The upstream router treats FILE_PATH as an input override. Judge this event, not that env value.
  const env = { ...process.env }
  delete env.FILE_PATH
  // Judge every target together so formal requirements cannot be mixed with implementation writes.
  const result = spawnSync(process.execPath, [
    routerPath,
    '--platform',
    'codex',
    '--project-root',
    projectRoot,
  ], {
    cwd: event.cwd || projectRoot,
    env,
    input: JSON.stringify(normalized),
    encoding: 'utf8',
  })
  if (result.error || result.status !== 0) {
    const reason = result.stderr?.trim() || result.error?.message || `router exited ${result.status}`
    return { code: 2, stdout: '', stderr: `Comet Codex Hook: ${reason}\n` }
  }
  return { code: 0, stdout: result.stdout || '', stderr: result.stderr || '' }
}

let isEntryPoint = false
try {
  isEntryPoint = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
}
catch {
  // When imported by a program using node -e, argv[1] can be data rather than a file.
}

if (isEntryPoint) {
  let result
  try {
    result = runCodexHook(JSON.parse(readFileSync(0, 'utf8')))
  }
  catch (error) {
    result = { code: 2, stdout: '', stderr: `Comet Codex Hook: ${error.message}\n` }
  }
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  process.exitCode = result.code
}
