<script setup lang="ts">
definePageMeta({
  layout: false,
})

const router = useRouter()
const route = useRoute()

function goBack() {
  if (window.history.length > 2) {
    router.back()
  }
  else {
    router.push('/')
  }
}

function goHome() {
  router.push('/')
}
</script>

<template>
  <div class="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
    <!-- Background decorations -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl dark:bg-primary/10" />
      <div class="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-violet-500/5 blur-3xl dark:bg-violet-500/10" />
    </div>

    <!-- Grid pattern -->
    <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,.02)_1px,transparent_1px)] bg-[size:64px_64px] dark:bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)]" />

    <main class="relative z-10 px-6 text-center">
      <!-- 404 Number -->
      <div class="relative mb-8">
        <span class="select-none text-[12rem] font-black leading-none tracking-tighter text-gray-100 dark:text-gray-800 sm:text-[16rem]">
          404
        </span>
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="flex items-center gap-3">
            <span class="i-carbon-warning-alt text-5xl text-primary/80 sm:text-6xl" />
          </div>
        </div>
      </div>

      <!-- Text content -->
      <div class="mx-auto max-w-md space-y-4">
        <h1 class="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
          Page not found
        </h1>
        <p class="text-base text-gray-500 dark:text-gray-400">
          The page
          <code class="mx-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ route.path }}</code>
          doesn't exist or has been moved.
        </p>
      </div>

      <!-- Actions -->
      <div class="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
        <Button
          variant="primary"
          size="lg"
          class="w-full sm:w-auto"
          @click="goHome"
        >
          <span class="i-carbon-home text-lg" />
          Back to Home
        </Button>
        <Button
          variant="secondary"
          size="lg"
          class="w-full sm:w-auto"
          @click="goBack"
        >
          <span class="i-carbon-arrow-left text-lg" />
          Go Back
        </Button>
      </div>

      <!-- Help links -->
      <div class="mt-16 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500 dark:text-gray-400">
        <NuxtLink
          to="/docs"
          class="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
        >
          <span class="i-carbon-document" />
          Documentation
        </NuxtLink>
        <span class="hidden h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600 sm:block" />
        <NuxtLink
          to="/market"
          class="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
        >
          <span class="i-carbon-application" />
          Marketplace
        </NuxtLink>
        <span class="hidden h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600 sm:block" />
        <a
          href="https://github.com/AkariNext/Tuff"
          target="_blank"
          class="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
        >
          <span class="i-carbon-logo-github" />
          GitHub
        </a>
      </div>
    </main>

    <!-- Footer -->
    <div class="absolute bottom-6 left-0 right-0 text-center text-xs text-gray-400 dark:text-gray-600">
      Tuff © {{ new Date().getFullYear() }}
    </div>
  </div>
</template>
