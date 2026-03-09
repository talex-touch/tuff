<template>
  <div class="TriangleColorfulBar-Wrapper">
    <div class="TriangleColorfulBar-Container"></div>
    <div class="TriangleColorfulBar-Divider-Wrapper">
      <div v-for="item in 4" :key="item" class="TriangleColorfulBar-Divider"></div>
    </div>
  </div>
</template>

<script>
export default {
  name: "TriangleColorfulBar"
}
</script>

<style lang="scss" scoped>
.TriangleColorfulBar-Divider-Wrapper {
  position: absolute;
  display: inline-flex;

  justify-content: space-around;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

}

.TriangleColorfulBar-Divider {
  position: relative;

  top: 0;

  height: 100%;

  width: 2px;

  background-color: #f2f3f5;
}

.TriangleColorfulBar-Container {

  position: relative;
  display: inline-flex;

  justify-content: space-around;

  left: 0;
  top: 0;

  width: 70%;
  height: 100%;

  //animation: show 2.5s linear infinite;
  background-image: linear-gradient(60deg, #c2e9fb 0%, #a1c4fd 100%);
}

@keyframes show {

  0% {

    width: 0;

  }

  80%, 100% {

    width: 100%;

  }

}

.TriangleColorfulBar-Wrapper {
  &:before {
    z-index: 1;
    content: "";
    position: absolute;

    left: 0;
    top: 100%;

    width: 0;
    height: 0;

    border-top: 300px solid #f2f3f5;
    border-left: 80px solid transparent;

    transform-origin: 0 0;
    transform: rotate(-90deg);
  }
  position: relative;

  width: 300px;
  height: 80px;

  top: 40%;
  left: 40%;

  border-radius: 4px;
  //overflow: hidden;
}
</style>
