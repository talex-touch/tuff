<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="max-width: 520px;">
      <TxBlankSlate
        title="Create your first project"
        description="Start by creating a project to organize your work."
        :primary-action="{ label: 'Create', type: 'primary' }"
        :secondary-action="{ label: 'Learn more' }"
      />
    </div>
  </div>
  <div v-else>
    <div style="max-width: 520px;">
      <TxBlankSlate
        title="Create your first project"
        description="Start by creating a project to organize your work."
        :primary-action="{ label: 'Create', type: 'primary' }"
        :secondary-action="{ label: 'Learn more' }"
      />
    </div>
  </div>
</template>
