import * as THREE from 'three'
import { addOutlines, decal, flat, mesh, toon } from './toon'

/**
 * 캐릭터 모델. 발이 원점, 정면이 +Z.
 * 공통 2등신 몸체 위에 캐릭터마다 머리/모자/후드/소품을 얹는다.
 */
export interface CharacterParts {
  root: THREE.Group
  head: THREE.Group
  torso: THREE.Object3D
  legs: [THREE.Group, THREE.Group]
  arms: [THREE.Group, THREE.Group]
  eyes: THREE.Group[]
  tail?: THREE.Group
}

interface Palette {
  skin: string
  hair: string
  outfit: string
  outfitDark: string
  shoe: string
  iris: string
  mouth?: 'smile' | 'grin' | 'cat'
  skirt?: boolean
}

const PALETTES: Record<string, Palette> = {
  dao: { skin: '#ffe2c6', hair: '#6b4226', outfit: '#3b7ddd', outfitDark: '#21468a', shoe: '#2a5fc4', iris: '#6a4126' },
  bazzi: { skin: '#ffdcbc', hair: '#c4622d', outfit: '#e94b3c', outfitDark: '#8a2a20', shoe: '#ffb000', iris: '#3a2a1a', mouth: 'grin' },
  dizni: { skin: '#ffe6d2', hair: '#ff7eb3', outfit: '#ff9cc8', outfitDark: '#d94d8a', shoe: '#ff4f8b', iris: '#8e3b5d', skirt: true },
  marid: { skin: '#ffe6d2', hair: '#c3a6ff', outfit: '#7e57c2', outfitDark: '#4a2f8a', shoe: '#3f2a73', iris: '#5e35b1', skirt: true },
  uni: { skin: '#fff0e2', hair: '#ffe3a3', outfit: '#7fe0c4', outfitDark: '#3fae93', shoe: '#ff9ad5', iris: '#7a4fd6' },
  kephi: { skin: '#ffe2c6', hair: '#8a4b20', outfit: '#ffa726', outfitDark: '#c26a00', shoe: '#6d4c41', iris: '#2e7d32', mouth: 'cat' },
}

// 머리 (머리 그룹 기준 좌표)
const HEAD_C = new THREE.Vector3(0, 0.27, 0)
const HEAD_R = 0.3
const HEAD_SX = 1.06
const HEAD_SY = 0.95

const sphere = (r: number, w = 24, h = 18) => new THREE.SphereGeometry(r, w, h)

/** 머리 표면 위의 점과 바깥 방향. yaw: 정면 기준 좌우 각, pitch: 위아래 각 */
function onHead(yaw: number, pitch: number, lift = 0) {
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  const r = HEAD_R + lift
  const pos = new THREE.Vector3(HEAD_C.x + dir.x * r * HEAD_SX, HEAD_C.y + dir.y * r * HEAD_SY, HEAD_C.z + dir.z * r)
  return { pos, dir }
}

/** 표면에 붙는 장식: 로컬 +Z가 바깥을 향하도록 놓는다 */
function surface(parent: THREE.Object3D, yaw: number, pitch: number, lift: number, ...children: THREE.Object3D[]) {
  const { pos, dir } = onHead(yaw, pitch, lift)
  const g = new THREE.Group()
  g.position.copy(pos)
  g.lookAt(pos.clone().add(dir))
  g.add(...children)
  parent.add(g)
  return g
}

function buildEye(p: Palette) {
  const g = new THREE.Group()
  const white = flat('#ffffff')
  const ball = decal(sphere(0.06), flat('#24160f'))
  ball.scale.set(0.8, 1.15, 0.35)
  const iris = decal(sphere(0.042), flat(p.iris))
  iris.scale.set(0.75, 0.95, 0.3)
  iris.position.set(0, -0.012, 0.012)
  const hi = decal(sphere(0.02, 12, 8), white)
  hi.position.set(0.016, 0.03, 0.024)
  hi.scale.z = 0.4
  const hi2 = decal(sphere(0.01, 8, 6), white)
  hi2.position.set(-0.014, -0.025, 0.024)
  hi2.scale.z = 0.4
  g.add(ball, iris, hi, hi2)
  return g
}

