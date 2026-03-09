<script setup lang="ts">
import { getUserBindingPlatforms } from '~/composables/api/account'

const links = ref()

onMounted(async () => {
  const res: any = await getUserBindingPlatforms()

  if (res.code !== 200)
    return ElMessage.error(res.message)

  links.value = res.data
})

// function parseMeta(str: string) {
//   return JSON.parse(decodeURIComponent(atob(str)))
// }
</script>

<template>
  <div class="Link">
    <template v-if="links">
      <el-descriptions v-for="link in links" :key="link.id" my-2 :column="3" size="small" border>
        <template #title>
          <div v-if="link.provider === 'wechat'" flex items-center gap-2>
            <div i-carbon:logo-wechat />
            微信
          </div>
          <div v-else-if="link.provider === 'feishu'" flex items-center gap-2>
            <div i-carbon:ibm-z-cloud-mod-stack />
            飞书
          </div>
        </template>

        <template #extra>
          <el-button disabled type="primary">
            解绑
          </el-button>
        </template>

        <el-descriptions-item>
          <template #label>
            <div class="cell-item">
              ID
            </div>
          </template>
          {{ link.openId }}
        </el-descriptions-item>
        <el-descriptions-item>
          <template #label>
            <div class="cell-item">
              绑定时间
            </div>
          </template>
          {{ formatDate(link.updatedAt) }}
        </el-descriptions-item>
        <el-descriptions-item>
          <template #label>
            <div class="cell-item">
              标记
            </div>
          </template>
          <el-tag v-if="link.isActive" size="small">
            已激活
          </el-tag>
          <el-tag v-else type="warning">
            未激活
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item>
          <template #label>
            <div class="cell-item">
              附加数据
            </div>
          </template>
          -
          <!-- {{ parseMeta(link.meta) }} -->
        </el-descriptions-item>
      </el-descriptions>
    </template>
    <template v-else>
      <el-skeleton animated />
    </template>
  </div>
</template>

<style lang="scss" scoped>

</style>
