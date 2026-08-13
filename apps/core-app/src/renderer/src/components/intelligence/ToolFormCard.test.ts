// @vitest-environment jsdom
import type { FormSpec } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ToolFormCard from './ToolFormCard.vue'

/**
 * The tuffex inputs are stubbed down to the native controls they wrap: this
 * suite owns the card's own behaviour (value collection, required gating, the
 * submitted lock), not the primitives' rendering.
 */
vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: ['disabled', 'nativeType', 'variant', 'size'],
    emits: ['click'],
    template:
      '<button :type="nativeType" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/input', () => ({
  TxInput: {
    name: 'TxInput',
    props: ['modelValue', 'type', 'placeholder', 'rows', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<textarea v-if="type === \'textarea\'" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' +
      '<input v-else :type="type" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  }
}))

vi.mock('@talex-touch/tuffex/select', () => ({
  TxSelect: {
    name: 'TxSelect',
    props: ['modelValue', 'options', 'placeholder', 'disabled', 'status'],
    emits: ['update:modelValue'],
    template:
      '<select :disabled="disabled" :data-status="status" @change="$emit(\'update:modelValue\', $event.target.value)">' +
      '<option v-for="option in options" :key="option.value" :value="option.value" :selected="option.value === modelValue">{{ option.label }}</option>' +
      '</select>'
  }
}))

vi.mock('@talex-touch/tuffex/checkbox', () => ({
  TxCheckbox: {
    name: 'TxCheckbox',
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<button type="button" role="checkbox" :aria-checked="modelValue" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)" />'
  }
}))

function spec(overrides: Partial<FormSpec> = {}): FormSpec {
  return {
    title: 'Quick survey',
    fields: [{ key: 'name', label: 'Your name', type: 'text' }],
    ...overrides
  }
}

function mountCard(props: Partial<{ spec: FormSpec; submitted: boolean }> = {}) {
  return mount(ToolFormCard, { props: { spec: spec(), ...props } })
}

function textFieldValue(wrapper: ReturnType<typeof mountCard>): string {
  return (wrapper.get('input[type="text"]').element as HTMLInputElement).value
}

describe('ToolFormCard rendering', () => {
  it('gives every field type its own control', () => {
    const wrapper = mountCard({
      spec: spec({
        fields: [
          { key: 'name', label: 'Your name', type: 'text' },
          { key: 'notes', label: 'Notes', type: 'textarea' },
          { key: 'age', label: 'Age', type: 'number' },
          { key: 'tier', label: 'Plan', type: 'select', options: ['free', 'pro'] },
          { key: 'agree', label: 'Agree', type: 'checkbox' }
        ]
      })
    })

    expect(wrapper.find('input[type="text"]').exists()).toBe(true)
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('input[type="number"]').exists()).toBe(true)
    expect(wrapper.findAll('select option').map((option) => option.text())).toEqual(['free', 'pro'])
    expect(wrapper.find('[role="checkbox"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Quick survey')
  })

  it('labels each control and prefers the spec submit label', () => {
    const wrapper = mountCard({
      spec: spec({ submitLabel: 'Send it', fields: [{ key: 'a', label: 'Field A', type: 'text' }] })
    })

    expect(wrapper.get('#tool-form-a').text()).toContain('Field A')
    expect(wrapper.get('button[type="submit"]').text()).toBe('Send it')
  })
})

describe('ToolFormCard submission', () => {
  it('blocks submission on an empty required field and clears the error once answered', async () => {
    const wrapper = mountCard({
      spec: spec({
        fields: [
          { key: 'name', label: 'Your name', type: 'text', required: true },
          { key: 'agree', label: 'Agree', type: 'checkbox', required: true }
        ]
      })
    })

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(2)

    await wrapper.get('input[type="text"]').setValue('Ada')
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
  })

  it('emits every answer, with numbers as numbers and checkboxes as booleans', async () => {
    const wrapper = mountCard({
      spec: spec({
        fields: [
          { key: 'name', label: 'Your name', type: 'text', default: 'Ada' },
          { key: 'age', label: 'Age', type: 'number' },
          { key: 'tier', label: 'Plan', type: 'select', options: ['free', 'pro'], default: 'free' },
          { key: 'agree', label: 'Agree', type: 'checkbox' },
          { key: 'notes', label: 'Notes', type: 'textarea' }
        ]
      })
    })

    await wrapper.get('input[type="number"]').setValue('42')
    await wrapper.get('select').setValue('pro')
    await wrapper.get('[role="checkbox"]').trigger('click')
    await wrapper.get('form').trigger('submit')

    // Blank optional answers ride along as empty strings: "left blank" is an
    // answer the reader of the submission needs to see.
    expect(wrapper.emitted('submit')).toEqual([
      [{ name: 'Ada', age: 42, tier: 'pro', agree: true, notes: '' }]
    ])
  })

  it('keeps unparseable number text rather than sending NaN', async () => {
    // The number input itself only ever yields numeric text, but a spec that
    // skipped the main-process parser can still carry a worded default.
    const wrapper = mountCard({
      spec: spec({ fields: [{ key: 'age', label: 'Age', type: 'number', default: 'about ten' }] })
    })

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([[{ age: 'about ten' }]])
  })

  it('restores the defaults on reset', async () => {
    const wrapper = mountCard({
      spec: spec({ fields: [{ key: 'name', label: 'Your name', type: 'text', default: 'Ada' }] })
    })

    await wrapper.get('input[type="text"]').setValue('Grace')
    await wrapper.get('button[type="button"]').trigger('click')

    expect(textFieldValue(wrapper)).toBe('Ada')
  })
})

