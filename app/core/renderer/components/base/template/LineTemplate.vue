<script lang="jsx" name="LineTemplate">

export default defineComponent({
  props: {
    title: {
      type: String,
      default: "Demo line"
    },
    regex: {
      type: String,
      required: false
    },
    msg: {
      type: Function,
      default: () => "Regex mot matched."
    }
  },
  setup() {
    const tip = ref("")

    return {
      tip
    }
  },
  render(vnode) {

    const regFormField = inject('regFormFiled')

    const { tip, $slots: slots, $props: props } = vnode

    const defaultSlot = slots.default?.() || 'This is line template demo.'
    const fieldSlot = slots.field?.() || props.title

    // tentative force needs `regex`
    if (props.regex && defaultSlot[0]?.dynamicProps.length > 0) {
      regFormField(vnode, () => {
        vnode.tip = ""
        
        const value = defaultSlot[0].component.props["modelValue"]
        const regex = new RegExp(props.regex)

        const access = regex.test(value)

        vnode.tip = access ? "" : props.msg()

        const el = defaultSlot[0]?.el
        if (el && !access) {
          el.scrollIntoView({
            behavior: "smooth",
            block: "center"
          })

          setTimeout(el.focus, 500)

          el.addEventListener('blur', () => vnode.tip = "")
        }

        return {
          access,
          msg: vnode.tip
        }
      })
    }

    return (
      <>
        <div flex gap-16 mt-2>
          <div w-30 text-right>
            {fieldSlot}
          </div>

          <div class={tip ? "err-mention" : null} items-baseline gap-4 flex flex-1>
            <div>
              {defaultSlot}
            </div>
            <div class='mention'>
              <span text-sm>{tip}</span>
            </div>
          </div>
        </div>
      </>
    )
  }
})
</script>

<style lang="scss">
.err-mention {
  .mention {
    color: #ff4d4f;
  }

  animation: shaken .5s .25s;
}
</style>