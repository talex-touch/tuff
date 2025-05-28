<script>
import { Teleport, h, nextTick, ref } from 'vue'
import { computePosition } from '@floating-ui/vue'

const qualifiedName = 'TSelectItem'

export default {
  name: 'TSelectItem',
  props: {
    modelValue: {
      type: [String, Number],
      required: true,
    },
  },
  data() {
    const activeIndex = ref(0)
    const click = ref(false)

    function clickListener(e) {
      if (!click.value || !e.path)
        return
      click.value = e.path.some(
        node => node?.className?.indexOf('TSelectItem-Container') > -1,
      )
      // console.log(e.path, e.path.some(node => node?.className?.indexOf('TSelectItem-Container') > -1))
      // click.value = false
    }

    return {
      activeIndex,
      click,
      clickListener,
    }
  },
  beforeUnmount() {
    document.removeEventListener('click', this.clickListener)
  },
  mounted() {
    document.addEventListener('click', this.clickListener)
  },
  render() {
    this.activeIndex = this.modelValue || 0

    const that = this

    return h(
      'div',
      {
        class: `TSelectItem-Container ${that.click ? 'selection' : ''}`,
        onclick() {
          that.click = !that.click
        },
      },
      this.$slots,
    )
  },
}
</script>

<style lang="scss" scoped>
.TSelectItem-Container {
  &:hover {
    background-color: var(--el-bg-color);
  }
  position: relative;
  padding: 0.25rem 0.75rem;

  width: 100%;
  height: 36px;

  text-indent: 0;
  border-radius: 4px;

  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
  transition: all 0.25s;
  background-color: var(--el-fill-color);
}
</style>
