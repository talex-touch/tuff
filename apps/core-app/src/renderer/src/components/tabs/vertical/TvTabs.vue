<script lang="ts">
import {
  h,
  reactive,
  ref,
  defineComponent,
  type VNode,
  type Component,
  useSlots,
  nextTick,
  onMounted
} from 'vue'
import TvTabItem from '@comp/tabs/vertical/TvTabItem.vue'
import { ElScrollbar } from 'element-plus'

export default defineComponent({
  name: 'TvTabs',
  props: {
    modelValue: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    // 状态管理
    const activeNodes = reactive<Record<string, any>>({ ...props.modelValue })
    const lastActive = ref<VNode | null>(null)
    const slotWrapper = ref<HTMLElement | null>(null)
    const headerWrapper = ref<HTMLElement | null>(null)
    const indicator = ref<HTMLElement | null>(null)

    // 合格的组件名称
    const qualifiedName = ['TvTabItem', 'TvTabItemGroup']

    // 更新指示器位置
    const updateIndicator = (targetElement: HTMLElement) => {
      if (!indicator.value || !headerWrapper.value) return

      const headerRect = headerWrapper.value.getBoundingClientRect()
      const targetRect = targetElement.getBoundingClientRect()

      // 计算相对于HeaderWrapper的位置，考虑标签的margin
      const left = targetRect.left - headerRect.left + 8
      const width = targetRect.width

      const indicatorEl = indicator.value
      // 添加一个小的延迟，让指示器动画更平滑
      requestAnimationFrame(() => {
        indicatorEl.style.transform = `translateX(${left}px)`
        indicatorEl.style.width = `${width}px`
        indicatorEl.style.opacity = '1'

        // 延迟显示弥散光效果
        setTimeout(() => {
          indicatorEl.classList.add('indicator-active')
        }, 300) // 等待指示器到达目标位置后再显示弥散光
      })
    }

    // 初始化指示器位置
    const initializeIndicator = () => {
      // 使用setTimeout确保所有样式都已应用
      setTimeout(() => {
        const activeKey = Object.keys(activeNodes).find((key) => activeNodes[key])
        if (activeKey && headerWrapper.value) {
          const tabElements = headerWrapper.value.querySelectorAll('.TvTabItem-Container')
          const activeIndex = parseInt(activeKey) - 1
          const activeTab = tabElements[activeIndex] as HTMLElement

          if (activeTab) {
            updateIndicator(activeTab)
          }
        }
      }, 100) // 给足够的时间让样式计算完成
    }

    // 组件挂载后初始化指示器
    onMounted(() => {
      initializeIndicator()
    })

    return () => {
      // 获取插槽内容
      const slots = useSlots()
      const defaultSlots = slots.default?.() || []

      const children = defaultSlots.filter((slot) => {
        // 检查slot.type是否为对象且有name属性
        if (typeof slot.type === 'object' && slot.type !== null && 'name' in slot.type) {
          const componentName = (slot.type as Component & { name: string }).name
          return componentName && qualifiedName.includes(componentName)
        }
        // 检查slot.type是否为字符串
        if (typeof slot.type === 'string') {
          return qualifiedName.includes(slot.type)
        }
        return false
      })

      // 如果有激活状态但没有lastActive，初始化它
      const currentActiveKey = Object.keys(activeNodes).find((key) => activeNodes[key])
      if (currentActiveKey && !lastActive.value) {
        const activeIndex = parseInt(currentActiveKey) - 1
        if (children[activeIndex]) {
          lastActive.value = children[activeIndex]
        }
      }

      // 获取标签页
      const getTab = (vnode: VNode, index: number): VNode => {
        const tabIndex = index + 1 || 0
        const isActive = (): boolean => activeNodes[tabIndex] === vnode.props?.name

        return h(
          TvTabItem,
          {
            active: isActive(),
            ...vnode.props,
            onClick: (event: Event) => {
              // 如果禁用则不处理点击
              if (vnode.props && Object.hasOwn(vnode.props, 'disabled')) return

            // 获取之前激活的标签索引
            const previousActiveIndex = Object.keys(activeNodes).find((key) => activeNodes[key])
            const previousIndex = previousActiveIndex ? parseInt(previousActiveIndex) : 0

            // 更新指示器位置
            const targetEl = event.currentTarget as HTMLElement
            if (targetEl && indicator.value) {
              // 清除之前的激活状态
              indicator.value.classList.remove('indicator-active')
              updateIndicator(targetEl)
            }

            // 处理内容切换动画
            const el = slotWrapper.value
            if (el) {
              const classList = el.classList
              classList.remove('slideInLeft', 'slideInRight', 'slideOutLeft', 'slideOutRight')

              // 如果有之前激活的标签，先播放滑出动画
              if (previousActiveIndex && lastActive.value) {
                if (tabIndex > previousIndex) {
                  classList.add('slideOutLeft')
                } else {
                  classList.add('slideOutRight')
                }

                setTimeout(() => {
                  classList.remove('slideOutLeft', 'slideOutRight')

                  // 更新激活状态
                  Object.keys(activeNodes).forEach((key) => delete activeNodes[key])
                  lastActive.value = vnode
                  activeNodes[tabIndex] = vnode.props?.name
                  emit('update:modelValue', { ...activeNodes })

                  nextTick(() => {
                    if (tabIndex > previousIndex) {
                      classList.add('slideInRight')
                    } else {
                      classList.add('slideInLeft')
                    }
                  })
                }, 200)
              } else {
                // 没有之前的激活标签，直接更新状态
                Object.keys(activeNodes).forEach((key) => delete activeNodes[key])
                lastActive.value = vnode
                activeNodes[tabIndex] = vnode.props?.name
                emit('update:modelValue', { ...activeNodes })

                nextTick(() => {
                  classList.add('slideInRight')
                })
                }
              }
            }
          },
          {
            icon: typeof vnode.children === 'object' && vnode.children && 'icon' in vnode.children ? vnode.children.icon : null
          }
        )
      }

      // 获取所有标签
      const getTabs = (): VNode[] => {
        return children.map((child, index) => {
          // 检查child.type是否为对象且有name属性
          let componentName = ''
          if (typeof child.type === 'object' && child.type !== null && 'name' in child.type) {
            componentName = (child.type as Component & { name: string }).name
          } else if (typeof child.type === 'string') {
            componentName = child.type
          }

          if (componentName === 'TvTabItemGroup') {
            return h(
              'div',
              {
                class: 'TvTabs-TabGroup'
              },
              [
                h(
                  'div',
                  {
                    class: 'TvTabs-TabGroup-Name'
                  },
                  child.props?.name || ''
                ),
                // 处理子节点
                child.children && typeof child.children === 'object' && 'default' in child.children
                  ? (child.children as { default: () => VNode[] })
                      .default?.()
                      .map?.((c) => getTab(c, index)) || []
                  : []
              ]
            )
          } else {
            return getTab(child, index)
          }
        })
      }

      // 获取选中插槽内容
      const getSelectSlotContent = (): VNode => {
        // 获取当前激活的内容
        let activeContent: any = null
        const currentActiveKey = Object.keys(activeNodes).find((key) => activeNodes[key])

        if (currentActiveKey) {
          const activeIndex = parseInt(currentActiveKey) - 1
          const activeChild = children[activeIndex]

          if (activeChild && activeChild.children) {
            if (typeof activeChild.children === 'object' && activeChild.children && 'default' in activeChild.children) {
              activeContent = (activeChild.children as { default: () => any }).default?.()
            } else if (typeof activeChild.children === 'object') {
              activeContent = activeChild.children
            }
          }
        }

        // 如果没有找到激活内容，尝试使用lastActive
        if (!activeContent && lastActive.value && lastActive.value.children) {
          if (
            typeof lastActive.value.children === 'object' && lastActive.value.children &&
            'default' in lastActive.value.children
          ) {
            activeContent = (lastActive.value.children as { default: () => any }).default?.()
          } else if (typeof lastActive.value.children === 'object') {
            activeContent = lastActive.value.children
          }
        }

        return h(
          'div',
          {
            ref: slotWrapper,
            class: 'TTabs-SelectSlot animated'
          },
          activeContent ||
            h(
              'div',
              {
                class: 'TTabs-SelectSlot-Empty'
              },
              'No item selected.'
            )
        )
      }

      return h(
        'div',
        {
          class: 'TvTabs-Container'
        },
        [
          h(
            'div',
            {
              class: 'TvTabs-Header'
            },
            [
              h(
                'div',
                {
                  class: 'TvTabs-HeaderWrapper',
                  ref: headerWrapper
                },
                getTabs()
              ),
              h('div', {
                class: 'TvTabs-Indicator',
                ref: indicator
              })
            ]
          ),
          h(
            'div',
            {
              class: 'TvTabs-Main'
            },
            h(ElScrollbar, {}, () => getSelectSlotContent())
          )
        ]
      )
    }
  }
})
</script>

