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
    <div class="WindowsSection-Container">
      <slot />
    </div>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.WindowsSection-Container {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  min-height: 11rem;
  box-sizing: border-box;
  padding: 8px;
}

@media (max-width: 1080px) {
  .WindowsSection-Container {
    grid-template-columns: 1fr;
    min-height: 0;
  }
}
</style>
