import * as THREE from 'three'

/**
 * 원작 그림(PNG)으로 캐릭터를 그리기 위한 스프라이트 세트.
 *
 * public/characters/<캐릭터 ID>/ 폴더에서 읽는다.
 *   sprite.json (선택)  { "down": ["down_0.png", "down_1.png"], "up": [...], "left": [...], "right": [...],
 *                         "trapped": [...], "portrait": "portrait.png", "scale": 1, "fps": 8 }
 *   sprite.json이 없으면 기본 파일 이름을 쓴다: down.png, up.png, left.png, right.png, trapped.png, portrait.png
 *   right가 없으면 left를 좌우 반전해서 쓴다. down 이미지가 없으면 3D 모델을 쓴다.
 */
export type Dir = 'up' | 'down' | 'left' | 'right'

export interface SpriteFrames {
  textures: THREE.Texture[]
  aspect: number // 가로/세로
}

export interface SpriteSet {
  dirs: Record<Dir, SpriteFrames> // 서 있을 때 (첫 프레임)
  walk: Record<Dir, SpriteFrames> // 걸을 때 반복
  needsShadow: boolean // 그림에 그림자가 없으면 바닥 그림자를 깐다
  trapped?: SpriteFrames
  portraitUrl: string
  scale: number
  fps: number
}

interface Manifest {
  walk_down?: string[] | string
  walk_up?: string[] | string
  walk_left?: string[] | string
  walk_right?: string[] | string
  shadow?: boolean
  down?: string[] | string
  up?: string[] | string
  left?: string[] | string
  right?: string[] | string
  trapped?: string[] | string
  portrait?: string
  scale?: number
  fps?: number
}

const base = (id: string) => `${import.meta.env.BASE_URL}characters/${id}/`
const cache = new Map<string, SpriteSet | null>()
const pending = new Map<string, Promise<SpriteSet | null>>()

/** 팀 색. 원본 그림은 빨간 팀이고, 파란 팀은 빨간색 부분만 파랑으로 바꿔 그린다 (원작과 같은 방식). */
export type Team = 'red' | 'blue'
export const teamOfSlot = (slot: number): Team => (slot % 2 === 0 ? 'red' : 'blue')
const key = (id: string, team: Team) => `${id}:${team}`

