<script setup lang="ts">
import type { FormLayout } from '@talex-touch/tuffex/form'
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()
const layout = ref<FormLayout>('auto')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      layout: '布局',
      name: '收件人',
      phone: '手机号',
      address: '地址',
      city: '城市',
      zip: '邮编',
      note: '备注',
      resize: '拖动右下角调整宽度',
    }
  }

  return {
    layout: 'Layout',
    name: 'Recipient',
    phone: 'Phone',
    address: 'Address',
    city: 'City',
    zip: 'Postcode',
    note: 'Note',
    resize: 'Drag the bottom-right corner to resize',
  }
})

const form = reactive({
  name: '',
  phone: '',
  city: '',
  zip: '',
  note: '',
})
</script>

<template>
  <div class="form-layout-demo not-prose">
    <TxFlatRadio v-model="layout" size="sm" :aria-label="labels.layout">
      <TxFlatRadioItem value="auto" label="auto" />
      <TxFlatRadioItem value="side" label="side" />
      <TxFlatRadioItem value="stacked" label="stacked" />
      <TxFlatRadioItem value="inline" label="inline" />
    </TxFlatRadio>
    <div class="form-layout-demo__frame">
      <TxForm :model="form" :layout="layout">
        <TxFormItem :label="labels.name" prop="name" width="md">
          <TuffInput v-model="form.name" autocomplete="name" />
        </TxFormItem>
        <TxFormItem :label="labels.phone" prop="phone" width="sm">
          <TuffInput v-model="form.phone" inputmode="tel" autocomplete="tel" />
        </TxFormItem>
        <TxFormRow :label="labels.address">
          <TxFormItem :label="labels.city" prop="city">
            <TuffInput v-model="form.city" autocomplete="address-level2" />
          </TxFormItem>
          <TxFormItem :label="labels.zip" prop="zip" width="sm">
            <TuffInput v-model="form.zip" inputmode="numeric" autocomplete="postal-code" />
          </TxFormItem>
        </TxFormRow>
        <TxFormItem :label="labels.note" prop="note" width="full">
          <TxTextarea v-model="form.note" :rows="2" resize="none" />
        </TxFormItem>
      </TxForm>
    </div>
    <p class="form-layout-demo__hint">
      {{ labels.resize }}
    </p>
  </div>
</template>

<style scoped>
.form-layout-demo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
}

/* A container to drag: `auto` follows the form's own width, not the window's. */
.form-layout-demo__frame {
  box-sizing: border-box;
  width: 100%;
  min-width: 280px;
  max-width: 100%;
  padding: 16px;
  overflow: auto;
  resize: horizontal;
  border: 1px dashed var(--tx-border-color, #dcdfe6);
  border-radius: 12px;
}

.form-layout-demo__hint {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
