<script lang="ts">
import { h, nextTick, ref, Teleport } from 'vue'
import { computePosition } from '@floating-ui/vue'
import { extractFromSlots } from '@talex-touch/utils/renderer/slots'
import { onClickOutside } from '@vueuse/core'

const qualifiedName = 'TSelectItem'

export default {
  name: 'TSelect',
  props: {
    modelValue: {
      type: [String, Number],
      required: true
    }
  },
  data() {
    const activeIndex = ref(0)
    const click = ref(false)

    const clickListener = (event) => {
      if (!click.value) return
      const path = typeof event.composedPath === 'function' ? event.composedPath() : event.path
      if (!Array.isArray(path)) {
        click.value = false
        return
      }
      click.value = path.some((node) => node?.className?.indexOf?.('TSelectItem-Container') > -1)
    }

    return {
      activeIndex,
      click,
      clickListener,
      stopClickOutside: null
    }
  },
  mounted() {
    document.addEventListener('click', this.clickListener)

    this.stopClickOutside = onClickOutside(this.$el, () => {
      this.click = false
    })
  },
  beforeUnmount() {
    document.removeEventListener('click', this.clickListener)
    if (this.stopClickOutside) {
      this.stopClickOutside()
    }
  },
  render() {

    const rawSlots = extractFromSlots(
      this.$slots,
      'default',
      (vnode) => vnode.type?.name === qualifiedName
    )

    const slots = rawSlots.map((vnode, index) => ({
      vnode,
      index,
      value: vnode.props?.value !== undefined ? vnode.props.value : index,
      disabled: Object.prototype.hasOwnProperty.call(vnode.props ?? {}, 'disabled')
    }))

    const matchedIndex = slots.findIndex((slot) => slot.value === this.modelValue)
    this.activeIndex = matchedIndex > -1 ? matchedIndex : 0

    function getContent() {
      if (that.click) {
        const wrapper = h(
          'div',
          {
            class: 'TSelect-Wrapper'
          },
          slots.map((slot) => slot.vnode)
        )

        nextTick(() => {
          let height = 0

          slots.forEach((slot) => {
            const el = slot.vnode.el as HTMLElement | null
            if (!el) return

            if (slot.disabled) {
              el.style.cursor = 'not-allowed'
            } else {
              el.onclick = (e) => {
                that.$emit('update:modelValue', slot.value)
                that.$emit('change', slot.vnode.props?.name ?? slot.value, e)
                that.click = false
              }
            }

            if (slot.index <= that.activeIndex) {
              height += el.getBoundingClientRect().height + 2
            }
          })

          async function adaptPosition() {
            const floating = await computePosition(that.$el, wrapper.el)

            if (wrapper.el) {
              wrapper.el.style.setProperty('--height', `${36 * that.activeIndex + 8}px`)
              Object.assign(wrapper.el.style, {
                top: `${floating.y}px`,
                left: `${floating.x}px`,
                transform: `translate(0, ${-height}px)`
              })
            }
          }

          adaptPosition()
        })

        return h(Teleport, { to: 'body' }, wrapper)
      }

      return slots[that.activeIndex]?.vnode || slots[0]?.vnode
    }

    const that = this

    const v = h(
      'div',
      {
        class: 'TSelect-Container win' + (that.click ? 'selection' : ''),
        onclick() {
          that.click = !that.click
        }
      },
      getContent()
    )

    return v
  }
}
</script>

<style lang="scss" scoped>
@keyframes in {
  from {
    opacity: 0;
    transform: scaleY(0);
  }

  to {
    opacity: 1;
    transform: scaleY(1);
  }
}

.TSelect-Wrapper {
  &:before {
    z-index: 1;
    content: '';
    position: absolute;

    width: 5px;
    height: 20px;

    top: var(--height, 8px);
    left: 4px;

    border-radius: 50px;
    transition: all 0.15s;
    animation: in 0.15s ease-in-out;
    background-color: var(--el-color-primary);
  }

  z-index: 100;
  position: absolute;
  display: flex;
  padding-bottom: 5px;
  padding-top: 2px;

  flex-direction: column;
  justify-content: space-between;

  background-color: var(--el-fill-color);
  border-radius: 12px;

  left: 0;
  top: 0;

  width: 158px;

  overflow: hidden;
  box-sizing: border-box;
  transition: transform 0.25s;
  animation: expand 1.5s cubic-bezier(0.2, 0.5, 0.5, 1);
}

.TSelect-Container {
  position: relative;

  display: inline-flex;
  flex-direction: column;

  width: 158px;
  height: 32px;

  border-radius: 4px;

  text-indent: 0;
  overflow: hidden;
  user-select: none;
  box-sizing: border-box;
  transition: all 0.25s;
  border: 1px solid var(--el-border-color);
}

.TSelect-Container.win {
  &:before {
    filter: invert(0.25);
    --fake-opacity: 0.25;
    --fake-inner-opacity: 0.25;
  }

  &:hover {
    &:before {
      --fake-opacity: 0.35;
      --fake-inner-opacity: 0.35;
    }

    border-color: var(--el-border-color);
    border-bottom: 1px solid var(--el-border-color);
    box-shadow: none;
  }

  &:focus-within {
    &:before {
      filter: invert(0.05);
      --fake-opacity: 0.5;
      --fake-inner-opacity: 0.5;
    }

    border-color: var(--el-border-color);
    border-bottom: 2px solid var(--el-color-primary);
    box-shadow: none;
  }

  border-radius: 4px;
  --fake-radius: 4px !important;
  border-bottom: 1px solid var(--el-border-color);
}

@keyframes expand {
  from {
    max-height: 0;
  }

  to {
    max-height: 2000px;
  }
}
</style>
