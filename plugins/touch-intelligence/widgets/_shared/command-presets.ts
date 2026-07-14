export interface CommandPresetDraft {
  id: string
  name: string
  description?: string
  aliases: string[]
  promptTemplate: string
  promptVariables?: Record<string, unknown>
  version?: string
  enabled?: boolean
}

function cloneVariables(
  variables: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return variables ? JSON.parse(JSON.stringify(variables)) : {}
}

/**
 * Creates an unsaved preset draft with deterministic, conflict-free id and aliases.
 */
export function instantiateCommandPreset(
  preset: CommandPresetDraft,
  existingCommands: Array<Pick<CommandPresetDraft, 'id' | 'aliases'>>,
): CommandPresetDraft {
  const usedIds = new Set(
    existingCommands.map(command => command.id.toLocaleLowerCase()),
  )
  const usedAliases = new Set(
    existingCommands.flatMap(command =>
      command.aliases.map(alias => alias.toLocaleLowerCase()),
    ),
  )

  for (let attempt = 1; attempt <= existingCommands.length + 2; attempt += 1) {
    const suffix = attempt === 1 ? '' : `-${attempt}`
    const id = `${preset.id}${suffix}`
    const aliases = preset.aliases.map(alias => `${alias}${suffix}`)
    if (
      !usedIds.has(id.toLocaleLowerCase()) &&
      aliases.every(alias => !usedAliases.has(alias.toLocaleLowerCase()))
    ) {
      return {
        ...preset,
        id,
        aliases,
        promptVariables: cloneVariables(preset.promptVariables),
        version: preset.version || '1.0.0',
        enabled: true,
      }
    }
  }

  throw new Error('Unable to allocate a unique AI Command preset draft.')
}
