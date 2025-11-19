<script>
export default {
  name: 'Singers',
  props: {
    singers: {
      type: Array,
      default: () => [],
    },
  },
}
</script>

<template>
  <marquee scrolldelay="200" truespeed="false">
    <span v-for="singer in singers" v-if="singers">
      {{ singer.name }}
    </span>
  </marquee>
</template>

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
