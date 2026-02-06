<script setup lang="ts">
import { computed, ref } from 'vue'

const open = ref(false)
const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      open: '打开模态框',
      title: '快速操作',
      body: '在这里让用户完成一个小任务。',
      cancel: '取消',
      confirm: '确认',
    }
  : {
      open: 'Open Modal',
      title: 'Quick Action',
      body: 'Give the user a short task or decision.',
      cancel: 'Cancel',
      confirm: 'Confirm',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton variant="primary" @click="open = true">
      {{ labels.open }}
    </TxButton>
    <TxModal v-model="open" :title="labels.title">
      <p>{{ labels.body }}</p>
      <template #footer>
        <TxButton variant="ghost" @click="open = false">
          {{ labels.cancel }}
        </TxButton>
        <TxButton variant="primary" @click="open = false">
          {{ labels.confirm }}
        </TxButton>
      </template>
    </TxModal>
  </div>
</template>
