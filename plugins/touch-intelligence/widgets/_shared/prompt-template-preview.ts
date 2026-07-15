export interface PromptTemplatePreview {
  rendered: string
  variableNames: string[]
  missingVariables: string[]
}

const MUSTACHE_VARIABLE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g

function resolveVariable(
  variables: Record<string, unknown>,
  name: string,
): unknown {
  let current: unknown = variables
  for (const segment of name.split('.')) {
    if (
      current === null
      || typeof current !== 'object'
      || !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * Mirrors the host's simple Mustache interpolation for AI Command system prompts.
 * Missing or null values render as empty strings, matching LangChain PromptTemplate.
 */
export function renderPromptTemplatePreview(
  template: string,
  variables: Record<string, unknown>,
): PromptTemplatePreview {
  const variableNames = Array.from(
    new Set(
      Array.from(
        template.matchAll(MUSTACHE_VARIABLE_PATTERN),
        match => match[1],
      ).filter((name): name is string => Boolean(name)),
    ),
  )
  const missingVariables = variableNames.filter(
    name => resolveVariable(variables, name) == null,
  )
  const rendered = template.replace(
    MUSTACHE_VARIABLE_PATTERN,
    (_match, name: string) => {
      const value = resolveVariable(variables, name)
      return value == null ? '' : String(value)
    },
  )

  return {
    rendered,
    variableNames,
    missingVariables,
  }
}
