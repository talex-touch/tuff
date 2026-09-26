export interface ScientificConstantDefinition {
  id: string;
  name: string;
  symbol?: string;
  category: string;
  value: string;
  unit?: string;
  description: string;
  source?: string;
  aliases: string[];
}

export const SCIENTIFIC_CONSTANTS: ScientificConstantDefinition[] = [
  {
    id: "pi",
    name: "圆周率",
    symbol: "π",
    category: "数学常数",
    value: "3.141592653589793",
    description: "定义为圆的周长与直径之比，是各类几何和信号计算的基础常数。",
    source: "ISO 80000-2",
    aliases: ["pi", "π", "圆周率", "pai"],
  },
  {
    id: "eulers_number",
    name: "自然常数",
    symbol: "e",
    category: "数学常数",
    value: "2.718281828459045",
    description: "自然对数的底数，广泛出现在指数增长、复利和微积分公式中。",
    source: "ISO 80000-2",
    aliases: [
      "euler's number",
      "eulers number",
      "自然常数",
      "e",
      "napier constant",
    ],
  },
  {
    id: "speed_of_light",
    name: "真空光速",
    symbol: "c",
    category: "物理常数",
    value: "299792458",
    unit: "m*s^-1",
    description: "米的定义基于光在真空中传播的速度，为所有电磁计算的基础。",
    source: "CODATA 2018",
    aliases: ["speed of light", "light speed", "真空光速", "c0", "光速"],
  },
  {
    id: "planck_constant",
    name: "普朗克常数",
    symbol: "h",
    category: "量子物理",
    value: "6.62607015e-34",
    unit: "J*s",
    description: "描述能量与频率之间关系的常数，定义了量子的尺度。",
    source: "CODATA 2018",
    aliases: ["planck constant", "普朗克常数", "h constant"],
  },
  {
    id: "reduced_planck_constant",
    name: "约化普朗克常数",
    symbol: "ħ",
    category: "量子物理",
    value: "1.054571817e-34",
    unit: "J*s",
    description: "普朗克常数除以 2π，常用于角频率相关的量子力学公式。",
    source: "CODATA 2018",
    aliases: ["reduced planck constant", "约化普朗克常数", "h bar", "hbar"],
  },
  {
    id: "gravitational_constant",
    name: "万有引力常数",
    symbol: "G",
    category: "物理常数",
    value: "6.67430e-11",
    unit: "m^3 kg^-1 s^-2",
    description: "决定两个物体之间引力强度的常数，用于天体力学与物理模拟。",
    source: "CODATA 2018",
    aliases: [
      "gravitational constant",
      "gravity constant",
      "万有引力常数",
      "newton constant",
    ],
  },
  {
    id: "earth_surface_gravity",
    name: "标准地表重力",
    symbol: "g0",
    category: "地球物理",
    value: "9.80665",
    unit: "m*s^-2",
    description: "国际标准地表重力加速度，常用于航空航天及工程计算。",
    source: "CODATA 2018",
    aliases: [
      "earth gravity",
      "standard gravity",
      "g0",
      "地球重力",
      "重力加速度",
    ],
  },
  {
    id: "avogadro_constant",
    name: "阿伏伽德罗常数",
    symbol: "N_A",
    category: "化学常数",
    value: "6.02214076e23",
    unit: "mol^-1",
    description: "一摩尔物质所包含的粒子数，连接宏观与微观尺度的重要常数。",
    source: "CODATA 2018",
    aliases: ["avogadro constant", "avogadro number", "阿伏伽德罗常数", "na"],
  },
  {
    id: "boltzmann_constant",
    name: "玻尔兹曼常数",
    symbol: "k_B",
    category: "热力学",
    value: "1.380649e-23",
    unit: "J*K^-1",
    description: "关联温度与能量的常数，用于统计物理和热噪计算。",
    source: "CODATA 2018",
    aliases: ["boltzmann constant", "玻尔兹曼常数", "kb"],
  },
  {
    id: "gas_constant",
    name: "理想气体常数",
    symbol: "R",
    category: "热力学",
    value: "8.314462618",
    unit: "J*mol^-1*K^-1",
    description:
      "出现在理想气体状态方程中的比例系数，也等于阿伏伽德罗常数乘玻尔兹曼常数。",
    source: "CODATA 2018",
    aliases: [
      "gas constant",
      "ideal gas constant",
      "理想气体常数",
      "r constant",
    ],
  },
  {
    id: "elementary_charge",
    name: "元电荷",
    symbol: "e",
    category: "电磁常数",
    value: "1.602176634e-19",
    unit: "C",
    description: "单个质子或电子所带电荷量的绝对值，为各种电磁方程的基础。",
    source: "CODATA 2018",
    aliases: [
      "elementary charge",
      "fundamental charge",
      "元电荷",
      "electric charge quantum",
    ],
  },
  {
    id: "faraday_constant",
    name: "法拉第常数",
    symbol: "F",
    category: "电化学",
    value: "96485.33212",
    unit: "C*mol^-1",
    description: "每摩尔电子所带电量，在电解与电池容量换算中使用。",
    source: "CODATA 2018",
    aliases: ["faraday constant", "法拉第常数", "faraday number"],
  },
  {
    id: "vacuum_permittivity",
    name: "真空介电常数",
    symbol: "ε₀",
    category: "电磁常数",
    value: "8.8541878128e-12",
    unit: "F*m^-1",
    description: "真空中电位移与电场强度之比，是电容与电磁场计算的基础常数。",
    source: "CODATA 2018",
    aliases: [
      "vacuum permittivity",
      "electric constant",
      "真空介电常数",
      "介电常数",
      "真空电容率",
      "epsilon0",
      "epsilon naught",
    ],
  },
  {
    id: "vacuum_permeability",
    name: "真空磁导率",
    symbol: "μ₀",
    category: "电磁常数",
    value: "1.25663706212e-6",
    unit: "H*m^-1",
    description: "真空中磁场强度与磁感应强度的换算系数，旧称真空磁导率常数。",
    source: "CODATA 2018",
    aliases: [
      "vacuum permeability",
      "magnetic constant",
      "真空磁导率",
      "磁导率",
      "mu0",
      "mu naught",
    ],
  },
  {
    id: "electron_mass",
    name: "电子质量",
    symbol: "mₑ",
    category: "原子物理",
    value: "9.1093837015e-31",
    unit: "kg",
    description: "电子的静止质量，用于质能换算与粒子物理计算。",
    source: "CODATA 2018",
    aliases: ["electron mass", "电子质量", "电子静止质量", "m_e"],
  },
  {
    id: "proton_mass",
    name: "质子质量",
    symbol: "mₚ",
    category: "原子物理",
    value: "1.67262192369e-27",
    unit: "kg",
    description: "质子的静止质量，约为电子质量的 1836 倍。",
    source: "CODATA 2018",
    aliases: ["proton mass", "质子质量", "m_p"],
  },
  {
    id: "bohr_radius",
    name: "玻尔半径",
    symbol: "a₀",
    category: "原子物理",
    value: "5.29177210903e-11",
    unit: "m",
    description: "氢原子基态电子轨道半径，是原子尺度的长度基准。",
    source: "CODATA 2018",
    aliases: ["bohr radius", "玻尔半径", "a0"],
  },
  {
    id: "rydberg_constant",
    name: "里德伯常数",
    symbol: "R∞",
    category: "原子物理",
    value: "10973731.568160",
    unit: "m^-1",
    description: "氢原子光谱项的基础常数，用于谱线波数与能级计算。",
    source: "CODATA 2018",
    aliases: ["rydberg constant", "里德伯常数", "rydberg"],
  },
  {
    id: "stefan_boltzmann_constant",
    name: "斯特藩-玻尔兹曼常数",
    symbol: "σ",
    category: "热力学",
    value: "5.670374419e-8",
    unit: "W*m^-2*K^-4",
    description: "黑体辐射总能量与温度四次方之间的比例常数。",
    source: "CODATA 2018",
    aliases: [
      "stefan-boltzmann constant",
      "stefan boltzmann constant",
      "斯特藩-玻尔兹曼常数",
      "斯特藩玻尔兹曼常数",
    ],
  },
  {
    id: "standard_atmosphere",
    name: "标准大气压",
    symbol: "atm",
    category: "地球物理",
    value: "101325",
    unit: "Pa",
    description: "定义值：海平面标准大气压，等于 760 mmHg。",
    source: "ISO 2533",
    aliases: ["standard atmosphere", "标准大气压", "标准大气压力"],
  },
];

