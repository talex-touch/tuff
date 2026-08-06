import type { FormSpec } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { ToolDefinition } from './tool-registry'
import { FORM_RESULT_PREFIX } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { describe, expect, it } from 'vitest'
import { createToolRegistry, parseFormSpec } from './tool-registry'

function formTool(): ToolDefinition {
  return createToolRegistry({
    searchFiles: async () => [],
    openPath: async () => '',
    agentContext: {
      readSkill: async () => '',
      listMcpServers: async () => [],
      listMcpTools: async () => [],
      callMcpTool: async () => ''
    },
    pluginFeatures: {
      listFeatures: () => [],
      findFeature: () => null,
      invokeFeature: async () => ({ handled: true })
    }
  }).get('tuff_render_form')!
}

/** The parser returns the offending message as a string, never throws. */
function reject(args: Record<string, unknown>): string {
  const result = parseFormSpec(args)
  expect(typeof result, 'expected a rejection message').toBe('string')
  return result as string
}

function accept(args: Record<string, unknown>): FormSpec {
  const result = parseFormSpec(args)
  expect(typeof result, `expected a spec, got: ${String(result)}`).not.toBe('string')
  return result as FormSpec
}

describe('form spec validation', () => {
  it('accepts a well-formed spec and marks the result for the renderer', async () => {
    const result = await formTool().execute({
      title: 'Quick survey',
      description: 'Two questions',
      submitLabel: 'Send',
      fields: [
        { key: 'name', label: 'Your name', type: 'text', required: true },
        { key: 'tier', label: 'Plan', type: 'select', options: ['free', 'pro'], default: 'pro' }
      ]
    })

    expect(result.isError).toBe(false)
    expect(result.output.startsWith(FORM_RESULT_PREFIX)).toBe(true)
    expect(JSON.parse(result.output.slice(FORM_RESULT_PREFIX.length))).toMatchObject({
      title: 'Quick survey',
      description: 'Two questions',
      submitLabel: 'Send',
      fields: [
        { key: 'name', label: 'Your name', type: 'text', required: true },
        { key: 'tier', label: 'Plan', type: 'select', options: ['free', 'pro'], default: 'pro' }
      ]
    })
  })

  it('names the field it rejected so the model can fix that one', () => {
    expect(reject({ fields: [{ label: 'Nameless', type: 'text' }] })).toContain('fields[0].key')
    expect(
      reject({
        fields: [
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'email', label: 'Confirm', type: 'text' }
        ]
      })
    ).toContain('"email" is already used')
    expect(reject({ fields: [{ key: 'when', label: 'When', type: 'datepicker' }] })).toContain(
      'field "when": type must be one of'
    )
    expect(reject({ fields: [{ key: 'tier', label: 'Plan', type: 'select' }] })).toContain(
      'field "tier": select needs a non-empty options array'
    )
  })

  it('refuses an empty form and one nobody would fill in', () => {
    expect(reject({ fields: [] })).toContain('fields must be a non-empty array')
    expect(reject({})).toContain('fields must be a non-empty array')
    expect(
      reject({
        fields: Array.from({ length: 21 }, (_, index) => ({
          key: `q${index}`,
          label: `Question ${index}`,
          type: 'text'
        }))
      })
    ).toContain('limited to 20')
  })

  it('falls back to the key when the model omits a label', () => {
    // A raw key reads worse than a sentence, but losing the whole form over a
    // missing caption reads worst of all.
    expect(accept({ fields: [{ key: 'notes', type: 'textarea' }] }).fields[0]).toMatchObject({
      key: 'notes',
      label: 'notes'
    })
  })

  it('keeps only defaults the field can hold', () => {
    const spec = accept({
      fields: [
        { key: 'age', label: 'Age', type: 'number', default: '42' },
        { key: 'note', label: 'Note', type: 'text', default: 7 },
        { key: 'agree', label: 'Agree', type: 'checkbox', default: 'yes' },
        { key: 'tier', label: 'Plan', type: 'select', options: ['free'], default: 'enterprise' }
      ]
    })

    expect(spec.fields[0]!.default).toBe(42)
    expect(spec.fields[1]!.default).toBe('7')
    // A string is not a checkbox state, and a choice outside the options could
    // never be selected — both are dropped rather than rendered wrong.
    expect(spec.fields[2]!.default).toBeUndefined()
    expect(spec.fields[3]!.default).toBeUndefined()
  })

  it('drops options from field types that have none', () => {
    const spec = accept({
      fields: [{ key: 'name', label: 'Name', type: 'text', options: ['a', 'b'] }]
    })
    expect(spec.fields[0]!.options).toBeUndefined()
  })

  it('reports an invalid spec back to the model instead of throwing', async () => {
    const result = await formTool().execute({ fields: [{ key: 'a', type: 'slider' }] })

    expect(result.isError).toBe(true)
    expect(result.output).toContain('Invalid form:')
    expect(result.output).not.toContain(FORM_RESULT_PREFIX)
  })

  it('never needs a confirmation beyond read risk', () => {
    // Rendering asks for nothing; the user submitting is their own action.
    expect(formTool().risk).toBe('read')
  })

  it('summarises the call for the confirmation card', () => {
    expect(formTool().summarize({ title: 'Quick survey' })).toContain('Quick survey')
    expect(formTool().summarize({})).toContain('form')
  })
})
