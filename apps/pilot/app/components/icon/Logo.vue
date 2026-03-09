<template>
  <div class="Logo-Container font-rounded">
    <div class="Logo">
      <div class="logo-first"></div>
      <div class="logo-right"></div>
    </div>
    <div v-if="!onlyLogo" class="Logo-Text">
      <span>TalexWiki</span>
    </div>
  </div>
</template>

<script>
export default {
  name: "Logo"
}
</script>

<script setup>
const props = defineProps({
  onlyLogo: {
    type: Boolean,
    default: false
  }
})
</script>

<style lang="scss" scoped>
.Logo-Container {
  .Logo-Text {
    width: 70%;
    span {
      position: relative;

      line-height: 50px;

      font-size: 16px;
      color: var(--el-text-color-regular);
      transition: all .05s;
    }
    text-align: center;
  }
  .Logo {
    width: 30%;
    div {
      position: relative;

      left: 50%;
      top: 50%;

      width: 15px;
      height: 15px;

      background: #60d0fe;
      border-radius: 22px / 14px;
      transform: translate(-50%, -50%) translate(2px, -1px);
      opacity: .8;
      filter: contrast(120%) saturate(180%);
    }

    div.logo-right {
      border-radius: 22px / 19px;
      background: #2d46fe;
      opacity: .68;
      transform: translate(-50%, -50%) translate(-2px, -13px);
    }
  }
  z-index: 999;
  position: relative;
  padding: 0 2px;
  display: flex;
  justify-content: space-between;

  top: 0;
  left: 0;

  height: 50px;

  font-size: 22px;
  color: #fffffe;
  //background-color: #3a78f2;
  transition: all .05s linear;

}

</style>
