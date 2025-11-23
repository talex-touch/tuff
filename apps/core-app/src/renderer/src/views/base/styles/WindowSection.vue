<script lang="ts" name="WindowsSection" setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div ref="wrapperRef" class="WindowSection-Wrapper fake-background">
    <p mb-2 ml-2 font-600 text-lg>
      {{ t('windowSection.title') }}
    </p>
    <div
      gap-4
      box-border
      relative
      w-full
      flex
      items-center
      justify-center
      class="WindowsSection-Container"
    >
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.WindowSection-Wrapper {
  padding: 0.5rem;

  border: 1px solid var(--el-border-color);

  --fake-inner-opacity: 0.5;
  --fake-radius: 18px;
  --fake-color: var(--el-fill-color-dark);
}

.WindowsSection-Container {
  height: 12rem;
}
</style>
