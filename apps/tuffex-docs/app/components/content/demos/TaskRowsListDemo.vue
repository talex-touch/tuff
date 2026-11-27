<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      done: '已完成',
      error: '失败',
      queued: '排队中',
      rows: [
        {
          id: 'verify',
          label: '已核对供应商记录',
          status: 'done' as const,
          amount: '12 家供应商',
          details: [
            { label: '税号与联系人已匹配', meta: '12/12' },
            { label: '标记过期记录', meta: '0' },
          ],
        },
        {
          id: 'draft',
          label: '起草供应商邮件',
          status: 'error' as const,
          amount: '2 封',
          details: [{ label: '蛋筒供应商跟进', meta: '草稿' }],
        },
        {
          id: 'ship',
          label: '安排配送时段',
          status: 'pending' as const,
          amount: '4 个时段',
          index: 3,
          details: [{ label: '等待冷链确认', meta: '—' }],
        },
      ],
    }
  }

  return {
    done: 'Completed',
    error: 'Failed',
    queued: 'Queued',
    rows: [
      {
        id: 'verify',
        label: 'Verified vendor records',
        status: 'done' as const,
        amount: '12 suppliers',
        details: [
          { label: 'Matched tax and contact IDs', meta: '12/12' },
          { label: 'Flagged stale records', meta: '0' },
        ],
      },
      {
        id: 'draft',
        label: 'Draft supplier emails',
        status: 'error' as const,
        amount: '2 messages',
        details: [{ label: 'Cone supplier follow-up', meta: 'draft' }],
      },
      {
        id: 'ship',
        label: 'Schedule delivery windows',
        status: 'pending' as const,
        amount: '4 windows',
        index: 3,
        details: [{ label: 'Waiting on cold-chain confirmation', meta: '—' }],
      },
    ],
  }
})
</script>

<template>
  <div class="max-w-[440px]">
    <!-- pendingText opts the queued row into a pill; left unset it shows none,
         which is the upstream default. -->
    <TxTaskRows
      variant="list"
      :rows="copy.rows"
      :default-open-ids="['verify']"
      :done-text="copy.done"
      :error-text="copy.error"
      :pending-text="copy.queued"
    />
  </div>
</template>
