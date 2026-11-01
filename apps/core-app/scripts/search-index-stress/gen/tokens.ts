export type TokenScript = 'latin' | 'han-s' | 'han-t' | 'ja' | 'ko' | 'ar' | 'he'

const CONSONANTS = Array.from('bcdfghjklmnprstvwxyz')
const VOWELS = Array.from('aeiou')
const LATIN = CONSONANTS.flatMap((c) => VOWELS.map((v) => c + v))

export const HAN_SIMPLIFIED: ReadonlyArray<readonly [string, string]> = [
  ['云', 'yun'],
  ['山', 'shan'],
  ['水', 'shui'],
  ['火', 'huo'],
  ['木', 'mu'],
  ['金', 'jin'],
  ['土', 'tu'],
  ['日', 'ri'],
  ['月', 'yue'],
  ['星', 'xing'],
  ['风', 'feng'],
  ['雨', 'yu'],
  ['雪', 'xue'],
  ['花', 'hua'],
  ['草', 'cao'],
  ['树', 'shu'],
  ['鸟', 'niao'],
  ['鱼', 'yu'],
  ['马', 'ma'],
  ['龙', 'long'],
  ['虎', 'hu'],
  ['鹰', 'ying'],
  ['海', 'hai'],
  ['江', 'jiang'],
  ['河', 'he'],
  ['湖', 'hu'],
  ['石', 'shi'],
  ['沙', 'sha'],
  ['光', 'guang'],
  ['影', 'ying'],
  ['声', 'sheng'],
  ['色', 'se'],
  ['红', 'hong'],
  ['蓝', 'lan'],
  ['绿', 'lv'],
  ['黄', 'huang'],
  ['白', 'bai'],
  ['黑', 'hei'],
  ['青', 'qing'],
  ['紫', 'zi'],
  ['春', 'chun'],
  ['夏', 'xia'],
  ['秋', 'qiu'],
  ['冬', 'dong'],
  ['东', 'dong'],
  ['南', 'nan'],
  ['西', 'xi'],
  ['北', 'bei'],
  ['中', 'zhong'],
  ['大', 'da'],
  ['小', 'xiao'],
  ['彩', 'cai'],
  ['高', 'gao'],
  ['新', 'xin'],
  ['古', 'gu'],
  ['明', 'ming'],
  ['安', 'an'],
  ['平', 'ping'],
  ['晴', 'qing'],
  ['亮', 'liang'],
  ['福', 'fu'],
  ['寿', 'shou'],
  ['喜', 'xi'],
  ['吉', 'ji'],
  ['祥', 'xiang'],
  ['瑞', 'rui'],
  ['华', 'hua'],
  ['美', 'mei'],
  ['丽', 'li'],
  ['雅', 'ya'],
  ['静', 'jing'],
  ['清', 'qing'],
  ['灵', 'ling'],
  ['秀', 'xiu'],
  ['文', 'wen'],
  ['武', 'wu'],
  ['学', 'xue'],
  ['书', 'shu'],
  ['诗', 'shi'],
  ['画', 'hua'],
  ['琴', 'qin'],
  ['棋', 'qi'],
  ['茶', 'cha'],
  ['酒', 'jiu'],
  ['米', 'mi'],
  ['面', 'mian'],
  ['菜', 'cai'],
  ['果', 'guo'],
  ['桥', 'qiao'],
  ['门', 'men'],
  ['窗', 'chuang'],
  ['灯', 'deng'],
  ['车', 'che'],
  ['舟', 'zhou'],
  ['路', 'lu'],
  ['城', 'cheng'],
  ['村', 'cun'],
  ['家', 'jia'],
  ['国', 'guo'],
  ['天', 'tian']
]

const HAN_TRADITIONAL = Array.from(
  '雲山水火木金土日月星風雨雪花草樹鳥魚馬龍虎鷹海江河湖石沙光影聲色紅藍綠黃白黑青紫春夏秋冬東南西北中大小長高新古明安平和樂福壽喜吉祥瑞華美麗雅靜清靈秀文武學書詩畫琴棋茶酒米麵菜果橋門窗燈車舟路城村家國天'
)

const KANA = Array.from(
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン山川森空海花雪月火水'
)

