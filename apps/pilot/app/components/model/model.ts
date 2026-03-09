// export const models = reactive([
//   {
//     name: 'QuotaGPT 标准模型',
//     value: 'this-normal',
//     features: [
//       '标准的主力模型(Lite)',
//       '适合处理部分复杂任务',
//       '32k上下文窗口的推理',
//       '支持高级数据分析',
//       '支持静态图表生成',
//       '支持普通数学公式',
//       '有限联网分析能力',
//     ],
//   },
//   {
//     name: 'QuotaGPT 强化模型',
//     value: 'this-normal-turbo',
//     valuable: true,
//     features: [
//       '强化的主力模型(Pro)',
//       '适合处理部分复杂任务',
//       '32+k上下文窗口的推理',
//       '支持高级数据分析',
//       '支持动态图表生成',
//       '支持普通数学公式',
//       '强化联网分析能力',
//       '无限制的角色能力',
//       '图像上下文能力支持',
//       '文件上下文能力支持',
//     ],
//   },
//   {
//     name: 'QuotaGPT 高级模型',
//     value: 'this-normal-ultra',
//     valuable: true,
//     features: [
//       '完全的高级模型(Pro)',
//       '适合处理所有复杂任务',
//       '128+k上下文窗口的推理',
//       '支持高级数据分析',
//       '支持动态图表生成',
//       '支持高级数学公式',
//       '完全联网分析能力',
//       '无限制的角色能力',
//       '图像上下文能力支持',
//       '文件上下文能力支持',
//     ],
//   },
// ])

import QuotaImage from '/logo.png'
import DoubaoImage from '/doubao.png'
import MoonShotImage from '/models/moonshot.png'
import ChatGPTImage from '/models/chatgpt.png'

export const models = readonly([
  {
    key: 'this-normal',
    name: 'QuotaGPT 标准模型',
    img: QuotaImage,
  },
  {
    key: 'this-normal-turbo',
    name: 'QuotaGPT 强化模型',
    img: QuotaImage,
  },
  {
    key: 'this-normal-ultimate',
    name: 'QuotaGPT 高级模型',
    img: QuotaImage,
  },
  {
    key: 'o1-mini',
    name: 'GPT o1 mini',
    img: ChatGPTImage,
  },
  {
    key: 'gpt-4o',
    name: 'GPT 4o',
    img: ChatGPTImage,
  },
  {
    key: 'gpt-4o-mini',
    name: 'GPT 4o mini',
    img: ChatGPTImage,
  },
  {
    key: 'gpt-3.5-turbo',
    name: 'GPT 3.5 turbo',
    img: ChatGPTImage,
  },
  {
    key: 'volc-doubao-pro-256k',
    name: '豆包大模型 PRO 256k',
    img: DoubaoImage,
  },
  {
    key: 'volc-doubao-ro-128k',
    name: '豆包大模型 PRO 128k',
    img: DoubaoImage,
  },
  {
    key: 'moonshot-kimi-128',
    name: '月之暗面 Kimi 128k',
    img: MoonShotImage,
  },
  {
    key: 'moonshot-kimi-32',
    name: '月之暗面 Kimi 32k',
    img: MoonShotImage,
  },
])
