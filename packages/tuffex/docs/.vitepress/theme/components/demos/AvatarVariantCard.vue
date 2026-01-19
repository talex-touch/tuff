<script setup lang="ts">
defineProps<{
  title: string
  category: string
  desc: string
}>()
</script>

<template>
  <div class="tx-avatar-variants__card">
    <div class="tx-avatar-variants__preview">
      <div class="tx-avatar-variants__grid-bg" aria-hidden="true" />
      <div class="tx-avatar-variants__preview-scale">
        <slot name="preview" />
      </div>
    </div>
    <div class="tx-avatar-variants__info">
      <div class="tx-avatar-variants__info-head">
        <h3 class="tx-avatar-variants__title">{{ title }}</h3>
        <span class="tx-avatar-variants__tag">{{ category }}</span>
      </div>
      <p class="tx-avatar-variants__desc">{{ desc }}</p>
    </div>
  </div>
</template>