/** 채도가 높은 빨간색(색상 340°~14°)만 파란색(215°)으로 돌린다. 피부색(주황빛, 낮은 채도)은 그대로 둔다. */
function recolorToBlue(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    const r = d[i] / 255
    const g = d[i + 1] / 255
    const b = d[i + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const v = max
    const delta = max - min
    const sat = max === 0 ? 0 : delta / max
    if (sat < 0.45 || max !== r) continue
    let h = (60 * ((g - b) / delta) + 360) % 360
    if (!(h >= 340 || h <= 14)) continue
    h = (h + 215) % 360
    // HSV → RGB
    const cc = v * sat
    const x = cc * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = v - cc
    let rr = 0
    let gg = 0
    let bb = 0
    if (h < 60) [rr, gg, bb] = [cc, x, 0]
    else if (h < 120) [rr, gg, bb] = [x, cc, 0]
    else if (h < 180) [rr, gg, bb] = [0, cc, x]
    else if (h < 240) [rr, gg, bb] = [0, x, cc]
    else if (h < 300) [rr, gg, bb] = [x, 0, cc]
    else [rr, gg, bb] = [cc, 0, x]
    d[i] = Math.round((rr + m) * 255)
    d[i + 1] = Math.round((gg + m) * 255)
    d[i + 2] = Math.round((bb + m) * 255)
  }
  ctx.putImageData(data, 0, 0)
  return c
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function toTexture(img: HTMLImageElement | HTMLCanvasElement, flip = false) {
  const tex = new THREE.Texture(img)
  tex.colorSpace = THREE.SRGBColorSpace
  // 작은 원작 그림을 크게 늘리므로 부드럽게 보간한다 (Nearest면 계단처럼 깨져 보임)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.anisotropy = 4
  if (flip) {
    tex.wrapS = THREE.RepeatWrapping
    tex.repeat.x = -1
  }
  tex.needsUpdate = true
  return tex
}

async function loadFrames(id: string, team: Team, files: string[] | string | undefined, flip = false): Promise<SpriteFrames | null> {
  if (!files) return null
  const list = Array.isArray(files) ? files : [files]
  const imgs = (await Promise.all(list.map((f) => loadImage(base(id) + f)))).filter((x): x is HTMLImageElement => !!x)
  if (imgs.length === 0) return null
  // 같은 파일이 여러 번(걷기 순서) 나오면 텍스처를 공유한다
  const made = new Map<string, THREE.Texture>()
  const textures = imgs.map((img) => {
    let t = made.get(img.src)
    if (!t) {
      t = toTexture(team === 'blue' ? recolorToBlue(img) : img, flip)
      made.set(img.src, t)
    }
    return t
  })
  return { textures, aspect: imgs[0].naturalWidth / imgs[0].naturalHeight }
}

async function fetchManifest(id: string): Promise<Manifest | null> {
  try {
    const res = await fetch(base(id) + 'sprite.json', { cache: 'no-cache' })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    return (await res.json()) as Manifest
  } catch {
    return null
  }
}

async function load(id: string, team: Team): Promise<SpriteSet | null> {
  const m: Manifest = (await fetchManifest(id)) ?? {
    down: 'down.png', up: 'up.png', left: 'left.png', right: 'right.png', trapped: 'trapped.png', portrait: 'portrait.png',
  }
  const down = await loadFrames(id, team, m.down)
  if (!down) return null
  const [up, left, right, trapped] = await Promise.all([
    loadFrames(id, team, m.up),
    loadFrames(id, team, m.left),
    loadFrames(id, team, m.right),
    loadFrames(id, team, m.trapped),
  ])
  const leftF = left ?? (right ? await loadFrames(id, team, m.right, true) : null) ?? down
  const rightF = right ?? (left ? await loadFrames(id, team, m.left, true) : null) ?? down
  const [wDown, wUp, wLeft, wRight] = await Promise.all([
    loadFrames(id, team, m.walk_down),
    loadFrames(id, team, m.walk_up),
    loadFrames(id, team, m.walk_left),
    loadFrames(id, team, m.walk_right),
  ])
  const wl = wLeft ?? (wRight ? await loadFrames(id, team, m.walk_right, true) : null) ?? leftF
  const wr = wRight ?? (wLeft ? await loadFrames(id, team, m.walk_left, true) : null) ?? rightF
  let portraitUrl = base(id) + (Array.isArray(m.down) ? m.down[0] : m.down)
  if (m.portrait && (await loadImage(base(id) + m.portrait))) portraitUrl = base(id) + m.portrait
  if (team === 'blue') {
    const img = await loadImage(portraitUrl)
    if (img) portraitUrl = recolorToBlue(img).toDataURL('image/png')
  }
  return {
    dirs: { down, up: up ?? down, left: leftF, right: rightF },
    walk: { down: wDown ?? down, up: wUp ?? up ?? wDown ?? down, left: wl, right: wr },
    needsShadow: !!m.shadow,
    trapped: trapped ?? undefined,
    portraitUrl,
    scale: m.scale ?? 1,
    fps: m.fps ?? 8,
  }
}

/** 캐릭터 스프라이트를 불러온다. 이미지가 없으면 null (3D 모델 사용). */
export function loadSpriteSet(id: string, team: Team = 'red'): Promise<SpriteSet | null> {
  const k = key(id, team)
  if (cache.has(k)) return Promise.resolve(cache.get(k)!)
  let p = pending.get(k)
  if (!p) {
    p = load(id, team).then((s) => {
      cache.set(k, s)
      pending.delete(k)
      return s
    })
    pending.set(k, p)
  }
  return p
}

/** 이미 불러온 결과만 돌려준다 (아직이면 undefined) */
export function cachedSpriteSet(id: string, team: Team = 'red'): SpriteSet | null | undefined {
  return cache.get(key(id, team))
}

// ---------------------------------------------------------------- 3D 장면에 세우기

/** 카메라가 바닥을 내려다보는 각도 */
export const VIEW_ELEVATION = (58 * Math.PI) / 180
// 세로로 세운 그림은 화면에서 cos(각도)만큼 납작해 보이므로 그만큼 세로로 늘려 원래 비율로 보이게 한다.
export const VIEW_STRETCH = 1 / Math.cos(VIEW_ELEVATION)
const BASE_HEIGHT = 1.45

/** 발이 원점에 오는 세로 판. 정면(+Z, 카메라 쪽)을 본다. */
export function createSpriteBoard(set: SpriteSet) {
  const geo = new THREE.PlaneGeometry(1, 1)
  geo.translate(0, 0.5, 0)
  const mat = new THREE.MeshBasicMaterial({
    map: set.dirs.down.textures[0],
    transparent: true,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  const board = new THREE.Mesh(geo, mat)
  board.userData.set = set
  setBoardFrame(board, set.dirs.down, 0)
  return board
}

export function setBoardFrame(board: THREE.Mesh, frames: SpriteFrames, index: number) {
  const set = board.userData.set as SpriteSet
  const mat = board.material as THREE.MeshBasicMaterial
  const tex = frames.textures[index % frames.textures.length]
  if (mat.map !== tex) {
    mat.map = tex
    mat.needsUpdate = true
  }
  const h = BASE_HEIGHT * set.scale
  board.scale.set(h * frames.aspect, h * VIEW_STRETCH, 1)
}
