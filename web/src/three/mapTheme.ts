import * as THREE from 'three'
import { MAP_H, MAP_W } from '../render'
import { VIEW_STRETCH } from './sprites'

/**
 * 원작 맵 그림 세트. public/maps/<테마>/theme.json 에서 읽는다.
 *   { "cell": 40, "wall": [{file,w,h}], "block": [...], "push": [...], "bush": [...], "floor": [...] }
 * w/h는 원작 픽셀 크기(한 칸 = cell px), 그림 파일 자체는 고해상도여도 된다.
 * theme.json이 없으면 기존 3D 모델을 쓴다.
 */
export type TileKind = 'wall' | 'block' | 'push' | 'bush'

interface ThemePiece {
  file: string
  w: number
  h: number
}

interface ThemeManifest {
  cell: number
  wall?: ThemePiece[]
  block?: ThemePiece[]
  push?: ThemePiece[]
  bush?: ThemePiece[]
  floor?: ThemePiece[]
  named?: Record<string, ThemePiece> // 맵 art 글자로 고르는 물체 그림
  floorNamed?: Record<string, ThemePiece> // 맵 art 글자로 고르는 바닥 그림
  decor?: Record<string, ThemePiece> // 여러 칸짜리 큰 그림
  thorn?: ThemePiece // 가시 바닥 (T)
}

export interface ThemeImage {
  img: HTMLImageElement
  w: number // 칸 단위
  h: number
}

export interface MapThemeAssets {
  pieces: Record<TileKind, ThemeImage[]>
  floor: HTMLImageElement[]
  named: Record<string, ThemeImage>
  floorNamed: Record<string, HTMLImageElement>
  decor: Record<string, ThemeImage>
  thorn?: HTMLImageElement
}

/** 맵 정의 중 화면에 필요한 부분 */
export interface MapLayout {
  rows: string[]
  art?: string[]
  decor?: { name: string; x: number; y: number; w: number; h: number }[]
}

export const artAt = (layout: MapLayout | undefined, cell: number) =>
  layout?.art?.[Math.floor(cell / MAP_W)]?.[cell % MAP_W] ?? '.'

/** 장식 그림 밑의 보이지 않는 벽인가 */
export const hiddenAt = (layout: MapLayout | undefined, cell: number) =>
  layout?.rows[Math.floor(cell / MAP_W)]?.[cell % MAP_W] === '%'

const cache = new Map<string, Promise<MapThemeAssets | null>>()
const base = (id: string) => `${import.meta.env.BASE_URL}maps/${id}/`

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

async function load(id: string): Promise<MapThemeAssets | null> {
  let m: ThemeManifest
  try {
    const res = await fetch(base(id) + 'theme.json', { cache: 'no-cache' })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    m = await res.json()
  } catch {
    return null
  }
  const cell = m.cell || 40
  const pieces = async (list: ThemePiece[] | undefined) => {
    const out: ThemeImage[] = []
    for (const p of list ?? []) {
      const img = await loadImage(base(id) + p.file)
      if (img) out.push({ img, w: p.w / cell, h: p.h / cell })
    }
    return out
  }
  const named = async (rec: Record<string, ThemePiece> | undefined) => {
    const out: Record<string, ThemeImage> = {}
    for (const [k, p] of Object.entries(rec ?? {})) {
      const [im] = await pieces([p])
      if (im) out[k] = im
    }
    return out
  }
  const [wall, block, push, bush, floor] = await Promise.all([pieces(m.wall), pieces(m.block), pieces(m.push), pieces(m.bush), pieces(m.floor)])
  if (!wall.length || !block.length) return null
  const floorNamed: Record<string, HTMLImageElement> = {}
  for (const [k, v] of Object.entries(await named(m.floorNamed))) floorNamed[k] = v.img
  return {
    pieces: { wall, block, push: push.length ? push : block, bush },
    floor: floor.map((f) => f.img),
    named: await named(m.named),
    floorNamed,
    decor: await named(m.decor),
    thorn: m.thorn ? ((await pieces([m.thorn]))[0]?.img ?? undefined) : undefined,
  }
}

