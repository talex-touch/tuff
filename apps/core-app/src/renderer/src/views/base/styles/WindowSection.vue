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
/** Artboard `E0C1Zz` · 窗口效果: three previews across, 16 gutter, 16 inside the group card. */
.WindowsSection-Container {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--shell-space-4);
  width: 100%;
  box-sizing: border-box;
  padding: var(--shell-space-4);
}

@media (max-width: 1080px) {
  .WindowsSection-Container {
    grid-template-columns: 1fr;
  }
}
</style>
