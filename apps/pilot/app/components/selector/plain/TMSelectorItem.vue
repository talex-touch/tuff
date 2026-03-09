<template>

  <div v-wave class="TMSelectorItemPage" :class="{ vertical }" @mouseenter="handleEnter" @mousemove="handleEnter" @click="handleClick" ref="TMSelectorItemRef">

    <div class="fix-container">

      <Ficon v-if="icon" :class="icon"></Ficon>
      <span class="label"><slot></slot></span>

    </div>

  </div>

</template>

<script>
export default {
  name: "TFSelectorItem",

  props: {

    icon: '',
    to: '',

  },

  data() {

    return { vertical: false }

  },

  methods: {

    getTo() {

      return this.to

    },

    setVertical(vertical) {

      this.vertical = vertical

    },

    handleEnter(e) {

      this.$emit('tm-selector-item-enter', this.$refs.TMSelectorItemRef, e)

    },

    handleClick(e) {

      this.$emit('click', this.$refs.TMSelectorItemRef, e)

    },

  }
}
</script>

<style lang="scss" scoped>

.TMSelectorItemPage {

  position: relative;
  display: inline-block;

  left: 0;

  margin: 5px 0;
  padding: 8px 12px;

  border-radius: 3px;

  cursor: pointer;

  transition: all .15s;

  .label {

    position: relative;

    top: 0;

    text-align: center;
    font-size: 15px;

    user-select: none;

    transition: all .15s;

  }

  i {

    font-size: 22px;

    transition: all .15s;

  }

  &:hover {

    .fix-container{

      color: var(--text-normal-color);

      filter: invert(100%);

    }

    &:after {

      z-index: -1;
      content: "";
      position: absolute;

      left: 0;
      top: 0;

      width: 100%;
      height: 100%;

      background-color: var(--app-color);
      opacity: .75;

    }

    opacity: .9;

  }

}

.vertical {

  padding: 8px 10px;

  display: block;

}

.fix-container {

  position: relative;
  display: flex;

  justify-content: center;
  vertical-align: middle;

  :deep(.ficon), i {

    position: absolute;

    left: 10px;
    top: -4px;

  }

}

</style>
