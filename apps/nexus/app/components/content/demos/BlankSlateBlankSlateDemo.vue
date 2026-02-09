<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxBlankSlate
          title="Create your first project"
          description="Start by creating a project to organize your work."
          :primary-action="{ label: 'Create', type: 'primary' }"
          :secondary-action="{ label: 'Learn more' }"
        />
  </div>
  <div v-else>
        <TxBlankSlate
          title="Create your first project"
          description="Start by creating a project to organize your work."
          :primary-action="{ label: 'Create', type: 'primary' }"
          :secondary-action="{ label: 'Learn more' }"
        />
  </div>
</template>
