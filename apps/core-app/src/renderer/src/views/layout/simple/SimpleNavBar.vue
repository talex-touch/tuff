<script lang="ts" name="SimpleNavBar" setup></script>

<template>
  <ul class="SimpleNavBar-Home">
    <slot />
    <slot name="plugins" />
  </ul>
</template>

<style lang="scss" scoped>
@use '~/styles/layout/navbar-base' as *;

:deep(.SimpleNavBar-Title) {
  @include navbar-title;
  margin: 0 0 0.5rem 0;
}

.SimpleNavBar-Home {
  @include navbar-container;
  padding: 0.5rem 0;
}
</style>
