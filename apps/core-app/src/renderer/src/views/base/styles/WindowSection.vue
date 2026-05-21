<script lang="ts" name="WindowsSection" setup>
import { useI18n } from 'vue-i18n'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

const { t } = useI18n()
</script>

<template>
  <TuffGroupBlock
    ref="wrapperRef"
    :name="t('windowSection.title')"
    :description="t('windowSection.description')"
    class="WindowSection-Wrapper"
  >
    <div box-border relative w-full class="WindowsSection-Container p-2">
      <slot />
    </div>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.WindowsSection-Container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  min-height: 12rem;
}
</style>
