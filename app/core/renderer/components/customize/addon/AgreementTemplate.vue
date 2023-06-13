<script lang="ts" name="AgreementTemplate" setup>
import FlatMarkdown from '@comp/base/input/FlatMarkdown.vue'
import FlatButton from '@comp/base/button/FlatButton.vue'

const props = defineProps({
  agreement: {
    type: String,
    required: true
  },
  agree: {
    type: Function,
    required: true
  }
})
const content = ref()
const destroy: Function = inject('destroy')

watchEffect(() => {
  content.value = props.agreement
})

async function dispose(agree: boolean) {
  await destroy()

  props.agree(agree)
}
</script>

<template>
  <div class="AgreeTemplate-Container">
    <p font-600>Agreement</p>
    <el-scrollbar>
      <div class="AgreeTemplate-Content">
        <FlatMarkdown v-model="content" />
      </div>
    </el-scrollbar>
    <div box-border w="85%" mt-4 flex gap-8>
      <FlatButton @click="dispose(false)" hover:bg-red>
        Cancel
      </FlatButton>
      <FlatButton @click="dispose(true)" :primary="true">
        Agree
      </FlatButton>
    </div>
  </div>
</template>

<style lang="scss">
.AgreeTemplate-Container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;

  p {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .AgreeTemplate-Content {

    max-height: 220px;
    width: 100%;
    max-width: 1280px;

    overflow: hidden;

    border: 1px solid #ebeef5;
    border-radius: 4px;
    padding: 12px;
    box-sizing: border-box;
    font-size: 14px;
    line-height: 1.5715;
    color: #606266;
    transition: border-color 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);

    &:focus {
      outline: none;
      border-color: #409eff;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
    }
  }
}
</style>