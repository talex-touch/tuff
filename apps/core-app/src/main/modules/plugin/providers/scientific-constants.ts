export interface ScientificConstantDefinition {
  id: string
  name: string
  symbol?: string
  category: string
  value: string
  unit?: string
  description: string
  source?: string
  aliases: string[]
}

export const SCIENTIFIC_CONSTANTS: ScientificConstantDefinition[] = [
  {
    id: 'pi',
    name: '圆周率',
    symbol: 'π',
    category: '数学常数',
    value: '3.141592653589793',
    description: '定义为圆的周长与直径之比，是各类几何和信号计算的基础常数。',
    source: 'ISO 80000-2',
    aliases: ['pi', 'π', '圆周率', 'pai']
  },
  {
    id: 'eulers_number',
    name: '自然常数',
    symbol: 'e',
    category: '数学常数',
    value: '2.718281828459045',
    description: '自然对数的底数，广泛出现在指数增长、复利和微积分公式中。',
    source: 'ISO 80000-2',
    aliases: ["euler's number", 'eulers number', '自然常数', 'e', 'napier constant']
  },
  {
    id: 'speed_of_light',
    name: '真空光速',
    symbol: 'c',
    category: '物理常数',
    value: '299792458',
    unit: 'm*s^-1',
    description: '米的定义基于光在真空中传播的速度，为所有电磁计算的基础。',
    source: 'CODATA 2018',
    aliases: ['speed of light', 'light speed', '真空光速', 'c0', '光速']
  },
  {
    id: 'planck_constant',
    name: '普朗克常数',
    symbol: 'h',
    category: '量子物理',
    value: '6.62607015e-34',
    unit: 'J*s',
    description: '描述能量与频率之间关系的常数，定义了量子的尺度。',
    source: 'CODATA 2018',
    aliases: ['planck constant', '普朗克常数', 'h constant']
  },
  {
    id: 'reduced_planck_constant',
    name: '约化普朗克常数',
    symbol: 'ħ',
    category: '量子物理',
    value: '1.054571817e-34',
    unit: 'J*s',
    description: '普朗克常数除以 2π，常用于角频率相关的量子力学公式。',
    source: 'CODATA 2018',
    aliases: ['reduced planck constant', '约化普朗克常数', 'h bar', 'hbar']
  },
  {
    id: 'gravitational_constant',
    name: '万有引力常数',
    symbol: 'G',
    category: '物理常数',
    value: '6.67430e-11',
    unit: 'm^3 kg^-1 s^-2',
    description: '决定两个物体之间引力强度的常数，用于天体力学与物理模拟。',
    source: 'CODATA 2018',
    aliases: ['gravitational constant', 'gravity constant', '万有引力常数', 'newton constant']
  },
  {
    id: 'earth_surface_gravity',
    name: '标准地表重力',
    symbol: 'g0',
    category: '地球物理',
    value: '9.80665',
    unit: 'm*s^-2',
    description: '国际标准地表重力加速度，常用于航空航天及工程计算。',
    source: 'CODATA 2018',
    aliases: ['earth gravity', 'standard gravity', 'g0', '地球重力', '重力加速度']
  },
  {
    id: 'avogadro_constant',
    name: '阿伏伽德罗常数',
    symbol: 'N_A',
    category: '化学常数',
    value: '6.02214076e23',
    unit: 'mol^-1',
    description: '一摩尔物质所包含的粒子数，连接宏观与微观尺度的重要常数。',
    source: 'CODATA 2018',
    aliases: ['avogadro constant', 'avogadro number', '阿伏伽德罗常数', 'na']
  },
  {
    id: 'boltzmann_constant',
    name: '玻尔兹曼常数',
    symbol: 'k_B',
    category: '热力学',
    value: '1.380649e-23',
    unit: 'J*K^-1',
    description: '关联温度与能量的常数，用于统计物理和热噪计算。',
    source: 'CODATA 2018',
    aliases: ['boltzmann constant', '玻尔兹曼常数', 'kb']
  },
  {
    id: 'gas_constant',
    name: '理想气体常数',
    symbol: 'R',
    category: '热力学',
    value: '8.314462618',
    unit: 'J*mol^-1*K^-1',
    description: '出现在理想气体状态方程中的比例系数，也等于阿伏伽德罗常数乘玻尔兹曼常数。',
    source: 'CODATA 2018',
    aliases: ['gas constant', 'ideal gas constant', '理想气体常数', 'r constant']
  },
  {
    id: 'elementary_charge',
    name: '元电荷',
    symbol: 'e',
    category: '电磁常数',
    value: '1.602176634e-19',
    unit: 'C',
    description: '单个质子或电子所带电荷量的绝对值，为各种电磁方程的基础。',
    source: 'CODATA 2018',
    aliases: ['elementary charge', 'fundamental charge', '元电荷', 'electric charge quantum']
  },
  {
    id: 'faraday_constant',
    name: '法拉第常数',
    symbol: 'F',
    category: '电化学',
    value: '96485.33212',
    unit: 'C*mol^-1',
    description: '每摩尔电子所带电量，在电解与电池容量换算中使用。',
    source: 'CODATA 2018',
    aliases: ['faraday constant', '法拉第常数', 'faraday number']
  }
]

const ALIAS_INDEX = new Map<string, ScientificConstantDefinition>()

for (const constant of SCIENTIFIC_CONSTANTS) {
  const aliasSet = new Set<string>([
    constant.id,
    constant.name,
    constant.symbol ?? '',
    ...constant.aliases
  ])

  for (const alias of aliasSet) {
    const normalized = normalizeConstantKey(alias)
    if (!normalized || ALIAS_INDEX.has(normalized)) continue
    ALIAS_INDEX.set(normalized, constant)
  }
}

const SHORT_ALIAS_MIN_LENGTH = 2

function normalizeConstantKey(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u4E00-\u9FA5\u03C0\u0127\u210F\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function findScientificConstant(query: string): ScientificConstantDefinition | null {
  if (!query) return null
  const normalized = normalizeConstantKey(query)
  if (!normalized) return null

  const direct = ALIAS_INDEX.get(normalized)
  if (direct) {
    return direct
  }

  const padded = ` ${normalized} `
  const tokens = normalized.split(' ').filter(Boolean)

  for (const [alias, constant] of ALIAS_INDEX.entries()) {
    if (alias === normalized) {
      return constant
    }

    if (alias.includes(' ')) {
      if (padded.includes(` ${alias} `)) {
        return constant
      }
      continue
    }

    if (alias.length < SHORT_ALIAS_MIN_LENGTH) {
      continue
    }

    if (tokens.includes(alias)) {
      return constant
    }
  }

  return null
}