export function loadMapTheme(id: string): Promise<MapThemeAssets | null> {
  let p = cache.get(id)
  if (!p) {
    p = load(id)
    cache.set(id, p)
  }
  return p
}

/** 칸마다 고정된 무작위 값 (같은 칸은 항상 같은 그림) */
export function cellHash(i: number) {
  let h = (i + 1) * 2654435761
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return h >>> 0
}

function texture(img: HTMLImageElement) {
  const t = new THREE.Texture(img)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/** 원작 그림을 세로 판으로 세우는 타일 모델 생성기 */
export class SpriteTileKit {
  private mats = new Map<HTMLImageElement, THREE.MeshBasicMaterial>()
  private geo: THREE.PlaneGeometry

  constructor(
    private assets: MapThemeAssets,
    private layout?: MapLayout,
  ) {
    this.geo = new THREE.PlaneGeometry(1, 1)
    this.geo.translate(0, 0.5, 0)
  }

  private material(img: HTMLImageElement, own = false) {
    const make = () =>
      new THREE.MeshBasicMaterial({ map: texture(img), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false })
    if (own) return make()
    let m = this.mats.get(img)
    if (!m) {
      m = make()
      this.mats.set(img, m)
    }
    return m
  }

  create(ch: string, cell: number): THREE.Object3D | null {
    const kind = ({ '#': 'wall', x: 'block', o: 'push', '~': 'bush' } as Record<string, TileKind>)[ch]
    if (!kind) return null
    if (kind === 'wall' && hiddenAt(this.layout, cell)) return null
    const list = this.assets.pieces[kind]
    // 맵에서 지정한 그림이 있으면 그것을 쓴다 (예: 해골 석상, 울타리). 밀려서 옮겨 간 칸은 기본 그림.
    const piece = this.assets.named[artAt(this.layout, cell)] ?? (list.length ? list[cellHash(cell) % list.length] : null)
    if (!piece) return null
    return this.board(piece, kind === 'bush')
  }

  /** 여러 칸짜리 장식 그림. (x,y)는 왼쪽 위 칸 */
  createDecor(name: string, w: number, h: number): THREE.Object3D | null {
    const piece = this.assets.decor[name]
    if (!piece) return null
    const g = new THREE.Group()
    const b = this.board(piece, false)
    // 그림 아래쪽이 맨 아래 줄의 앞쪽 경계에 오도록
    b.position.set(w / 2, 0, h - 0.5)
    g.add(b)
    return g
  }

  private board(piece: ThemeImage, bush: boolean) {
    const mat = this.material(piece.img, bush)
    const board = new THREE.Mesh(this.geo, mat)
    // 그림 아래쪽이 칸의 앞쪽 경계에 오도록 세운다 (원작처럼 위로 솟은 부분은 뒤 칸을 덮는다)
    board.position.z = 0.49
    board.scale.set(piece.w, piece.h * VIEW_STRETCH, 1)
    board.renderOrder = 1
    const g = new THREE.Group()
    g.add(board)
    if (bush) g.userData.materials = [mat]
    return g
  }

  get decorNames() {
    return Object.keys(this.assets.decor)
  }

  /** 바닥 타일을 체크무늬로 깐 텍스처 */
  floorTexture(): THREE.Texture | null {
    const tiles = this.assets.floor
    if (!tiles.length) return null
    const P = 128
    const c = document.createElement('canvas')
    c.width = MAP_W * P
    c.height = MAP_H * P
    const ctx = c.getContext('2d')!
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const named = this.assets.floorNamed[artAt(this.layout, y * MAP_W + x)]
        ctx.drawImage(named ?? tiles[(x + y) % tiles.length], x * P, y * P, P, P)
        // 가시 바닥은 바닥 위에 그린다 (지나갈 수 있는 칸)
        if (this.assets.thorn && this.layout?.rows[y]?.[x] === 'T') ctx.drawImage(this.assets.thorn, x * P, y * P, P, P)
      }
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }
}
