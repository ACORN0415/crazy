import * as THREE from 'three'

/**
 * 원작 이펙트/아이템/탈것 그림. public/fx/fx.json 에서 읽는다.
 * size는 원작 픽셀 크기(한 칸 = cell px), 그림 파일은 고해상도.
 */
export interface FxImage {
  tex: THREE.Texture
  img: HTMLImageElement
  w: number // 칸 단위
  h: number
}

export interface FxAssets {
  bubble: FxImage[]
  trap: FxImage[]
  flame: Record<string, FxImage[]>
  items: Record<string, FxImage>
  mounts: Record<string, Record<string, FxImage[]>>
}

interface Entry {
  file: string
  size: [number, number]
}

interface Manifest {
  cell: number
  bubble: Entry[]
  trap: Entry[]
  flame: Record<string, string[]>
  items: Record<string, Entry>
  mounts: Record<string, Record<string, Entry[]>>
}

const base = `${import.meta.env.BASE_URL}fx/`
let pending: Promise<FxAssets | null> | null = null
let loaded: FxAssets | null | undefined

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function texture(img: HTMLImageElement) {
  const t = new THREE.Texture(img)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

async function load(): Promise<FxAssets | null> {
  let m: Manifest
  try {
    const res = await fetch(base + 'fx.json', { cache: 'no-cache' })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    m = await res.json()
  } catch {
    return null
  }
  const cell = m.cell || 40
  const one = async (file: string, size?: [number, number]): Promise<FxImage | null> => {
    const img = await loadImage(base + file)
    if (!img) return null
    const [w, h] = size ?? [cell, cell]
    return { img, tex: texture(img), w: w / cell, h: h / cell }
  }
  const many = async (list: Entry[]) => (await Promise.all(list.map((e) => one(e.file, e.size)))).filter((x): x is FxImage => !!x)
  const flame: Record<string, FxImage[]> = {}
  for (const [k, files] of Object.entries(m.flame)) {
    flame[k] = (await Promise.all(files.map((f) => one(f)))).filter((x): x is FxImage => !!x)
  }
  const items: Record<string, FxImage> = {}
  for (const [k, e] of Object.entries(m.items)) {
    const im = await one(e.file, e.size)
    if (im) items[k] = im
  }
  const mounts: Record<string, Record<string, FxImage[]>> = {}
  for (const [k, dirs] of Object.entries(m.mounts)) {
    mounts[k] = {}
    for (const [d, list] of Object.entries(dirs)) mounts[k][d] = await many(list)
  }
  return { bubble: await many(m.bubble), trap: await many(m.trap), flame, items, mounts }
}

export function loadFx(): Promise<FxAssets | null> {
  if (!pending) {
    pending = load().then((a) => {
      loaded = a
      return a
    })
  }
  return pending
}

/** 이미 불러왔으면 바로 돌려준다 (아직이면 undefined, 없으면 null) */
export function cachedFx(): FxAssets | null | undefined {
  return loaded
}
