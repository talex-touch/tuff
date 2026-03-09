export const appName = 'ThisAI - Quota'
export const appDescription = '科塔智爱是专业高效的智能助手，可以为您解答数学难题、绘制图表、解决情感困扰，还是您的贴心伙伴，能根据您的需求提供精准全面的信息，伴您度过每一天。'
export const appKeywords = '科塔智爱,智能AI,ThisAI,科塔,科塔锐行,科塔一文,快速效率,AI工具,智能工具,AI,AI大模型,AI写作,AI搜索,AI文档,文档处理,搜索,快速搜索,人工智能,智能大模型,自然语言处理,机器学习,自动化写作,智能写作助手,AI 文本生成,文本分析,智能搜索,个性化搜索,语义搜索,文档自动化,智能文档管理,文档协作,文本编辑器,实时文档处理,文档生成工具,内容创作工具,快速信息检索,高效文档整理,智能写作平台,AI内容优化,自动化内容创作,智能摘要生成,AI写作工具,语义分析,自然语言生成,智能助手,AI内容分析,AI文档处理,智能文档编辑,内容生成引擎,自动化编辑,AI翻译工具,内容润色,多模态交互,语义理解,生成式对话,对话式搜索,信息整合,知识增强,内容转化,神经网络,智能体,大模型,生态构建,文本创作,跨语言理解,语义关系,应用场景,文本处理,定制化,无监督学习,预训练,大语言模型,AI翻译,语义识别,生成式人工智能,AI助手,快速写作,AI办公,机器学习,图像识别,人机交互,通用大模型,数据处理,模型训练,图像生成,AI问答,文生视频,语义理解,机器翻译,信息检索,神经网络,AI识别,AI教育,AI画图,AI翻译,智能问答,智能提取内容,AI文档生成,AI文档理解,智能图像识别,AI语音合成,AI搜索优化,内容优化,AI数据标注,智能行业分析,AI风险评估,文档优化,AI降重,论文降重,AI交互,图表设计,文档归纳,智能查询,查询,问答,智能写作,智能扩写,AI文章解读'

export const ENDS_URL = {
  local: {
    label: 'Local',
    value: '/',
  },
  dev: {
    label: 'Development',
    value: '/',
  },
  test: {
    label: 'Test',
    value: '/',
  },
  prod: {
    label: 'Production',
    value: '/',
  },
}

let _ENDS_URL = ''

// Object.assign(globalThis, '$ENDS_URL', {
//   get() {
//     return _ENDS_URL
//   },
// })

// declare global {
//   interface Window {
//     $ENDS_URL: string
//   }
// }

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return '/'
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function getWindowOriginBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '/'
  }

  return normalizeBaseUrl(window.location.origin)
}

function getDefaultUrl() {
  return getWindowOriginBaseUrl()
}

/**
 * 定义全局选项类，主要用于管理和更新URL endpoints
 */
export class GlobalOptions {
  /**
   * 构造函数，根据环境（开发或生产）设置URL endpoints
   *
   * 如果当前环境是开发模式（即使用 vite 命令启动服务），则 import.meta.env.DEV 的值为 true
   * import.meta.env 只能访问到 Vite 自动注入的环境变量，
   */
  constructor() {
    this.setEndsUrl(getDefaultUrl())
  }

  setEndsUrl(url: string) {
    _ENDS_URL = normalizeBaseUrl(url)

    this.updateUrlStash.forEach((callback) => {
      callback(_ENDS_URL)
    })
  }

  getEndsUrl() {
    if (!_ENDS_URL) {
      return getDefaultUrl()
    }

    return _ENDS_URL
  }

  /**
   * 存储需要通知的URL变更回调函数
   */
  updateUrlStash: any[] = []

  /**
   * 订阅URL变更事件，当URL变更时执行回调函数
   * @param callback URL变更时执行的回调函数
   */
  onUpdateUrl(callback: (url: string) => void) {
    this.updateUrlStash.push(callback)
  }
}

export const globalOptions = new GlobalOptions()
