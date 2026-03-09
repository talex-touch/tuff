<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  block: IInnerItemMeta
}>()

// 去除文本中的括号以及括号内的内容 比如 a (2323124你好) => a [包括a后面的空格也要去除]
const _text = computed(() => {
  const text = props.block.value

  if (text.includes('aborted'))
    return [`主体请求已被取消 (手动)`, '1100']

  if (text.includes('code') && text.includes('1101'))
    return [`登录状态异常`, '1101']

  if (!text.includes(' ('))
    return [`${text}`, '500']

  const reg = /\((.*?)\)/g

  const content = text.replace(reg, '')

  // 提取文本中的错误码 比如：401 该令牌状态不可用 => 401
  const errCode = content.match(/[0-9]{3}/)?.[0]

  const value = content.replace(errCode || '', '').trim()
  // 如果得到的内容是 当前分组 default 下对于模型 gpt-4o-mini 计费模式 [按量计费,按次计费] 无可用渠道
  // 上面这种格式 其中 default gpt-4o-mini 是变量
  if (value.includes('当前分组') && value.includes('无可用渠道'))
    return ['无法使用该模型', errCode]

  return [value, errCode]
})

// 获取文本中括号的内容
const _bracket = computed(() => {
  const text = props.block.value
  const reg = /\((.*?)\)/g

  const content = text.match(reg)?.[0] || ''

  // 提取括号中的内容 比如：(2323124你好) => 2323124你好
  // 然后括号中的内容会是 request id: 123456456456456465 => 只提取这一串不定长数字
  const bracketContent = content.match(/[0-9]{3,}/)?.[0] || ''

  return bracketContent
})

const description = computed(() => {
  const title = _text.value[0]
  if (!title)
    return null

  if (title.includes('状态不可用'))
    return [0, '由于您长时间未进行任何操作，系统为保障安全已自动注销您的会话。请您重新登录以获取新的访问令牌，以便继续正常使用系统各项功能。感谢您的理解与配合。']

  else if (title.includes('额度已用尽'))
    return [1, '您已达到限制，升级订阅计划以继续使用科塔智爱。为确保服务不受影响，建议您尽快完成订阅计划升级。如有任何疑问，欢迎随时联系客服咨询。感谢您的支持与理解。']
  else if (+_text.value[1]! === 503)
    return [2, '当前模型的使用需升级至更高级的订阅计划。请前往订阅页面选择合适的套餐进行升级，以便继续使用该模型的所有功能。感谢您的理解和支持。']
  else if (title.includes('未登录'))
    return [3, '您尚未登录，请先登录以继续使用科塔智爱系统的全部功能。为确保正常体验，请前往登录页面完成登录操作。如有任何疑问，欢迎联系客服获取帮助。感谢您的理解与支持。']
  else if (+_text.value[1]! === 500)
    return [0, '发生未知错误，请联系管理员以获取进一步支持。我们将尽快为您解决问题，感谢您的理解和配合。']
  else if (+_text.value[1]! === 1100)
    return [4, '由于手动取消了请求，当前请求已被终止。请尝试重新发起请求以发起新对话。']
  else if (+_text.value[1]! === 1101)
    return [3, '检测到您的登录状态出现异常，建议您尝试重新发送消息以恢复正常使用。']

  else return [-1, props.block.value]
})

const pageOptions: any = inject('appOptions')!

function handleClick() {
  const code = +(description.value?.[0] || '0')

  if (code === 3)
    pageOptions.model.login = true
}
</script>

<template>
  <div class="ErrorCard">
    <div text-sm text-red font-bold class="ErrorCard-Header">
      <i i-carbon:error block />
      <div>
        <span v-if="_text">
          {{ _text[0] }}
        </span>
        <span v-else>
          {{ block.value }}
        </span>
      </div>
    </div>

    <div text-gray-500 class="ErrorCard-Content">
      <!-- 根据错误码内容来确定错误原因，尝试重新请求或者联系管理员解决。 -->
      <p v-if="description?.[1]" v-text="description[1]" />
      <p v-else>
        无法寻找到解决方案，请尝试重新登录！
      </p>
      <!-- <el-tooltip content="为何发生此问题？">

      </el-tooltip> -->

      <p my-2 flex cursor-pointer items-center gap-1 op-75>
        <i i-carbon:information block />
        为何会发生此问题？
      </p>
    </div>

    <div v-if="_bracket" flex items-center gap-1 class="ErrorCard-Footer">
      <el-tooltip content="请求识别ID">
        <div i-carbon:id text-lg />
      </el-tooltip> {{ _bracket }}
      <div v-copy="_bracket" i-carbon:copy cursor-pointer />
    </div>
  </div>

  <div v-if="description && +description[0] !== 4" v-wave class="ErrorCard-Addon" @click="handleClick">
    <template v-if="+description[0] === 0">
      <i i-carbon:chat-bot block /> 联系客服
    </template>
    <template v-else-if="+description[0] <= 2">
      <div class="primary bg" />

      <span text-white font-bold><i i-carbon:upgrade block /> 立即升级</span>
    </template>
    <template v-if="+description[0] === 3">
      <i i-carbon:login block /> 立即登录
    </template>
  </div>
</template>

<style lang="scss">
.ErrorCard-Addon {
  .bg {
    z-index: -1;
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    border-radius: 12px;
    &.primary {
      background-color: var(--el-color-primary);
    }
  }
  & > span {
    display: flex;

    gap: 0.5rem;
    align-items: center;
  }
  position: relative;
  display: flex;
  margin: 0.5rem 0;
  padding: 0.5rem 0.75rem;

  gap: 0.5rem;
  align-items: center;

  width: max-content;
  max-width: 70%;

  opacity: 0.75;
  font-size: 14px;
  cursor: pointer;
  border-radius: 12px;
  background-color: var(--el-bg-color-page);
}

.ErrorCard {
  &-Footer {
    margin-top: 0.5rem;

    font-size: 12px;
  }

  &-Content {
    margin: 0.25rem 0.25rem 0 0.25rem;

    font-size: 14px;
    // color: var(--el-text-color-secondary);
  }

  &-Header {
    display: flex;

    gap: 0.5rem;
    align-items: center;
  }

  padding: 0.75rem 0.75rem;

  width: max-content;
  max-width: 70%;

  border-radius: 18px;
  background-color: var(--el-bg-color-page);
}
</style>
