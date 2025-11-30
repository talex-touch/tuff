<script setup lang="ts">
definePageMeta({
  middleware: [
    () => navigateTo('/dashboard/overview'),
  ],
})

defineI18nRoute(false)
</script>
