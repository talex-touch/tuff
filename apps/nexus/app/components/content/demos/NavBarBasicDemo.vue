<script setup lang="ts">
function noop() {}
</script>

<template>
  <div class="nav-bar-demo">
    <TxNavBar title="Title" show-back @back="noop" @click-right="noop">
      <template #right>
        <span class="nav-bar-demo__action">Edit</span>
      </template>
    </TxNavBar>

    <div class="nav-bar-demo__content">
      Content
    </div>
  </div>
</template>

<style scoped>
.nav-bar-demo {
  width: 360px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color);
  border-radius: 12px;
}

.nav-bar-demo__action {
  color: var(--tx-color-primary);
  font-size: 12px;
  font-weight: 600;
}

.nav-bar-demo__content {
  padding: 16px;
  color: var(--tx-text-color-secondary);
}
</style>
