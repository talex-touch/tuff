<template>
  <div class="WindowSection-Wrapper fake-background">
    <p>Window Preference</p>
    <div gap-4 box-border relative w-full flex items-center justify-center class="WindowsSection-Container">
      <slot />
    </div>
  </div>
</template>

<script name="WindowsSection" setup>

</script>

<style lang="scss">
.WindowSection-Wrapper {
  margin: 1rem 0;
  padding: 1rem;

  --fake-radius: 8px;
}

.WindowsSection-Container {
  padding: 1rem 0;

  height: 12rem;
}
</style>