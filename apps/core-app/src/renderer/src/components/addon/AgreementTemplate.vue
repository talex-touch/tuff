<script lang="ts" name="AgreementTemplate" setup>
import FlatMarkdown from '~/components/base/input/FlatMarkdown.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  agreement: {
    type: String,
    required: true
  },
  agree: {
    type: Function,
    required: true
  },
  title: {
    type: String,
    default: 'agreement.title'
  }
})
const content = ref('')

watchEffect(() => {
  content.value = props.agreement
})

async function dispose(agree: boolean): Promise<void> {
  props.agree(agree)
}
</script>

<template>
  <div class="AgreeTemplate-Container">
    <p font-600>{{ t(title) }}</p>
    <span mb-2> {{ t('agreement.description') }} </span>
    <div class="AgreeTemplate-Content">
      <el-scrollbar>
        <FlatMarkdown v-model="content" :readonly="true" />
      </el-scrollbar>
    </div>

    <div justify-center box-border w="85%" mt-4 flex gap-8>
      <FlatButton hover:bg-red @click="dispose(false)"> {{ t('agreement.decline') }} </FlatButton>
      <FlatButton :primary="true" @click="dispose(true)"> {{ t('agreement.accept') }} </FlatButton>
    </div>
  </div>
</template>

<style lang="scss">
.AgreeTemplate-Container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;

  p {
    font-size: 1.2rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: var(--el-text-color-primary);
  }

  > span {
    margin-bottom: 1rem;
    color: var(--el-text-color-regular);
    font-size: 0.9rem;
  }

  .el-scrollbar {
    flex: 1;
    width: 100%;
    max-width: 1280px;
  }

  .AgreeTemplate-Content {
    width: 100%;
    max-width: 1280px;

    border-radius: 8px;
    user-select: none;
    padding: 1rem;
    box-sizing: border-box;
    font-size: 0.9rem;
    line-height: 1.6;
    overflow: hidden;
    color: var(--el-text-color-regular);
    background-color: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color);

    :deep(.markdown-body) {
      background-color: transparent;
      color: inherit;

      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        color: var(--el-text-color-primary);
        margin-top: 1rem;
        margin-bottom: 0.5rem;
      }

      p {
        margin-bottom: 1rem;
        font-size: inherit;
        color: inherit;
      }
    }
  }
}
</style>