function buildMouth(kind: Palette['mouth']) {
  const g = new THREE.Group()
  const lip = flat('#8a3a2c')
  if (kind === 'grin') {
    const open = decal(new THREE.CircleGeometry(0.042, 20, Math.PI, Math.PI), flat('#7a2318'))
    const tongue = decal(new THREE.CircleGeometry(0.022, 14, Math.PI, Math.PI), flat('#ff7a7a'))
    tongue.position.set(0, -0.016, 0.002)
    g.add(open, tongue)
  } else if (kind === 'cat') {
    for (const s of [-1, 1]) {
      const arc = decal(new THREE.TorusGeometry(0.02, 0.006, 6, 12, Math.PI), lip)
      arc.rotation.z = Math.PI
      arc.position.x = s * 0.02
      g.add(arc)
    }
  } else {
    const arc = decal(new THREE.TorusGeometry(0.03, 0.007, 6, 16, Math.PI), lip)
    arc.rotation.z = Math.PI
    g.add(arc)
  }
  return g
}

/** 머리카락 캡(θ = frac·π)의 앞쪽 경계가 이마 위(약 22°)에 오도록 하는 뒤로 젖힘 각도 */
const HAIRLINE = (22 * Math.PI) / 180
const HAIR_TILT = (frac: number) => HAIRLINE - Math.PI / 2 + frac * Math.PI

function capGeo(r: number, thetaLen: number) {
  return new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, thetaLen)
}

/** 얼굴 쪽이 뚫린 후드 */
function hoodGeo(r: number, open = 1.2) {
  return new THREE.SphereGeometry(r, 36, 22, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, Math.PI * 0.72)
}

function star(r: number, depth: number) {
  const s = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    const rr = i % 2 === 0 ? r : r * 0.45
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: depth * 0.4, bevelThickness: depth * 0.4, bevelSegments: 1 })
  geo.center()
  return geo
}

// ---------------------------------------------------------------- 공통 몸체

