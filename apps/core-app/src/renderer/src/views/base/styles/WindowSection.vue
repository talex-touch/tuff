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
    <div
      gap-4
      box-border
      relative
      w-full
      flex
      items-center
      justify-center
      class="WindowsSection-Container p-2"
    >
      <slot />
    </div>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.WindowsSection-Container {
  height: 12rem;
}
</style>
