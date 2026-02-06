<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const active = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxCollapse v-model="active">
          <TxCollapseItem title="快速开始" name="first">
            这里是基础说明。
          </TxCollapseItem>
          <TxCollapseItem title="高级选项" name="second">
            这里是高级配置说明。
          </TxCollapseItem>
        </TxCollapse>
  </div>
  <div v-else>
        <TxCollapse v-model="active">
          <TxCollapseItem title="Getting Started" name="first">
            Starter content goes here.
          </TxCollapseItem>
          <TxCollapseItem title="Advanced" name="second">
            Extra options and settings.
          </TxCollapseItem>
        </TxCollapse>
  </div>
</template>