const SHORT_ALIAS_MIN_LENGTH = 2;

/**
 * Greek letters and `∞` have no compatibility decomposition, so NFKC keeps them
 * and the strip regex below would delete them — `ε₀` normalized to `0`, which
 * made a bare `0` query resolve to a physics constant. Transliterate the ones
 * this table actually uses (`ħ`/`ℏ` stay as-is: mapping them to `h` would
 * collide with the Planck constant alias).
 */
const GREEK_TRANSLITERATION: Record<string, string> = {
  "α": "alpha",
  "β": "beta",
  "γ": "gamma",
  "δ": "delta",
  "Δ": "delta",
  "ε": "epsilon",
  "θ": "theta",
  "λ": "lambda",
  "μ": "mu",
  "ν": "nu",
  "ξ": "xi",
  "π": "pi",
  "ρ": "rho",
  "σ": "sigma",
  "τ": "tau",
  "φ": "phi",
  "ϕ": "phi",
  "χ": "chi",
  "ψ": "psi",
  "ω": "omega",
  "Ω": "omega",
  "∞": "infinity",
};

function transliterateSymbols(input: string): string {
  let output = "";
  for (const character of input) {
    output += GREEK_TRANSLITERATION[character] ?? character;
  }
  return output;
}

function normalizeConstantKey(input: string): string {
  return transliterateSymbols(input.normalize("NFKC"))
    .toLowerCase()
    .replace(/[^a-z0-9\u4E00-\u9FA5\u0127\u210F\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_INDEX = new Map<string, ScientificConstantDefinition>();

for (const constant of SCIENTIFIC_CONSTANTS) {
  const aliasSet = new Set<string>([
    constant.id,
    constant.name,
    constant.symbol ?? "",
    ...constant.aliases,
  ]);

  for (const alias of aliasSet) {
    const normalized = normalizeConstantKey(alias);
    if (!normalized || ALIAS_INDEX.has(normalized)) continue;
    ALIAS_INDEX.set(normalized, constant);
  }
}

export function findScientificConstant(
  query: string,
): ScientificConstantDefinition | null {
  if (!query) return null;
  const normalized = normalizeConstantKey(query);
  if (!normalized) return null;

  const direct = ALIAS_INDEX.get(normalized);
  if (direct) {
    return direct;
  }

  const padded = ` ${normalized} `;
  const tokens = normalized.split(" ").filter(Boolean);

  for (const [alias, constant] of ALIAS_INDEX.entries()) {
    if (alias === normalized) {
      return constant;
    }

    if (alias.includes(" ")) {
      if (padded.includes(` ${alias} `)) {
        return constant;
      }
      continue;
    }

    if (alias.length < SHORT_ALIAS_MIN_LENGTH) {
      continue;
    }

    if (tokens.includes(alias)) {
      return constant;
    }
  }

  return null;
}
