<script lang="ts" name="ClassicController" setup></script>

<template>
  <div class="ClassicController fake-background">
    <div class="ClassicController-Tabs">
      <slot name="navbar" />
    </div>
    <div class="ClassicController-Extra">
      <slot name="nav" />
      <slot name="title" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ClassicController {
  display: flex;
  align-items: center;
  width: 100%;
  height: var(--ctr-height);
  padding: 0 8px;
  gap: 12px;
  --fake-inner-opacity: 0.5;
}

.ClassicController-Tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.ClassicController-Extra {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
