<script lang="ts" setup>
import Hello from './Hello.vue'
import { $event } from '~/composables/events'

const handleNext: any = inject('handleNext')

const open = ref(true)

onMounted(() => {
  $event.emit('REQUEST_TOGGLE_SIDEBAR', true)

  const obj = {
    component: null,
    data: {
      tour: true,
    },
  }

  handleNext(obj)
})

function handleFinish() {
  handleNext({
    component: Hello,
    data: {},
  })
}

const nextButtonProp = {
  children: '下一步',
}

const prevButtonProp = {
  children: '上一步',
}
</script>

<template>
  <el-tour v-model="open" :show-close="false" z-10 @finish="handleFinish">
    <el-tour-step
      :next-button-props="nextButtonProp" :prev-button-props="prevButtonProp" placement="right"
      target=".DefaultTemplate-Container aside.el-aside" title="功能导航" description="在这里去切换不同的功能，聊天、智能体、文档等。"
    />
    <el-tour-step
      :next-button-props="nextButtonProp" :prev-button-props="prevButtonProp" placement="right"
      target=".PageContainer-History" title="历史记录" description="所有的对话都会在这里显示，你可以复制、查询或删除某个对话。"
    />
    <el-tour-step
      :next-button-props="nextButtonProp" :prev-button-props="prevButtonProp" placement="bottom"
      target=".PageContainer-History .History-Title" title="新建与查询" description="这里可以快速新建一个对话或查询一个对话。"
    />
    <el-tour-step
      :next-button-props="nextButtonProp" :prev-button-props="prevButtonProp" placement="right"
      target=".PageContainer-Main" title="对话面板" description="你可以在这里进行对话，只需要发一条消息，对话会立即创建并且被保存。"
    />
    <el-tour-step
      :next-button-props="nextButtonProp" :prev-button-props="prevButtonProp" placement="top"
      target=".PageContainer-Main .ThInput" title="聊天框" description="在这里输入的消息可以通过Ctrl+小键盘的上下键来快速浏览历史记录"
    />
    <!-- <el-tour-step
      placement="top" target=".PageContainer-Main .ThInput .ThInputAt" title="拓展功能"
      description="这里可以控制每次聊天的具体参数，你也可以直接粘贴文件、图片在聊天框内。"
    />
    <el-tour-step
      placement="top" target=".PageContainer-Main .ThInput .ThInput-Input" title="富态编辑"
      description="你可以通过输入以@开头的角色，以/开头的超级命令。"
    /> -->
    <!-- <el-tour-step
      placement="top" target=".PageContainer-Main .Chat-StatusBar" title="状态条"
      description="这里显示了当前对话的参数，会随着聊天进行改变，大部分按钮都是可以点击的。比如，在未同步情况下点击标签可以直接触发同步。"
    /> -->
    <el-tour-step
      :next-button-props="nextButtonProp" :prev-button-props="prevButtonProp" title="非常好"
      description="相信你已经掌握了大部分的功能，现在你可以开始使用啦！"
    />
  </el-tour>
</template>

<style lang="scss"></style>
