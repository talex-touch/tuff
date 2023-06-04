<template>
  <marquee scrolldelay="200" truespeed="false" >
     <span v-if="singers" v-for="singer in singers">
    {{ singer.name }}
  </span>
  </marquee>
</template>

<script>
export default {
  name: "Singers",
  props: {
    singers: {
      type: Array,
      default: () => []
    }
  }
}
</script>

<style lang="scss" scoped>
span {
  &:after {
    content: "/";
  }
  //margin-right: 5px;
}
span:last-child {
  &:after {
    content: "";
  }
}
</style>