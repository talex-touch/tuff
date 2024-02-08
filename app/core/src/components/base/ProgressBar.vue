<template>
  <div class="ProgressBar-Wrapper">
    <div class="ProgressBar-Container" :class="{ loading, error, success }">
      {{ message }}
    </div>
  </div>
</template>

<script>
export default {
  name: "ProgressBar"
}
</script>

<script lang="ts" setup>
defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: Boolean,
    default: false
  },
  success: {
    type: Boolean,
    default: false
  },
  message: {
    type: String,
    default: ''
  }
})
// const props = defineProps(['loading', 'error', 'success', 'message'])

</script>

<style lang="scss" scoped>
@keyframes loading {
  0% {
    width: 0;
    left: -100%;
  }

  100% {
    left: 100%;
    width: 100%;
  }
}

.ProgressBar-Container {
  &.loading {
    animation: loading 1.25s infinite;
  }

  &.error {
    height: 30px;

    border-radius: 0;
    background-color: var(--el-color-danger);
  }

  &.success {
    height: 8px;

    border-radius: 0;
    background-color: var(--el-color-success);
  }

  position: relative;
  display: flex;

  justify-content: center;
  align-items: center;

  width: 100%;
  height: 5px;

  transition: .25s;
  border-radius: 8px;
  background-color: var(--el-color-primary);
}

.ProgressBar-Wrapper {
  position: relative;

  width: 100%;
  //height: 5px;

  overflow: hidden;
  //border-radius: 8px;
}</style>