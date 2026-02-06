<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxTimeline>
          <TxTimelineItem title="设计阶段" time="09:30" color="primary" />
          <TxTimelineItem title="开发构建" time="12:00" color="success" />
          <TxTimelineItem title="上线发布" time="16:10" color="warning" />
        </TxTimeline>
  </div>
  <div v-else>
        <TxTimeline>
          <TxTimelineItem title="Design phase" time="09:30" color="primary" />
          <TxTimelineItem title="Build" time="12:00" color="success" />
          <TxTimelineItem title="Launch" time="16:10" color="warning" />
        </TxTimeline>
  </div>
</template>
