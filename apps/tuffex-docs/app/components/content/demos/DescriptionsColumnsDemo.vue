<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

const columns = ref(3)
const width = ref<'wide' | 'narrow'>('wide')

// TxFlatRadio reports any radio value; these two only ever hold their own.
function setColumns(value: unknown) {
  columns.value = Number(value)
}

function setWidth(value: unknown) {
  width.value = value === 'narrow' ? 'narrow' : 'wide'
}

// The narrow frame is 360px: under the 480px threshold, so the list drops to one
// column whatever `columns` says, and every span collapses with it.
const copy = computed(() => (isZh.value
  ? {
      columnsLabel: '列数',
      widthLabel: '容器宽度',
      widths: { wide: '随页面', narrow: '360px' },
      order: '订单号',
      status: '状态',
      amount: '金额',
      customer: '客户',
      address: '收货地址',
      note: '备注',
      values: {
        order: 'TU-2408',
        status: '已支付',
        amount: '¥12,800',
        customer: '林晓',
        address: '上海市徐汇区漕溪北路 88 号 12 楼',
        note: '客户要求电子发票，开票抬头与付款主体一致；节假日不配送，周一上午统一发出。',
      },
    }
  : {
      columnsLabel: 'Columns',
      widthLabel: 'Container width',
      widths: { wide: 'Page width', narrow: '360px' },
      order: 'Order',
      status: 'Status',
      amount: 'Amount',
      customer: 'Customer',
      address: 'Shipping address',
      note: 'Note',
      values: {
        order: 'TU-2408',
        status: 'Paid',
        amount: '$1,840',
        customer: 'Marta Halapin',
        address: '88 Harbour Street, Floor 12, Wellington 6011',
        note: 'Wants a digital invoice billed to the paying company; no weekend delivery, ships Monday morning.',
      },
    }))
</script>

<template>
  <div class="descriptions-columns-demo not-prose">
    <div class="descriptions-columns-demo__bar">
      <TxFlatRadio :model-value="columns" size="sm" :aria-label="copy.columnsLabel" @update:model-value="setColumns">
        <TxFlatRadioItem v-for="count in [1, 2, 3]" :key="count" :value="count" :label="String(count)" />
      </TxFlatRadio>
      <TxFlatRadio :model-value="width" size="sm" :aria-label="copy.widthLabel" @update:model-value="setWidth">
        <TxFlatRadioItem value="wide" :label="copy.widths.wide" />
        <TxFlatRadioItem value="narrow" :label="copy.widths.narrow" />
      </TxFlatRadio>
    </div>

    <div class="descriptions-columns-demo__frame" :class="{ 'is-narrow': width === 'narrow' }">
      <TxDescriptions :columns="columns">
        <TxDescriptionsItem :label="copy.order">
          {{ copy.values.order }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="copy.status">
          <TxStatusBadge status="success" :text="copy.values.status" size="sm" />
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="copy.amount">
          {{ copy.values.amount }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="copy.customer">
          {{ copy.values.customer }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="copy.address" :span="2">
          {{ copy.values.address }}
        </TxDescriptionsItem>
        <TxDescriptionsItem :label="copy.note" :span="3">
          {{ copy.values.note }}
        </TxDescriptionsItem>
      </TxDescriptions>
    </div>
  </div>
</template>

<style scoped>
.descriptions-columns-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.descriptions-columns-demo__bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.descriptions-columns-demo__frame {
  padding: 16px;
  border: 1px dashed var(--tx-border-color, #dcdfe6);
  border-radius: 12px;
}

.descriptions-columns-demo__frame.is-narrow {
  width: 360px;
  max-width: 100%;
  box-sizing: border-box;
}
</style>
