import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick, reactive, ref } from 'vue'
import TuffInput from '../../input/src/TxInput.vue'
import TxForm from '../src/TxForm.vue'
import TxFormItem from '../src/TxFormItem.vue'

describe('txForm', () => {
  it('validates required fields', async () => {
    const wrapper = mount({
      components: { TxForm, TxFormItem, TuffInput },
      setup() {
        const model = reactive({ name: '' })
        const rules = { name: { required: true, message: 'Name required' } }
        const formRef = ref<any>(null)
        return { model, rules, formRef }
      },
      template: `
        <TxForm ref="formRef" :model="model" :rules="rules">
          <TxFormItem prop="name" label="Name">
            <TuffInput v-model="model.name" />
          </TxFormItem>
        </TxForm>
      `,
    })

    const form = (wrapper.vm as any).formRef
    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(wrapper.find('.tx-form-item__error').text()).toBe('Name required')

    ;(wrapper.vm as any).model.name = 'Alice'
    await nextTick()

    const validAfter = await form.validate()
    expect(validAfter).toBe(true)
    expect(wrapper.find('.tx-form-item__error').exists()).toBe(false)
  })

  it('links label, control, and error for assistive tech on validation failure', async () => {
    const wrapper = mount({
      components: { TxForm, TxFormItem },
      setup() {
        const model = reactive({ name: '' })
        const rules = { name: { required: true, message: 'Name required' } }
        const formRef = ref<any>(null)
        return { model, rules, formRef }
      },
      template: `
        <TxForm ref="formRef" :model="model" :rules="rules">
          <TxFormItem prop="name" label="Name" #default="{ id, ariaInvalid, ariaDescribedby }">
            <input :id="id" v-model="model.name" :aria-invalid="ariaInvalid" :aria-describedby="ariaDescribedby" />
          </TxFormItem>
        </TxForm>
      `,
    })

    const input = wrapper.find('input')
    const label = wrapper.find('.tx-form-item__label')

    // The label is programmatically linked to the control via for/id.
    expect(label.attributes('for')).toBeTruthy()
    expect(input.attributes('id')).toBe(label.attributes('for'))
    expect(input.attributes('aria-invalid')).toBeUndefined()

    const form = (wrapper.vm as any).formRef
    await form.validate()

    const error = wrapper.find('.tx-form-item__error')
    // The error is an alert and is referenced by the control.
    expect(error.attributes('role')).toBe('alert')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe(error.attributes('id'))
  })

  it('reflects rules updates after mount', async () => {
    const rules = ref({ name: { required: true, message: 'Name required' } })
    const wrapper = mount({
      components: { TxForm, TxFormItem, TuffInput },
      setup() {
        const model = reactive({ name: '' })
        const formRef = ref<any>(null)
        return { model, rules, formRef }
      },
      template: `
        <TxForm ref="formRef" :model="model" :rules="rules">
          <TxFormItem prop="name" label="Name">
            <TuffInput v-model="model.name" />
          </TxFormItem>
        </TxForm>
      `,
    })

    const form = (wrapper.vm as any).formRef
    await form.validate()
    expect(wrapper.find('.tx-form-item__error').text()).toBe('Name required')

    // A brand-new rules object identity (e.g. from a locale-dependent computed in
    // the parent) must still reach TxFormItem after mount.
    rules.value = { name: { required: true, message: 'Nom requis' } }
    await nextTick()

    await form.validate()
    expect(wrapper.find('.tx-form-item__error').text()).toBe('Nom requis')
  })

  it('resets fields to initial values', async () => {
    const wrapper = mount({
      components: { TxForm, TxFormItem, TuffInput },
      setup() {
        const model = reactive({ name: '' })
        const formRef = ref<any>(null)
        return { model, formRef }
      },
      template: `
        <TxForm ref="formRef" :model="model">
          <TxFormItem prop="name" label="Name">
            <TuffInput v-model="model.name" />
          </TxFormItem>
        </TxForm>
      `,
    })

    ;(wrapper.vm as any).model.name = 'Bob'
    await nextTick()

    const form = (wrapper.vm as any).formRef
    form.resetFields()

    expect((wrapper.vm as any).model.name).toBe('')
  })
})