<style lang="scss" scoped>
.TvTabs-TabGroup {
  .TvTabs-TabGroup-Name {
    z-index: 1;
    position: absolute;
    padding: 4px 8px;
    top: -16px;
    left: 12px;
    border-radius: 6px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 0.75rem;
    font-weight: 600;
    border: 1px solid rgba(var(--el-color-primary-rgb), 0.2);
  }

  & :last-child {
    margin-right: 0;
  }

  position: relative;
  display: flex;
  flex-shrink: 0;
  padding: 12px 8px 6px 8px;
  margin-right: 8px;
  height: 100%;
  border-radius: 12px;
  background: rgba(var(--el-fill-color-extra-light-rgb), 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(var(--el-border-color-rgb), 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
  box-sizing: border-box;

  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.4);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }
}

.TTabs-SelectSlot {
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  width: 100%;
  height: 100%;
  padding: 1.5rem;
  box-sizing: border-box;
  overflow-y: auto;
}

.TvTabs-Header {
  .TvTabs-HeaderWrapper {
    position: relative;
    display: flex;
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    justify-content: flex-start;
    align-items: center;
    box-sizing: border-box;
  }

  .TvTabs-Indicator {
    position: absolute;
    bottom: 2px;
    left: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--el-color-primary), var(--el-color-primary-light-3));
    border-radius: 1.5px;
    transition: all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    transform: translateX(0) scaleX(1);
    transform-origin: left center;
    width: 0;
    opacity: 0;
    box-shadow:
      0 2px 8px rgba(var(--el-color-primary-rgb), 0.4),
      0 0 0 1px rgba(var(--el-color-primary-rgb), 0.1);

    &::before {
      content: '';
      position: absolute;
      top: -60px;
      left: -15px;
      right: -15px;
      height: 60px;
      background: radial-gradient(
        ellipse 150% 100% at center bottom,
        rgba(var(--el-color-primary-rgb), 0.35) 0%,
        rgba(var(--el-color-primary-rgb), 0.25) 20%,
        rgba(var(--el-color-primary-rgb), 0.15) 40%,
        rgba(var(--el-color-primary-rgb), 0.08) 60%,
        rgba(var(--el-color-primary-rgb), 0.03) 80%,
        transparent 100%
      );
      filter: blur(10px);
      opacity: 0;
      transform: scaleY(0.6) scaleX(0.8);
      transition: all 1s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    &::after {
      content: '';
      position: absolute;
      top: -1px;
      left: 0;
      right: 0;
      height: 5px;
      background: linear-gradient(
        90deg,
        rgba(var(--el-color-primary-rgb), 0.3),
        rgba(var(--el-color-primary-rgb), 0.1)
      );
      border-radius: 2.5px;
      filter: blur(2px);
    }

    /* 激活时显示弥散光 */
    &.indicator-active::before {
      opacity: 0.5;
      transform: scaleY(1) scaleX(1);
    }
  }

  z-index: 1;
  position: absolute;
  padding: 0.25rem 0.5rem;
  display: flex;

  top: 0;

  height: 48px;
  width: 100%;
  box-sizing: border-box;
}

