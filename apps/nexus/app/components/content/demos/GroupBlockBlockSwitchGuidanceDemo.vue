<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const dummy = ref('')
const handleClick = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxBlockSwitch
          v-model="dummy"
          title="隐私设置"
          description="管理您的隐私选项"
          default-icon="i-ri-shield-keyhole-line"
          guidance
          @click="handleClick"
        />
  </div>
  <div v-else>
        <TxBlockSwitch
          v-model="dummy"
          title="隐私设置"
          description="管理您的隐私选项"
          default-icon="i-ri-shield-keyhole-line"
          guidance
          @click="handleClick"
        />
  </div>
</template>
