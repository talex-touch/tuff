<script lang="ts" setup>
import { ref } from 'vue'
import { $endApi } from '~/composables/api/base'

const props = defineProps<{
  show: boolean
}>()

const emits = defineEmits<{
  (e: 'update:show'): void
}>()

const visible = useVModel(props, 'show', emits)

const container = ref<HTMLElement>()

const form = reactive({
  rating: 0,
  type: '',
  lack: '',
  suggestion: '',
  loading: false,
})

const typeList = ['使用流畅', '功能完善', '界面美观', '操作简便']

// function handleClick() {
//   const el = container.value
//   if (!el)
//     return

//   el.style.height = `${el.scrollHeight}px`
// }

watch(
  () => form.rating,
  (val) => {
    const el = container.value
    if (!el) return

    if (val <= 4.5) {
      el.style.width = `${el.scrollWidth}px`
      el.style.height = `${el.scrollHeight}px`
    } else {
      el.style.width = ''
      el.style.height = ''
    }
  }
)

async function submit() {
  try {
    form.loading = true
    const res = await $endApi.v1.cms.feedback.create(form)
    console.log('res', res)
    if (res.code === 200) {
      form.loading = false
      // 清空表单
      form.rating = 0
      form.type = ''
      form.lack = ''
      form.suggestion = ''
      // 通知父组件关闭弹窗
      emits('update:show')
      
    } else {
      ElMessage({
        message: '提交失败，请重试',
        type: 'error',
        plain: true,
      })
      form.loading = false
    }
  } catch (error) {
    ElMessage({
      message: '提交失败，请重试',
      type: 'error',
      plain: true,
    })
    form.loading = false
  }
}

try {
} catch (error) {}
</script>

<template>
  <div ref="container" v-loader="form.loading" :class="{ visible }" class="FeedBack transition-cubic fake-background">
    <p class="title">
      使用反馈
    </p>

    <el-rate v-model="form.rating" show-score text-color="#ff9900" score-template="{value} 分" />

    <div class="FeedBack-Form">
      <div class="form-item">
        <p>比较满意</p>
        <div class="form-inner">
          <el-segmented v-model="form.type" :options="typeList" />
        </div>
      </div>
      <div class="form-item">
        <p>仍然不足</p>
        <div class="form-inner">
          <el-segmented v-model="form.lack" :options="typeList" />
        </div>
      </div>
      <div class="form-item">
        <p>我的建议</p>
        <div class="form-inner">
          <el-input v-model="form.suggestion" style="min-width: 315px;" type="textarea" placeholder="输入你的建议内容" />
        </div>
      </div>

      <el-button v-wave :loading="form.loading" size="large" type="primary" w-full style="border-radius: 10px;" @click="submit">
        提交
      </el-button>
    </div>
  </div>
</template>

<style lang="scss">
.FeedBack {
  &-Form {
    .form-item {
      p {
        opacity: 0.75;
      }
      margin: 0.5rem 0;
      display: flex;

      gap: 0.5rem;
    }

    position: relative;
    margin: 1rem 0;

    width: max-content;

    overflow: hidden;
  }

  p.title {
    margin: 0.5rem 0 1rem;

    font-weight: 600;
    font-size: 1.25rem;
  }
  z-index: 10;
  position: absolute;
  padding: 1rem 2rem;

  right: 2rem;
  bottom: 2rem;

  width: 250px;
  height: 120px;

  overflow: hidden;
  text-align: center;
  border-radius: 18px;

  opacity: 0;
  transform: translateX(150%);

  --fake-opacity: 0.85;
  box-shadow: var(--el-box-shadow);
  backdrop-filter: blur(18px) saturate(180%);
  &.visible {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
