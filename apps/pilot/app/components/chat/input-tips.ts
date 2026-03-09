export interface ITip {
  icon: string
  color: string
  title: string
  value: string
  list: ITipItem[]
}

export interface ITipItem {
  content: string
  addon?: boolean
}

export const tips = reactive<ITip[]>([
  {
    icon: 'i-carbon-image',
    color: '#339C42',
    title: '创建图片',
    value: '创作',
    list: [
      {
        addon: true,
        content: '将这张图片智能创作美颜一下',
      },
      {
        content: '为我创作一张绚丽的背景',
      },
      {
        addon: true,
        content: '将我宠物的图片创作为彩绘风格',
      },
      {
        content: '为我创作一张关于小麦的图片',
      },
    ],
  },
  {
    icon: 'i-carbon:ai-results-low',
    color: '#E2C541',
    title: '制定计划',
    value: '制定',
    list: [
      {
        content: '制定大学生一天学习的计划',
      },
      {
        content: '制定30天六级备考的计划',
      },
      {
        content: '制定一个健身计划',
      },
      {
        content: '制定大学生一天学习的计划',
      },
    ],
  },
  {
    icon: 'i-carbon-document',
    color: '#EA8444',
    title: '总结文本',
    value: '总结',
    list: [
      {
        content: '总结《月亮与六便士》这本书的故事情节',
      },
      {
        content: '总结一下AI相关的论文',
      },
      {
        content: '总结百事可乐的配方表',
      },
      {
        content: '总结一下近期互联网行业趋势',
      },
    ],
  },
  {
    icon: 'i-carbon:unknown',
    color: '#76D0EB',
    title: '询问问题',
    value: '请问',
    list: [
      {
        content: '请问一下iPhone16真的好用吗？',
      },
      {
        content: '请问如何提高普通话水平呢？',
      },

      {
        content: '请问如何提高普通话水平呢？',
      },
      {
        content: '请问猪油真的健康吗？',
      },
    ],
  },
  {
    icon: 'i-carbon-code',
    color: '#595DC7',
    title: '攥写代码',
    value: '编写',
    list: [
      {
        content: '编写一个水仙花计算的C++代码',
      },
      {
        content: '编写一个简单的登陆注册网页代码',
      },
      {
        content: '编写一个简单的随机数生成代码',
      },
      {
        content: '编写一个简单的计算器代码',
      },
    ],
  },
  {
    icon: 'i-carbon-edit',
    color: '#A070A4',
    title: '帮写文本',
    value: '写',
    list: [
      {
        content: '写一封求职信',
      },
      {
        content: '写一个儿童睡前故事',
      },
      {
        content: '写一个搞笑视频脚本',
      },
      {
        content: '写一篇关于环保的演讲稿',
      },
    ],
  },
])

export const cur = ref(-1)

export const tipsVisible = ref(false)

watch(() => cur.value, () => tipsVisible.value = cur.value === -1)
