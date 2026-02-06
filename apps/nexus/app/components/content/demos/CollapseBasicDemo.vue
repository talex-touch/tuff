<script setup lang="ts">
import { computed, ref } from 'vue'

const active = ref<string[]>(['first'])
const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      firstTitle: '快速开始',
      firstBody: '这里是基础说明。',
      secondTitle: '高级选项',
      secondBody: '这里是高级配置说明。',
    }
  : {
      firstTitle: 'Getting Started',
      firstBody: 'Starter content goes here.',
      secondTitle: 'Advanced',
      secondBody: 'Extra options and settings.',
    }))
</script>

<template>
  <TxCollapse v-model="active">
    <TxCollapseItem :title="labels.firstTitle" name="first">
      {{ labels.firstBody }}
    </TxCollapseItem>
    <TxCollapseItem :title="labels.secondTitle" name="second">
      {{ labels.secondBody }}
    </TxCollapseItem>
  </TxCollapse>
</template>
