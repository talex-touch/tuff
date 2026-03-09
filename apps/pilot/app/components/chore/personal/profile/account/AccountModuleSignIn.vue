<script setup lang="ts">
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const props = defineProps<{
  data: any
}>()

// 获取本月第一天和最后一天
const month = ref(new Date())

// :range="[new Date(2019, 2, 4), new Date(2019, 2, 24)]"
const signList = computed(() => (props.data?.data || '').split(''))
</script>

<template>
  <div flex-col style="align-items: flex-start" class="TouchDialog-Title">
    <div flex items-center gap-2>
      <div i-carbon:calendar />签到日历
    </div>
    <p style="font-size: 16px" op-50>
      您已连续签到 {{ data.amount }} 天
    </p>
  </div>
  <div class="ModuleSignin TouchDialog-Content">
    <ElConfigProvider :locale="zhCn">
      <el-calendar class="only-pc-display" :value="month">
        <template #header="{ date }">
          <span>本月签到日历</span>
          <span>{{ date }}</span>
        </template>
        <template #date-cell="{ data }">
          <p :class="{ signed: signList?.[data.day.split('-')[2] - 1] === '1', active: data.isActive }">
            {{ data.day.split('-').slice(1).join('-') }}

            <br>
            <span class="symbol">已签到</span>
          </p>
        </template>
      </el-calendar>
      <p class="only-pe-display" my-4>
        请在电脑版查阅。
      </p>
    </ElConfigProvider>
  </div>
</template>

<style lang="scss">
.ModuleSignin {
  .symbol {
    opacity: 0;
  }

  .signed {
    .symbol {
      opacity: 1;
    }
  }

  .prev,
  .next {
    pointer-events: none !important;
  }

  max-width: 720px !important;
}
</style>
