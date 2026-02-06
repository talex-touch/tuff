<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const dummy = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="width: 560px;">
      <TxBlockSwitch
        v-model="dummy"
        title="隐私设置"
        description="管理您的隐私选项"
        default-icon="i-ri-shield-keyhole-line"
        guidance
        @click="() => {}"
      />
    </div>
  </div>
  <div v-else>
    <div style="width: 560px;">
      <TxBlockSwitch
        v-model="dummy"
        title="隐私设置"
        description="管理您的隐私选项"
        default-icon="i-ri-shield-keyhole-line"
        guidance
        @click="() => {}"
      />
    </div>
  </div>
</template>
