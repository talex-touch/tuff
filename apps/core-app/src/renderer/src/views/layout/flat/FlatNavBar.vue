<script lang="ts" name="FlatNavBar" setup></script>

<template>
  <ul class="FlatNavBar-Home">
    <slot />
  </ul>
</template>

<style lang="scss" scoped>
@use '~/styles/layout/navbar-base' as *;

:deep(.FlatNavBar-Title) {
  @include navbar-title;
  margin: 0 0 10px 0;
}

.FlatNavBar-Home {
  @include navbar-container;
  padding: 5px 0;
}
</style>