const HANGUL = Array.from(
  '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호구누두루무부수우주추쿠투푸후그느드르므브스으즈츠크트프흐기니디리미비시이지치키티피히개내대래매배새애재채게네데레메베세에제체'
)

const ARABIC = Array.from('ابتثجحخدذرزسشصضطظعغفقكلمنهوي')
const HEBREW = Array.from('אבגדהוזחטיכלמנסעפצקרשת')

interface ScriptSpec {
  pool: readonly string[]
  length: number
  suffixDigit: boolean
}

const SCRIPTS: Record<TokenScript, ScriptSpec> = {
  latin: { pool: LATIN, length: 3, suffixDigit: true },
  'han-s': { pool: HAN_SIMPLIFIED.map(([char]) => char), length: 3, suffixDigit: false },
  'han-t': { pool: HAN_TRADITIONAL, length: 3, suffixDigit: false },
  ja: { pool: KANA, length: 3, suffixDigit: false },
  ko: { pool: HANGUL, length: 3, suffixDigit: false },
  ar: { pool: ARABIC, length: 4, suffixDigit: false },
  he: { pool: HEBREW, length: 4, suffixDigit: false }
}

const GOLDEN = 0.6180339887498949
const strides = new Map<number, number>()

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** A stride coprime to the space and far from small, so neighbouring serials share no leading characters. */
function strideFor(space: number): number {
  let stride = strides.get(space)
  if (stride === undefined) {
    stride = Math.floor(space * GOLDEN)
    while (gcd(stride, space) !== 1) stride += 1
    strides.set(space, stride)
  }
  return stride
}

export function tokenSpace(script: TokenScript): number {
  const spec = SCRIPTS[script]
  return spec.pool.length ** spec.length
}

/** Bijective in `serial` for a fixed seed, so two serials can never collide. */
export function tokenFor(serial: number, script: TokenScript, seed: number): string {
  const spec = SCRIPTS[script]
  const space = spec.pool.length ** spec.length
  if (!Number.isInteger(serial) || serial < 0 || serial >= space) {
    throw new Error(`token serial ${serial} outside ${script} space ${space}`)
  }
  let value = (strideFor(space) * serial + (seed % space)) % space
  const chars: string[] = []
  for (let position = 0; position < spec.length; position += 1) {
    chars.push(spec.pool[value % spec.pool.length] as string)
    value = Math.floor(value / spec.pool.length)
  }
  const token = chars.reverse().join('')
  return spec.suffixDigit ? `${token}${serial % 10}` : token
}

/** Characters of common Chinese app names, one reading each; polyphonic characters are left out on purpose. */
const APP_NAME_PINYIN = `
微wei 信xin 企qi 业ye 钉ding 腾teng 讯xun 议yi 飞fei 哔bi 哩li 网wang 易yi 音yin 百bai 度du 盘pan 访fang 达da
系xi 统tong 设she 置zhi 历li 备bei 忘wang 录lu 照zhao 片pian 预yu 览lan 计ji 算suan 器qi 终zhong 端duan 邮you
件jian 地di 图tu 息xi 通tong 提ti 醒xing 事shi 项xiang 相xiang 机ji 时shi 钟zhong 气qi 词ci 典dian 活huo 动dong
监jian 视shi 磁ci 工gong 具ju 控kong 制zhi 台tai 输shu 入ru 法fa 应ying 用yong 商shang 店dian 剪jian 映ying
抖dou 淘tao 宝bao 支zhi 付fu 京jing 迅xun 雷lei 搜sou 狗gou 互hu 联lian 服fu 务wu 阅yue 读du 笔bi 记ji
档dang 表biao 格ge 演yan 示shi 稿gao 板ban 播bo 放fang 浏liu 邀yao 请qing 翻fan 译yi 截jie 屏ping 录lu
`
  .trim()
  .split(/\s+/)
  .map((pair): [string, string] => [pair.slice(0, 1), pair.slice(1)])

const PINYIN_BY_CHAR = new Map<string, string>([...APP_NAME_PINYIN, ...HAN_SIMPLIFIED])

export function pinyinOfHan(text: string): { full: string; initials: string } | null {
  let full = ''
  let initials = ''
  for (const char of text) {
    const reading = PINYIN_BY_CHAR.get(char)
    if (!reading) return null
    full += reading
    initials += reading[0]
  }
  return { full, initials }
}
