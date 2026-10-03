<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

// One member record, as an admin drawer would show it. `phone` is empty and
// `credits` is 0: the first renders the empty placeholder, the second a real 0.
const copy = computed(() => (isZh.value
  ? {
      name: '姓名',
      email: '邮箱',
      plan: '套餐',
      credits: '剩余积分',
      phone: '手机',
      lastSignIn: '最近登录',
      id: '用户 ID',
      user: {
        name: '林晓',
        email: 'lin.xiao@northsail.cn',
        plan: 'Pro 年付',
        credits: 0,
        phone: '',
        lastSignIn: '2026-10-02 09:41',
        id: 'usr_01J9ZK4Q8M2T6V7X3B5N1C0D9F',
      },
    }
  : {
      name: 'Name',
      email: 'Email',
      plan: 'Plan',
      credits: 'Credits left',
      phone: 'Phone',
      lastSignIn: 'Last sign-in',
      id: 'User ID',
      user: {
        name: 'Marta Halapin',
        email: 'marta@northsail.co',
        plan: 'Pro, yearly',
        credits: 0,
        phone: '',
        lastSignIn: '2026-10-02 09:41',
        id: 'usr_01J9ZK4Q8M2T6V7X3B5N1C0D9F',
      },
    }))
</script>

<template>
  <div class="descriptions-basic-demo not-prose">
    <TxDescriptions>
      <TxDescriptionsItem :label="copy.name">
        {{ copy.user.name }}
      </TxDescriptionsItem>
      <TxDescriptionsItem :label="copy.email">
        {{ copy.user.email }}
      </TxDescriptionsItem>
      <TxDescriptionsItem :label="copy.plan">
        <TxStatusBadge status="success" :text="copy.user.plan" size="sm" />
      </TxDescriptionsItem>
      <TxDescriptionsItem :label="copy.credits">
        {{ copy.user.credits }}
      </TxDescriptionsItem>
      <TxDescriptionsItem :label="copy.phone">
        {{ copy.user.phone }}
      </TxDescriptionsItem>
      <TxDescriptionsItem :label="copy.lastSignIn">
        {{ copy.user.lastSignIn }}
      </TxDescriptionsItem>
      <TxDescriptionsItem :label="copy.id" :span="2">
        <code class="descriptions-basic-demo__code">{{ copy.user.id }}</code>
      </TxDescriptionsItem>
    </TxDescriptions>
  </div>
</template>

<style scoped>
.descriptions-basic-demo {
  width: 100%;
}

.descriptions-basic-demo__code {
  font-family: var(--tx-font-mono, ui-monospace, monospace);
  font-size: 0.9em;
}
</style>
