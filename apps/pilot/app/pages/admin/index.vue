<script setup lang="ts">
definePageMeta({
  name: '管理中心',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

const greeting = computed(() => {
  // 根据当前时间决定问候语
  const time = new Date()

  const hour = time.getHours()
  if (hour < 12)
    return '早上好'
  else if (hour < 18)
    return '下午好'
  else
    return '晚上好'
})
</script>

<template>
  <div class="CmsWrapper">
    <el-scrollbar>
      <div class="Cms">
        <div class="Cms-Addon">
          <el-card class="cms-card">
            <div class="CmsApplication-Header cms-header">
              <div class="cms-start">
                <IconMimicIcon color="var(--el-color-primary);color: #fff" icon="i-carbon:user" />
                {{ greeting }}, {{ userStore.nickname }}!
              </div>
            </div>
          </el-card>
        </div>

        <div class="Cms-Content">
          <el-card class="cms-card">
            <div class="cms-header">
              <div class="cms-start">
                <IconMimicIcon color="var(--el-color-primary);color: #fff" icon="i-carbon:notification" />
                系统公告
              </div>
              请注意保护系统隐私,请勿在公共场合打开管理系统.
              <div class="cms-end">
                <el-link type="primary">
                  更多公告
                </el-link>
              </div>
            </div>
          </el-card>
        </div>

        <div class="Cms-User">
          <LazyCmsUser />
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style lang="scss">
.CmsWrapper {
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: calc(100% - 72px);
}

.cms-card {
  .cms-header {
    .cms-start {
      display: flex;

      gap: 0.5rem;
      opacity: 0.75;
      align-items: center;
    }

    display: flex;

    font-size: 14px;
    justify-content: space-between;
  }

  margin: 1rem 0;

  flex-shrink: 0;

  overflow: hidden;
  border-radius: 16px;
  background-color: var(--el-fill-color);
}

.Cms-Addon {
  height: 100%;
  min-width: 200px;
  width: 35%;
  max-width: 480px;
}

.Cms-Content {
  width: 100%;
  height: 100%;

  border-radius: 16px;
}

.Cms-User {
  min-width: 200px;
  width: 30%;
  max-width: 480px;
}

.Cms {
  position: relative;
  padding: 1rem;
  display: flex;

  width: 100%;
  min-height: 100%;

  gap: 1rem;

  justify-content: space-between;
}
</style>