describe('ToolFormCard submitted state', () => {
  it('locks the card after one submission and echoes what was sent', async () => {
    const wrapper = mountCard({
      spec: spec({ fields: [{ key: 'name', label: 'Your name', type: 'text' }] })
    })

    await wrapper.get('input[type="text"]').setValue('Ada')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    // The answered values stay on screen, read-only, instead of being replaced
    // by a summary that would have to be formatted and translated again.
    expect(textFieldValue(wrapper)).toBe('Ada')
    expect(wrapper.get('input[type="text"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Submitted')
  })

  it('honours a host-restored submitted state', async () => {
    const wrapper = mountCard({ submitted: true })

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.find('input[type="text"]').attributes('disabled')).toBeDefined()
  })

  it('reopens only when the spec itself changes, not on a re-rendered identity', async () => {
    const wrapper = mountCard()

    await wrapper.get('input[type="text"]').setValue('Ada')
    // The host reparses the tool output on every render, handing over an equal
    // but fresh object; that must not wipe what the user is typing.
    await wrapper.setProps({ spec: spec() })
    expect(textFieldValue(wrapper)).toBe('Ada')

    await wrapper.setProps({
      spec: spec({ fields: [{ key: 'other', label: 'Other', type: 'text' }] })
    })
    expect(textFieldValue(wrapper)).toBe('')
  })
})

describe('ToolFormCard drafts across virtualization', () => {
  // The conversation stream virtualizes rows out of the DOM; an unmount takes
  // this card's half-typed state with it. The host stores what `change` hands
  // out and returns it through `initialValues` on remount — this suite is that
  // round trip.
  it('publishes every edit through change', async () => {
    const wrapper = mountCard({
      spec: spec({
        fields: [
          { key: 'name', label: 'Your name', type: 'text' },
          { key: 'agree', label: 'Agree', type: 'checkbox' }
        ]
      })
    })

    await wrapper.get('input[type="text"]').setValue('Ada')
    await wrapper.get('[role="checkbox"]').trigger('click')

    expect(wrapper.emitted('change')).toEqual([
      [{ name: 'Ada', agree: false }],
      [{ name: 'Ada', agree: true }]
    ])
  })

  it('seeds a remount from the stored draft, over the spec defaults', () => {
    const wrapper = mount(ToolFormCard, {
      props: {
        spec: spec({
          fields: [
            { key: 'name', label: 'Your name', type: 'text', default: 'Ada' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
            { key: 'agree', label: 'Agree', type: 'checkbox' }
          ]
        }),
        initialValues: { name: 'Grace', agree: true }
      }
    })

    expect(textFieldValue(wrapper)).toBe('Grace')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.get('[role="checkbox"]').attributes('aria-checked')).toBe('true')
  })

  it('ignores draft keys the spec does not know and type-mismatched values', () => {
    const wrapper = mount(ToolFormCard, {
      props: {
        spec: spec({
          fields: [
            { key: 'name', label: 'Your name', type: 'text', default: 'Ada' },
            { key: 'agree', label: 'Agree', type: 'checkbox' }
          ]
        }),
        // A stale draft from an older spec: unknown key, boolean into a text
        // field, string into a checkbox.
        initialValues: { gone: 'x', name: true, agree: 'yes' }
      }
    })

    expect(textFieldValue(wrapper)).toBe('Ada')
    expect(wrapper.get('[role="checkbox"]').attributes('aria-checked')).toBe('false')
  })

  it('publishes the defaults again on reset — reset discards the draft', async () => {
    const wrapper = mount(ToolFormCard, {
      props: {
        spec: spec({ fields: [{ key: 'name', label: 'Your name', type: 'text', default: 'Ada' }] }),
        initialValues: { name: 'Grace' }
      }
    })

    expect(textFieldValue(wrapper)).toBe('Grace')
    await wrapper.get('button[type="button"]').trigger('click')

    expect(textFieldValue(wrapper)).toBe('Ada')
    expect(wrapper.emitted('change')).toEqual([[{ name: 'Ada' }]])
  })
})
