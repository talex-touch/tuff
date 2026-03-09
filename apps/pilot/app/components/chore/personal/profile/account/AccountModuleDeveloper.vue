<script setup lang="ts">
const pageOptions: any = inject('appOptions')!

function getBuildTime() {
  return __BuildTime__
}

const guide = ref(true)

watch(() => guide.value, () => {
  userConfig.value.pri_info.info.tutorial = guide.value
})
</script>

<template>
  <div class="Developer">
    <el-empty v-if="!userStore.subscription?.type" description="你暂未获得开发者设置授权！" />
    <template v-else>
      <TemplateLineForm title="系统信息构建" desc="当前版本构建推送时间">
        <el-text>{{ formatDate(getBuildTime()) }}</el-text>
      </TemplateLineForm>
      <TemplateLineForm title="隐私模式" desc="启用全面隐私模式，将隐藏所有展示个人隐私信息（单次有效）。">
        <el-switch v-model="pageOptions.setting.privacy" />
      </TemplateLineForm>
      <TemplateLineForm title="引导模式" desc="启用引导模式，将重新打开系统引导。">
        <el-switch v-model="guide" />
      </TemplateLineForm>
      <TemplateLineForm title="应用授权AccessToken" desc="AccessToken是重要的访问凭证，复制之前请确保您知道自己在做什么。">
        <div v-copy="userStore.token?.accessToken" i-carbon:copy cursor-pointer />
      </TemplateLineForm>
      <TemplateLineForm danger title="恒定授权RefreshToken" desc="RefreshToken是重要的访问凭证，复制之前请确保您知道自己在做什么。">
        <div v-copy="userStore.token?.accessToken" i-carbon:copy cursor-pointer />
      </TemplateLineForm>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.Developer {
  & :last-child {
    border-bottom: none !important;
  }
}
</style>
