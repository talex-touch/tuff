<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const active = ref('first')

const labels = computed(() => (locale.value === 'zh'
  ? {
      firstTitle: '快速开始',
      firstBody: '手风琴模式下一次只展开一个面板。',
      secondTitle: '高级选项',
      secondBody: '再次点击当前面板会清空展开项。',
    }
  : {
      firstTitle: 'Getting Started',
      firstBody: 'Accordion mode keeps only one panel open.',
      secondTitle: 'Advanced',
      secondBody: 'Clicking the active panel again clears the active value.',
    }))
</script>

<template>
  <TxCollapse v-model="active" accordion>
    <TxCollapseItem :title="labels.firstTitle" name="first">
      {{ labels.firstBody }}
    </TxCollapseItem>
    <TxCollapseItem :title="labels.secondTitle" name="second">
      {{ labels.secondBody }}
    </TxCollapseItem>
  </TxCollapse>
</template>
