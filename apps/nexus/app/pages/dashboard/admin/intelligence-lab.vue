<script setup lang="ts">
definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

throw createError({
  statusCode: 410,
  statusMessage: 'Deprecated intelligence-lab page. Use /dashboard/admin/intelligence-agent instead.',
  fatal: false,
})
</script>
