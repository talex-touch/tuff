<script setup lang="ts">
import { computed, ref } from 'vue'

interface RowData {
  id: number
  customer: string
  email: string
  status: 'paid' | 'pending' | 'failed' | 'refunded'
  date: string
  amount: number
  method: string
  items: number
  note: string
}

const { locale } = useI18n()
const expandedKeys = ref<Array<number | string>>([1])

const isZh = computed(() => locale.value === 'zh')

const labels = computed(() => (isZh.value
  ? {
      customer: '客户',
      status: '状态',
      date: '日期',
      amount: '金额',
      total: '合计',
      order: '订单',
      method: '支付方式',
      items: '商品数',
      note: '备注',
      expand: '展开详情',
      collapse: '收起详情',
      statuses: {
        paid: '已支付',
        pending: '处理中',
        failed: '失败',
        refunded: '已退款',
      },
      methods: { card: '银行卡', wallet: '余额', transfer: '转账' },
      notes: {
        1: '发票已开具，客户要求电子版。',
        2: '等待银行回调，超过 24 小时自动取消。',
        4: '卡被发卡行拒绝，已通知客户。',
        5: '部分退款 ¥60，剩余金额已结算。',
        6: '退款到原卡，3 个工作日到账。',
      },
    }
  : {
      customer: 'Customer',
      status: 'Status',
      date: 'Date',
      amount: 'Amount',
      total: 'Total',
      order: 'Order',
      method: 'Method',
      items: 'Items',
      note: 'Note',
      expand: 'Expand row',
      collapse: 'Collapse row',
      statuses: {
        paid: 'Paid',
        pending: 'Pending',
        failed: 'Failed',
        refunded: 'Refunded',
      },
      methods: { card: 'Card', wallet: 'Wallet', transfer: 'Transfer' },
      notes: {
        1: 'Invoice issued; the customer asked for a digital copy.',
        2: 'Waiting on the bank callback — cancels itself after 24 hours.',
        4: 'The issuer declined the card; the customer was notified.',
        5: 'Partial refund of $60; the rest settled normally.',
        6: 'Refunded to the original card, settles in 3 business days.',
      },
    }))

const columns = computed(() => [
  { key: 'customer', title: labels.value.customer, minWidth: 180 },
  { key: 'status', title: labels.value.status, width: 110 },
  { key: 'date', title: labels.value.date, width: 100 },
  { key: 'amount', title: labels.value.amount, width: 110, align: 'right' as const },
])

const data = computed<RowData[]>(() => (isZh.value
  ? [
      { id: 1, customer: '林晓', email: 'lin.xiao@northsail.cn', status: 'paid', date: '9 月 8 日', amount: 12800, method: 'card', items: 3, note: '' },
      { id: 2, customer: '周越', email: 'zhou.yue@quillbase.cn', status: 'pending', date: '9 月 8 日', amount: 2980, method: 'transfer', items: 1, note: '' },
      { id: 3, customer: '陈佳', email: 'chen.jia@fold.cn', status: 'paid', date: '9 月 7 日', amount: 690, method: 'wallet', items: 2, note: '' },
      { id: 4, customer: '吴桐', email: 'wu.tong@heliolab.cn', status: 'failed', date: '9 月 7 日', amount: 16800, method: 'card', items: 5, note: '' },
      { id: 5, customer: '苏晴', email: 'su.qing@brightpath.cn', status: 'paid', date: '9 月 6 日', amount: 5400, method: 'wallet', items: 2, note: '' },
      { id: 6, customer: '何砚', email: 'he.yan@medela.cn', status: 'refunded', date: '9 月 5 日', amount: 690, method: 'card', items: 1, note: '' },
    ]
  : [
      { id: 1, customer: 'Marta Halapin', email: 'marta@northsail.co', status: 'paid', date: 'Sep 8', amount: 1840, method: 'card', items: 3, note: '' },
      { id: 2, customer: 'Devansh Rao', email: 'devansh@quillbase.io', status: 'pending', date: 'Sep 8', amount: 420, method: 'transfer', items: 1, note: '' },
      { id: 3, customer: 'Ines Almeida', email: 'ines@fold.studio', status: 'paid', date: 'Sep 7', amount: 96, method: 'wallet', items: 2, note: '' },
      { id: 4, customer: 'Tobias Werner', email: 'tobias@heliolab.de', status: 'failed', date: 'Sep 7', amount: 2400, method: 'card', items: 5, note: '' },
      { id: 5, customer: 'Amara Okonjo', email: 'amara@brightpath.ng', status: 'paid', date: 'Sep 6', amount: 780, method: 'wallet', items: 2, note: '' },
      { id: 6, customer: 'Rafael Costa', email: 'rafael@medela.com.br', status: 'refunded', date: 'Sep 5', amount: 96, method: 'card', items: 1, note: '' },
    ]))

