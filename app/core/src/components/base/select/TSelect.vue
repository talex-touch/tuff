<script>
import { h, nextTick, ref, Teleport } from "vue";
import { computePosition } from "@floating-ui/vue";

const qualifiedName = "TSelectItem";

export default {
  name: "TSelect",
  props: {
    modelValue: {
      type: [String, Number],
      required: true,
    },
  },
  beforeUnmount() {
    document.removeEventListener("click", this.clickListener);
  },
  mounted() {
    document.addEventListener("click", this.clickListener);
  },
  data() {
    const activeIndex = ref(0);
    const click = ref(false);

    function clickListener(e) {
      if (!click.value || !e.path) return;
      click.value = e.path.some(
        (node) => node?.className?.indexOf("TSelectItem-Container") > -1
      );
      // console.log(e.path, e.path.some(node => node?.className?.indexOf('TSelectItem-Container') > -1))
      // click.value = false
    }

    return {
      activeIndex,
      click,
      clickListener,
    };
  },
  render() {
    this.activeIndex = this.modelValue || 0;

    function slotFlat(slot) {
      return slot
        .map((item) => {
          if (item.type.name === qualifiedName) {
            return item;
          } else if (item.children) {
            return slotFlat(item.children);
          }
        })
        .flat();
    }

    const slots = slotFlat(this.$slots.default()); //.filter(slot => slot.type.name === qualifiedName)

    function getContent() {
      if (that.click) {
        const wrapper = h(
          "div",
          {
            class: "TSelect-Wrapper",
          },
          slots
        );

        nextTick(() => {
          let height = 0;

          slots.forEach((slot, index) => {
            if (slot.props?.hasOwnProperty("disabled")) {
              slot.el.style.cursor = "not-allowed";
            } else {
              slot.el.addEventListener("click", (e) => {
                // activeIndex.value = index //slots.indexOf(slot)

                that.$emit("update:modelValue", (that.activeIndex = index));
                that.$emit(
                  "change",
                  slot.props?.hasOwnProperty("name") ? slot.props.name : index,
                  e
                );

                that.click = false;
              });
            }

            if (index <= that.activeIndex) {
              height += slot.el.getBoundingClientRect().height + 2;
            }
          });

          // const root = that.$el.__vnode

          async function adaptPosition() {
            const floating = await computePosition(that.$el, wrapper.el);

            wrapper.el.style.setProperty("--height", `${30 * that.activeIndex + 8}px`);

            Object.assign(wrapper.el.style, {
              top: `${floating.y}px`,
              left: `${floating.x}px`,
              transform: `translate(0, ${-height}px)`,
            });
          }

          adaptPosition();
        });

        return h(Teleport, { to: "body" }, wrapper);
      }

      return slots[that.activeIndex] || slots[0];
    }

    const that = this;

    return h(
      "div",
      {
        class: "TSelect-Container " + (that.click ? "selection" : ""),
        onclick() {
          that.click = !that.click;
        },
      },
      getContent()
    );
  },
};
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
  //&.selection:before {
  //  opacity: 1;
  //  transform: scaleY(1);
  //}
  &:before {
    z-index: 1;
    content: "";
    position: absolute;

    width: 3px;
    height: 20px;

    top: var(--height, 8px);
    left: 5px;

    //opacity: 0;
    border-radius: 50px;
    transition: all 0.15s;
    animation: in 0.15s ease-in-out;
    background-color: var(--el-color-primary);
    //--height: 28px;
  }
  z-index: 100;
  position: absolute;
  display: flex;
  padding-bottom: 5px;
  padding-top: 2px;

  flex-direction: column;
  justify-content: space-between;

  background-color: var(--el-fill-color);
  border-radius: 4px;

  left: 0;
  top: 0;

  width: 128px;
  //width: 100%;
  //max-height: 500%;

  overflow: hidden;
  box-sizing: border-box;
  //background-color: rgba(0, 0, 0, .5);
  transition: transform 0.25s;
  animation: expand 1.5s cubic-bezier(0.2, 0.5, 0.5, 1);
}

.TSelect-Container {
  position: relative;

  display: inline-flex;
  flex-direction: column;

  width: 128px;
  height: 32px;

  border-radius: 4px;

  transition: all 0.25s;
  user-select: none;
  box-sizing: border-box;
  background-color: var(--el-fill-color);
}

@keyframes expand {
  from {
    max-height: 0;
  }
  to {
    max-height: 1000px;
  }
}
</style>