.TTabs-SelectSlot-Empty {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 300px;
  font-size: 16px;
  color: var(--el-text-color-regular);
  opacity: 0.6;
}

.TvTabs-Container {
  .TvTabs-Main {
    &.header-mode .TTabs-SelectSlot {
      flex-direction: column;
      justify-content: flex-start;
    }

    position: relative;
    padding-top: 48px;

    height: 100%;
    box-sizing: border-box;
    background: var(--el-bg-color);
    overflow: hidden;
  }

  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: rgba(var(--el-fill-color-extra-light-rgb), 0.3);
  backdrop-filter: blur(20px);
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

/* Animations */
.animated {
  &.slideInLeft {
    animation: slideInLeft 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  &.slideInRight {
    animation: slideInRight 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  &.slideOutLeft {
    animation: slideOutLeft 0.2s cubic-bezier(0.55, 0.06, 0.68, 0.19);
  }

  &.slideOutRight {
    animation: slideOutRight 0.2s cubic-bezier(0.55, 0.06, 0.68, 0.19);
  }
}

@keyframes slideInLeft {
  0% {
    opacity: 0;
    transform: translateX(-40px);
    filter: blur(4px);
  }
  60% {
    opacity: 0.8;
    filter: blur(1px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
    filter: blur(0);
  }
}

@keyframes slideInRight {
  0% {
    opacity: 0;
    transform: translateX(40px);
    filter: blur(4px);
  }
  60% {
    opacity: 0.8;
    filter: blur(1px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
    filter: blur(0);
  }
}

@keyframes slideOutLeft {
  0% {
    opacity: 1;
    transform: translateX(0);
    filter: blur(0);
  }
  100% {
    opacity: 0;
    transform: translateX(-40px);
    filter: blur(4px);
  }
}

/* Responsive Design */
@media (max-width: 768px) {
  .TvTabs-Header {
    min-height: 70px;
    max-height: 80px;

    .TvTabs-HeaderWrapper {
      padding: 0.5rem;
      gap: 0.25rem;
      flex-wrap: wrap;
    }
  }

  .TvTabs-TabGroup {
    margin-right: 4px;
    padding: 8px 6px 4px 6px;

    .TvTabs-TabGroup-Name {
      font-size: 0.6875rem;
      padding: 2px 6px;
    }
  }

  .TTabs-SelectSlot {
    padding: 1rem;
  }
}
</style>
