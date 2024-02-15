<script lang="ts" name="AgreementTemplate" setup>
import FlatMarkdown from "@comp/base/input/FlatMarkdown.vue";
import FlatButton from "@comp/base/button/FlatButton.vue";

const props = defineProps({
  agreement: {
    type: String,
    required: true,
  },
  agree: {
    type: Function,
    required: true,
  },
  title: {
    type: String,
    default: "Agreement",
  },
});
const content = ref("");

watchEffect(() => {
  content.value = props.agreement;
});

async function dispose(agree: boolean) {
  props.agree(agree);
}
</script>

<template>
  <div class="AgreeTemplate-Container">
    <p font-600>{{ title }}</p>
    <span mb-2> To use this software, you must agree this terms. </span>
    <el-scrollbar>
      <div class="AgreeTemplate-Content">
        <FlatMarkdown :readonly="true" v-model="content" />
      </div>
    </el-scrollbar>
    <div justify-center box-border w="85%" mt-4 flex gap-8>
      <FlatButton @click="dispose(false)" hover:bg-red> Cancel </FlatButton>
      <FlatButton @click="dispose(true)" :primary="true"> Agree </FlatButton>
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

  p {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .AgreeTemplate-Content {
    max-height: 380px;
    width: 100%;
    max-width: 1280px;

    border-radius: 8px;

    user-select: none;
    border-radius: 4px;
    padding: 12px;
    box-sizing: border-box;
    font-size: 14px;
    line-height: 1.5715;
    color: #606266;
    transition: border-color 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
    position: relative;
  }
}
</style>