function buildBase(p: Palette): CharacterParts {
  const root = new THREE.Group()
  const skin = toon(p.skin)
  const outfit = toon(p.outfit)
  const dark = toon(p.outfitDark)
  const shoe = toon(p.shoe)

  // 다리
  const legs = [-1, 1].map((s) => {
    const g = new THREE.Group()
    g.position.set(s * 0.075, 0.17, 0)
    g.add(mesh(new THREE.CapsuleGeometry(0.048, 0.04, 4, 12), dark, 0, -0.06, 0))
    const foot = mesh(sphere(0.07), shoe, 0, -0.13, 0.025)
    foot.scale.set(1, 0.68, 1.35)
    g.add(foot)
    root.add(g)
    return g
  }) as [THREE.Group, THREE.Group]

  // 몸통 (배가 살짝 나온 서양배 모양)
  const torso = new THREE.Group()
  torso.position.y = 0.15
  const prof = [
    [0.0, 0.0], [0.12, 0.004], [0.158, 0.05], [0.16, 0.12], [0.13, 0.2], [0.085, 0.26], [0.0, 0.275],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  torso.add(mesh(new THREE.LatheGeometry(prof, 28), outfit))
  if (p.skirt) {
    const skirt = mesh(new THREE.CylinderGeometry(0.13, 0.225, 0.15, 28), outfit, 0, 0.055, 0)
    torso.add(skirt)
    const hem = mesh(new THREE.TorusGeometry(0.222, 0.016, 8, 32), toon('#ffffff'), 0, -0.018, 0)
    hem.rotation.x = Math.PI / 2
    torso.add(hem)
  } else {
    const belt = mesh(new THREE.TorusGeometry(0.155, 0.02, 8, 28), dark, 0, 0.05, 0)
    belt.rotation.x = Math.PI / 2
    torso.add(belt)
  }
  const collar = mesh(new THREE.TorusGeometry(0.085, 0.028, 10, 24), toon('#ffffff'), 0, 0.265, 0.005)
  collar.rotation.x = Math.PI / 2
  torso.add(collar)
  root.add(torso)

  // 팔
  const arms = [-1, 1].map((s) => {
    const g = new THREE.Group()
    g.position.set(s * 0.145, 0.38, 0)
    g.rotation.z = s * 0.38
    g.add(mesh(new THREE.CapsuleGeometry(0.042, 0.07, 4, 12), outfit, 0, -0.07, 0))
    g.add(mesh(sphere(0.055), skin, 0, -0.15, 0.005))
    root.add(g)
    return g
  }) as [THREE.Group, THREE.Group]

  // 머리
  const head = new THREE.Group()
  head.position.y = 0.43
  const skull = mesh(sphere(HEAD_R, 36, 28), skin, HEAD_C.x, HEAD_C.y, HEAD_C.z)
  skull.scale.set(HEAD_SX, HEAD_SY, 1)
  head.add(skull)
  for (const s of [-1, 1]) {
    const ear = mesh(sphere(0.06), skin)
    ear.scale.set(0.6, 1, 0.8)
    surface(head, s * 1.45, -0.05, -0.02, ear)
  }

  // 얼굴
  const eyes = [-1, 1].map((s) => surface(head, s * 0.36, -0.04, -0.012, buildEye(p)))
  for (const s of [-1, 1]) {
    const brow = decal(new THREE.CapsuleGeometry(0.008, 0.045, 3, 8), flat(p.hair === '#ffe3a3' ? '#b88a4a' : p.hair))
    brow.rotation.z = Math.PI / 2 + s * 0.12
    surface(head, s * 0.36, 0.2, 0.004, brow)
    const blush = decal(sphere(0.045, 14, 10), flat('#ff8f8f', { transparent: true, opacity: 0.55 }))
    blush.scale.set(1, 0.55, 0.25)
    surface(head, s * 0.62, -0.2, 0, blush)
  }
  surface(head, 0, -0.32, 0.004, buildMouth(p.mouth))
  root.add(head)

  return { root, head, torso, legs, arms, eyes }
}

function bangs(head: THREE.Object3D, color: string, spots: [number, number, number][]) {
  const mat = toon(color)
  for (const [yaw, pitch, size] of spots) {
    const b = mesh(sphere(size), mat)
    b.scale.set(1.25, 0.7, 0.55)
    surface(head, yaw, pitch, 0.0, b)
  }
}

// ---------------------------------------------------------------- 캐릭터별

const BUILDERS: Record<string, (c: CharacterParts, p: Palette) => void> = {
  // 다오: 하얀 테두리가 있는 파란 털모자 + 노란 방울
  dao(c, p) {
    const hair = mesh(capGeo(0.318, Math.PI * 0.62), toon(p.hair), HEAD_C.x, HEAD_C.y, HEAD_C.z)
    hair.rotation.x = -HAIR_TILT(0.62)
    c.head.add(hair)
    bangs(c.head, p.hair, [[-0.42, 0.52, 0.085], [-0.05, 0.6, 0.09], [0.35, 0.55, 0.085]])
    const hat = new THREE.Group()
    hat.position.copy(HEAD_C)
    hat.rotation.x = -0.32
    const blue = toon('#2d6be0')
    hat.add(mesh(capGeo(0.335, Math.PI * 0.42), blue))
    const rim = mesh(new THREE.TorusGeometry(0.325, 0.055, 12, 40), toon('#ffffff'), 0, 0.085, 0)
    rim.rotation.x = Math.PI / 2
    hat.add(rim)
    hat.add(mesh(sphere(0.08), toon('#ffd23f'), 0, 0.37, 0))
    const badge = decal(star(0.05, 0.015), flat('#ffd23f'))
    const holder = new THREE.Group()
    holder.position.set(0, 0.24, 0.235)
    holder.rotation.x = -0.8
    holder.add(badge)
    hat.add(holder)
    c.head.add(hat)
  },

  // 배찌: 뾰족한 머리 + 거꾸로 쓴 빨간 모자 + 고글
  bazzi(c, p) {
    const hairMat = toon(p.hair)
    const hair = mesh(capGeo(0.318, Math.PI * 0.58), hairMat, HEAD_C.x, HEAD_C.y, HEAD_C.z)
    hair.rotation.x = -HAIR_TILT(0.58)
    c.head.add(hair)
    const spikes: [number, number][] = [[-0.55, 0.45], [-0.2, 0.55], [0.15, 0.56], [0.5, 0.46], [-1.3, 0.3], [1.3, 0.3], [2.6, 0.4], [-2.6, 0.4]]
    for (const [yaw, pitch] of spikes) {
      const sp = mesh(new THREE.ConeGeometry(0.065, 0.17, 10), hairMat)
      sp.rotation.x = Math.PI / 2 + 0.5
      surface(c.head, yaw, pitch, -0.02, sp)
    }
    const cap = new THREE.Group()
    cap.position.copy(HEAD_C)
    cap.rotation.x = -0.05
    const red = toon('#e8392f')
    cap.add(mesh(capGeo(0.328, Math.PI * 0.34), red))
    const brim = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 24, 1, false, Math.PI / 2, Math.PI), red, 0, 0.16, -0.25)
    brim.rotation.x = -0.35
    cap.add(brim)
    const strap = mesh(new THREE.TorusGeometry(0.3, 0.018, 8, 40), toon('#3a2a24'), 0, 0.15, 0)
    strap.rotation.x = Math.PI / 2
    cap.add(strap)
    for (const s of [-1, 1]) {
      const ring = mesh(new THREE.TorusGeometry(0.062, 0.02, 10, 20), toon('#ffc400'))
      const lens = decal(new THREE.CircleGeometry(0.058, 20), flat('#8fe3ff', { transparent: true, opacity: 0.9 }))
      const glint = decal(new THREE.CircleGeometry(0.018, 10), flat('#ffffff'))
      glint.position.set(0.02, 0.02, 0.003)
      const g = new THREE.Group()
      g.position.set(s * 0.085, 0.21, 0.235)
      g.rotation.x = -0.75
      g.add(ring, lens, glint)
      cap.add(g)
    }
    c.head.add(cap)
    // 셔츠 줄무늬
    const stripe = mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 28), toon('#ffffff'), 0, 0.12, 0)
    stripe.rotation.x = Math.PI / 2
    c.torso.add(stripe)
  },

  // 디지니: 분홍 양갈래 + 리본
  dizni(c, p) {
    const hairMat = toon(p.hair)
    const hair = mesh(capGeo(0.322, Math.PI * 0.64), hairMat, HEAD_C.x, HEAD_C.y, HEAD_C.z)
    hair.rotation.x = -HAIR_TILT(0.64)
    c.head.add(hair)
    const back = mesh(sphere(0.29), hairMat, 0, HEAD_C.y - 0.05, -0.09)
    back.scale.set(1.05, 0.9, 0.8)
    c.head.add(back)
    bangs(c.head, p.hair, [[-0.5, 0.48, 0.08], [-0.18, 0.56, 0.085], [0.18, 0.56, 0.085], [0.5, 0.48, 0.08]])
    const ribbon = toon('#ff3d7f')
    for (const s of [-1, 1]) {
      const tail = new THREE.Group()
      tail.position.set(s * 0.3, HEAD_C.y + 0.1, -0.1)
      const t = mesh(new THREE.CapsuleGeometry(0.085, 0.2, 6, 16), hairMat, s * 0.06, -0.2, -0.02)
      t.rotation.z = s * 0.28
      tail.add(t)
      const tip = mesh(sphere(0.07), hairMat, s * 0.11, -0.33, -0.02)
      tail.add(tip)
      for (const k of [-1, 1]) {
        const bow = mesh(new THREE.ConeGeometry(0.05, 0.1, 12), ribbon, 0, 0, k * 0.05)
        bow.rotation.x = k * Math.PI / 2
        tail.add(bow)
      }
      tail.add(mesh(sphere(0.03), ribbon))
      c.head.add(tail)
    }
  },

  // 마리드: 긴 라벤더 머리 + 큰 리본 + 별 지팡이
  marid(c, p) {
    const hairMat = toon(p.hair)
    const hair = mesh(capGeo(0.322, Math.PI * 0.6), hairMat, HEAD_C.x, HEAD_C.y, HEAD_C.z)
    hair.rotation.x = -HAIR_TILT(0.6)
    c.head.add(hair)
    const long = mesh(new THREE.CapsuleGeometry(0.21, 0.28, 6, 20), hairMat, 0, HEAD_C.y - 0.2, -0.14)
    long.scale.z = 0.7
    c.head.add(long)
    for (const s of [-1, 1]) {
      const lock = mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 12), hairMat, s * 0.27, HEAD_C.y - 0.15, 0.04)
      lock.rotation.z = s * 0.1
      c.head.add(lock)
    }
    bangs(c.head, p.hair, [[-0.45, 0.5, 0.09], [-0.05, 0.6, 0.095], [0.38, 0.53, 0.085]])
    const bowMat = toon('#ff6fb5')
    const bow = new THREE.Group()
    bow.position.set(0.12, HEAD_C.y + 0.28, -0.02)
    bow.rotation.z = -0.25
    for (const k of [-1, 1]) {
      const wing = mesh(new THREE.ConeGeometry(0.08, 0.17, 14), bowMat, k * 0.085, 0, 0)
      wing.rotation.z = (k * Math.PI) / 2
      bow.add(wing)
    }
    bow.add(mesh(sphere(0.045), bowMat))
    c.head.add(bow)
    // 지팡이 (오른손)
    const wand = new THREE.Group()
    wand.position.set(0, -0.15, 0.03)
    wand.rotation.x = 0.9
    wand.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), toon('#8d6e63'), 0, 0.1, 0))
    const st = mesh(star(0.06, 0.025), toon('#ffd54f', { emissive: '#ffb300', emissiveIntensity: 0.3 }), 0, 0.24, 0)
    wand.add(st)
    c.arms[1].add(wand)
  },

  // 우니: 금색 뿔이 달린 흰 유니콘 후드 + 무지개 갈기
  uni(c, p) {
    bangs(c.head, p.hair, [[-0.4, 0.5, 0.08], [0, 0.56, 0.085], [0.4, 0.5, 0.08]])
    const hood = mesh(hoodGeo(0.335), toon('#fbfbff', { side: THREE.DoubleSide }), HEAD_C.x, HEAD_C.y, HEAD_C.z)
    hood.rotation.x = 0.25
    c.head.add(hood)
    const horn = mesh(new THREE.ConeGeometry(0.05, 0.22, 16), toon('#ffcf40', { emissive: '#ff9f00', emissiveIntensity: 0.15 }))
    horn.rotation.x = Math.PI / 2
    surface(c.head, 0, 0.95, 0.12, horn)
    const mane = ['#ff9ad5', '#8ff0d0', '#c7a6ff', '#ffe08a']
    mane.forEach((col, i) => {
      const m = mesh(sphere(0.07 - i * 0.006), toon(col))
      surface(c.head, 0, 1.25 + i * 0.28, 0.06, m)
    })
    for (const s of [-1, 1]) {
      const ear = new THREE.Group()
      const outer = mesh(new THREE.ConeGeometry(0.055, 0.13, 12), toon('#fbfbff'))
      const inner = decal(new THREE.ConeGeometry(0.03, 0.08, 10), flat('#ffb3d9'), 0, -0.01, 0.025)
      ear.add(outer, inner)
      ear.rotation.x = Math.PI / 2
      surface(c.head, s * 0.75, 0.85, 0.04, ear)
    }
  },

  // 케피: 고양이 귀 후드 + 수염 + 꼬리
  kephi(c, p) {
    bangs(c.head, p.hair, [[-0.42, 0.5, 0.08], [0, 0.57, 0.085], [0.42, 0.5, 0.08]])
    const yellow = toon('#ffc93c', { side: THREE.DoubleSide })
    const hood = mesh(hoodGeo(0.335), yellow, HEAD_C.x, HEAD_C.y, HEAD_C.z)
    hood.rotation.x = 0.25
    c.head.add(hood)
    for (const s of [-1, 1]) {
      const ear = new THREE.Group()
      ear.add(mesh(new THREE.ConeGeometry(0.085, 0.16, 4), toon('#ffc93c')))
      ear.add(decal(new THREE.ConeGeometry(0.045, 0.09, 4), flat('#ff9e80'), 0, -0.02, 0.035))
      ear.rotation.x = Math.PI / 2
      surface(c.head, s * 0.62, 0.78, 0.05, ear)
      for (const k of [-1, 0, 1]) {
        const w = decal(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4), flat('#5d4037'))
        w.rotation.z = Math.PI / 2 + k * 0.18 * s
        w.position.x = s * 0.03
        surface(c.head, s * 0.72, -0.22 + k * 0.05, 0.005, w)
      }
    }
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.08, -0.15), new THREE.Vector3(0.05, 0.05, -0.3), new THREE.Vector3(0.14, 0.2, -0.36), new THREE.Vector3(0.12, 0.36, -0.3),
    ])
    const tail = new THREE.Group()
    tail.position.y = 0
    tail.add(mesh(new THREE.TubeGeometry(curve, 24, 0.035, 10), toon('#ffb300')))
    tail.add(mesh(sphere(0.045), toon('#ffb300'), 0.12, 0.36, -0.3))
    c.torso.add(tail)
    c.tail = tail
  },
}

export const CHARACTER_IDS = Object.keys(PALETTES)

export function buildCharacter(id: string): CharacterParts {
  const p = PALETTES[id] ?? PALETTES.dao
  const parts = buildBase(p)
  ;(BUILDERS[id] ?? BUILDERS.dao)(parts, p)
  addOutlines(parts.root, 0.011)
  return parts
}

/** 캐릭터 대표색 (UI 강조용) */
const EXTRA_COLORS: Record<string, string> = { ethi: '#ff9a3c', mos: '#c0392b', su: '#b0bec5', cloud: '#22305a' }

export function characterColor(id: string) {
  return PALETTES[id]?.outfit ?? EXTRA_COLORS[id] ?? '#90a4ae'
}
