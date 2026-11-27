<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      start: '开始',
      startDesc: '收集基础信息',
      details: '填写',
      detailsDesc: '补充详细内容',
      finish: '完成',
      finishDesc: '确认提交',
      verticalTitle: '发布流程',
      draft: '草稿',
      draftDesc: '内容已保存',
      review: '审核',
      reviewDesc: '等待负责人确认',
      publish: '发布',
      publishDesc: '审核后解锁',
    }
  : {
      start: 'Start',
      startDesc: 'Collect basics',
      details: 'Details',
      detailsDesc: 'Fill in details',
      finish: 'Finish',
      finishDesc: 'Review and submit',
      verticalTitle: 'Release flow',
      draft: 'Draft',
      draftDesc: 'Content saved',
      review: 'Review',
      reviewDesc: 'Waiting for approval',
      publish: 'Publish',
      publishDesc: 'Unlocked after review',
    }))
</script>

<template>
  <div class="steps-demo">
    <TxSteps :active="1">
      <TxStep :title="labels.start" :description="labels.startDesc" :step="0" />
      <TxStep :title="labels.details" :description="labels.detailsDesc" :step="1" />
      <TxStep :title="labels.finish" :description="labels.finishDesc" :step="2" />
    </TxSteps>

    <section class="steps-demo__card">
      <h4>{{ labels.verticalTitle }}</h4>
      <TxSteps direction="vertical" size="small" active="review">
        <TxStep :title="labels.draft" :description="labels.draftDesc" step="draft" status="completed" />
        <TxStep :title="labels.review" :description="labels.reviewDesc" step="review" icon="i-carbon-in-progress" />
        <TxStep :title="labels.publish" :description="labels.publishDesc" step="publish" disabled />
      </TxSteps>
    </section>
  </div>
</template>

<style scoped>
.steps-demo {
  display: grid;
  width: min(620px, 100%);
  gap: 24px;
}

.steps-demo__card {
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 16px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 14px;
  background: var(--tx-fill-color-lighter);
}

.steps-demo__card h4 {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 14px;
}
</style>
