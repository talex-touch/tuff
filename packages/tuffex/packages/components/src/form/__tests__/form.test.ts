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
