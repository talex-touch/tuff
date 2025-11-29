<template>
  <div class="min-h-screen text-light">
    <TheHeader class="z-10" />
    <main class="relative z-1 w-full">
      <slot />
    </main>
  </div>
  <TuffFooter />
</template>
