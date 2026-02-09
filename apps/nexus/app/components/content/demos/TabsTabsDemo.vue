<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { locale } = useI18n()
const active = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      generalTab: '通用',
      accountTab: '账户',
      aboutTab: '关于',
      generalTitle: '通用设置',
      generalDesc: '基础设置内容',
      accountTitle: '账户设置',
      accountDesc: '账户相关内容',
      aboutTitle: '关于',
      aboutDesc: '关于页面内容',
    }
  }

  return {
    generalTab: 'General',
    accountTab: 'Account',
    aboutTab: 'About',
    generalTitle: 'General',
    generalDesc: 'Basic settings content',
    accountTitle: 'Account',
    accountDesc: 'Account settings content',
    aboutTitle: 'About',
    aboutDesc: 'About content',
  }
})

watch(
  () => locale.value,
  () => {
    active.value = labels.value.generalTab
  },
  { immediate: true },
)
</script>

<template>
  <div style="height: 320px;">
    <TxTabs v-model="active">
      <TxTabItem :name="labels.generalTab" icon-class="i-carbon-settings" activation>
        <div style="padding: 8px;">
          <h3 style="margin: 0 0 8px;">
            {{ labels.generalTitle }}
          </h3>
          <p style="margin: 0; color: var(--tx-text-color-secondary);">
            {{ labels.generalDesc }}
          </p>
        </div>
      </TxTabItem>
      <TxTabItem :name="labels.accountTab" icon-class="i-carbon-user">
        <div style="padding: 8px;">
          <h3 style="margin: 0 0 8px;">
            {{ labels.accountTitle }}
          </h3>
          <p style="margin: 0; color: var(--tx-text-color-secondary);">
            {{ labels.accountDesc }}
          </p>
        </div>
      </TxTabItem>
      <TxTabItem :name="labels.aboutTab" icon-class="i-carbon-information">
        <div style="padding: 8px;">
          <h3 style="margin: 0 0 8px;">
            {{ labels.aboutTitle }}
          </h3>
          <p style="margin: 0; color: var(--tx-text-color-secondary);">
            {{ labels.aboutDesc }}
          </p>
        </div>
      </TxTabItem>
    </TxTabs>
  </div>
</template>
