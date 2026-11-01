import { createRng, hashSeed } from './prng'

export interface Placement {
  /** Directory the file lives in; '' is the corpus root. */
  dir: string
  /** Directories only this scenario uses (new-dir), parents first; the caller creates them. */
  create: string[]
}

export const SEGMENTS = [
  'albums',
  'archive',
  'assets',
  'shots',
  'inbox',
  'exports',
  'drafts',
  'projects',
  'reports',
  'scans',
  'sketches',
  'trips',
  'work',
  'family',
  'gallery',
  'events',
  'notes',
  'refs',
  'stock',
  'receipts',
  'posters',
  'banners',
  'mockups',
  'camera',
  'wallpapers',
  'screens'
]

const SPACED = [
  'My Photos/Summer Trip',
  'Design Files/Final Review',
  'Screen Shots',
  'Holiday Pictures/Day 1',
  'Client Work/Round 2',
  'Old Backups/Phone Dump',
  'Team Share/Marketing Assets',
  'Family Photos/Birthday Party'
]
const CJK = [
  '相册/风景照',
  '资料/截图',
  '工作/海报设计',
  '旅行/东京之旅',
  '写真/旅行',
  '사진/여행',
  '문서/자료',
  '照片/家人'
]
const CROWDED = ['crowded/inbox', 'crowded/downloads', 'crowded/camera', 'crowded/scans']
export const NEW_DIR_ROOT = 'fresh'
export const COPY_SOURCE_DIR = 'copy-sources'
export const STAGE_DIR = '.stage'

const CHAINS_PER_DEPTH = [0, 6, 5, 5, 4, 4, 4]

export const CROWDED_DIRECTORIES: readonly string[] = CROWDED

function parentsOf(path: string): string[] {
  const parts = path.split('/')
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

export class PlacementPool {
  private readonly chains: string[][] = [[]]
  private readonly uses = new Map<string, number>()

  constructor(seed: number) {
    const rng = createRng(hashSeed(seed, 'placement'))
    for (let depth = 1; depth <= 6; depth += 1) {
      const seen = new Set<string>()
      while (seen.size < (CHAINS_PER_DEPTH[depth] as number)) {
        const parts = rng.shuffle(SEGMENTS).slice(0, depth)
        seen.add(parts.join('/'))
      }
      this.chains.push([...seen])
    }
  }

  /** Directories every run starts with, parents first, without duplicates. */
  directories(): string[] {
    const all = new Set<string>([NEW_DIR_ROOT, COPY_SOURCE_DIR, STAGE_DIR, 'ignored'])
    const sources = [...this.chains.flat(), ...SPACED, ...CJK, ...CROWDED]
    for (const source of sources) for (const path of parentsOf(source)) all.add(path)
    return [...all].sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1))
  }

  resolve(id: string, token: string): Placement {
    const use = this.uses.get(id) ?? 0
    this.uses.set(id, use + 1)
    const rotate = (list: readonly string[]): string => list[use % list.length] as string
    const depth = /^depth-(\d)$/.exec(id)
    if (depth) return { dir: rotate(this.chains[Number(depth[1])] as string[]), create: [] }
    switch (id) {
      case 'root':
        return { dir: '', create: [] }
      case 'dir-spaces':
        return { dir: rotate(SPACED), create: [] }
      case 'dir-cjk':
        return { dir: rotate(CJK), create: [] }
      case 'crowded':
        return { dir: rotate(CROWDED), create: [] }
      case 'new-dir': {
        const levels = 1 + (use % 3)
        const parts = [NEW_DIR_ROOT, token, ...['inner', 'deeper'].slice(0, levels - 1)]
        const all = parentsOf(parts.join('/')).slice(1)
        return { dir: all[all.length - 1] as string, create: all }
      }
      default:
        throw new Error(`unknown placement: ${id}`)
    }
  }
}

export function joinPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`
}
