<template>
  <div class="EmailIcon-Wrapper" :class="{ open }">
    <div class="EmailIcon-Container">
      <div class="EmailIcon-Folder-Wrapper">
        <div class="EmailIcon-Folder"></div>
      </div>
    </div>
  </div>
</template>

<script setup>

const props = defineProps({ open: Boolean })

</script>

<script>
export default {
  name: "Email"
}
</script>

<style lang="scss" scoped>
@keyframes rotating {

  from {

    transform: translate(-50%, -50%) rotate(0);

  }

  to {

    transform: translate(-50%, -50%) rotate(360deg);

  }

}

.EmailIcon-Wrapper.open {

  &:before {
    content: "";
    position: absolute;

    left: 50%;
    top: 50%;

    width: 100%;

    opacity: .25;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    border: 1px solid var(--el-text-color-primary);
    transform: translate(-50%, -50%);
  }

  &:after {
    content: "";
    position: absolute;

    left: 50%;
    top: 50%;

    width: 100%;

    aspect-ratio: 1 / 1;
    border-radius: 50%;
    border-top: 1px solid var(--el-text-color-primary);
    transform: translate(-50%, -50%);
    animation: rotating .95s infinite linear;
  }

  .EmailIcon-Container {

    transform: scale(.65);

  }

  .EmailIcon-Folder-Wrapper {

    transform: scale(.75);

  }

  .EmailIcon-Folder {

    border-radius: 0;

  }

  //.EmailIcon-Folder-Wrapper {
  //
  //  transform: scaleY(.75) translateY(-3px);
  //
  //}
  //
  //.EmailIcon-Folder {
  //
  //  background-color: var(--el-text-color-regular);
  //
  //  box-shadow: -1px -1px 1px 0 var(--el-text-color-secondary) inset, 0 0 2px 0 var(--el-text-color-regular);
  //
  //  transform: rotate(45deg);
  //
  //}
  //
  //.EmailIcon-Container {
  //
  //  transform: translateY(3px);
  //
  //}

}

.EmailIcon-Folder-Wrapper {
  position: relative;

  width: 100%;
  height: 100%;

  transition: .3s cubic-bezier(.25,.8,.25,1);
}

.EmailIcon-Folder {
  position: relative;

  left: 12.5%;
  top: -50%;

  width: 70%;

  aspect-ratio: 1 / 1;

  border-top: 1px solid var(--el-text-color-regular);
  border-left: 1px solid var(--el-text-color-regular);

  border-radius: 2px;
  transform: rotate(-135deg);
  transition: transform .25s, box-shadow .35s, background-color .15s;
}

.EmailIcon-Container {
  position: relative;
  margin: auto;

  width: 20px;
  height: 14px;

  border: 1px solid var(--el-text-color-regular);
  border-radius: 2px;
  transition: .3s cubic-bezier(.25,.8,.25,1);
}

.EmailIcon-Wrapper {
  position: relative;
  display: flex;

  vertical-align: center;
  justify-content: center;

  top: 5%;

  width: 100%;
  height: 90%;
}
</style>