const total = computed(() => data.value.reduce((sum, row) => sum + row.amount, 0))

const statusTone: Record<RowData['status'], string> = {
  paid: 'success',
  pending: 'warning',
  failed: 'danger',
  refunded: 'info',
}

function formatAmount(value: number) {
  const amount = isZh.value ? value : value / 10
  return `¥${amount.toLocaleString(isZh.value ? 'zh-CN' : 'en-US')}`
}

function noteFor(row: RowData) {
  return (labels.value.notes as Record<number, string>)[row.id]
}

// Rows whose detail is empty still render, but the toggle disappears — the
// `rowExpandable` gate keeps the column aligned without offering a dead control.
function rowExpandable(row: RowData) {
  return Boolean(noteFor(row))
}
</script>

<template>
  <div class="group not-prose" style="display: grid; gap: 10px;">
    <TxDataTable
      v-model:expanded-keys="expandedKeys"
      :columns="columns"
      :data="data"
      row-key="id"
      expandable
      :row-expandable="rowExpandable"
      :expand-label="labels.expand"
      :collapse-label="labels.collapse"
      striped
      hover
    >
      <template #cell-customer="{ row }">
        <div class="cell-customer">
          <span class="cell-customer__name">{{ row.customer }}</span>
          <span class="cell-customer__mail">{{ row.email }}</span>
        </div>
      </template>

      <template #cell-status="{ row }">
        <TxStatusBadge :status="statusTone[row.status]" :text="labels.statuses[row.status]" size="sm" />
      </template>

      <template #cell-amount="{ row }">
        {{ formatAmount(row.amount) }}
      </template>

      <template #expanded="{ row }">
        <dl class="detail">
          <div class="detail__item">
            <dt>{{ labels.order }}</dt>
            <dd>#TU-{{ 2400 + row.id }}</dd>
          </div>
          <div class="detail__item">
            <dt>{{ labels.method }}</dt>
            <dd>{{ labels.methods[row.method as keyof typeof labels.methods] }}</dd>
          </div>
          <div class="detail__item">
            <dt>{{ labels.items }}</dt>
            <dd>{{ row.items }}</dd>
          </div>
          <div class="detail__item detail__item--wide">
            <dt>{{ labels.note }}</dt>
            <dd>{{ noteFor(row) }}</dd>
          </div>
        </dl>
      </template>

      <template #footer-amount>
        <strong>{{ formatAmount(total) }}</strong>
      </template>
    </TxDataTable>

    <p class="hint">
      {{ isZh ? '展开状态：' : 'Expanded: ' }}{{ expandedKeys.length ? expandedKeys.join('、') : (isZh ? '无' : 'none') }}
    </p>
  </div>
</template>

<style scoped>
.cell-customer {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell-customer__name {
  color: var(--tx-text-color-primary);
  font-weight: 500;
}

.cell-customer__mail {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.detail {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px 18px;
  margin: 0;
}

.detail__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail__item--wide {
  grid-column: span 2;
}

.detail dt {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.detail dd {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 13px;
}

.hint {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}
</style>
