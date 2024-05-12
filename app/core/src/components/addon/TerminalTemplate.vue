<script lang="ts" name="AgreementTemplate" setup>
const props = defineProps({
  title: {
    type: String,
    default: "TERMINAL",
  },
});
</script>

<template>
  <div class="TerminalTemplate-Container">
    <p font-600>{{ title }}</p>
    <el-scrollbar> HELLO </el-scrollbar>
  </div>
</template>

<style lang="scss">
.TerminalTemplate-Container {
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

  .TerminalTemplate-Content {
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
