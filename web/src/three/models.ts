import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { THEMES } from '../render'
import { crateTexture, emojiTexture, nameTexture } from './textures'
import { addOutlines, mesh, toon } from './toon'
import { buildCharacter, type CharacterParts } from './characters'

// 기존 호출부의 PBR 옵션(metalness/roughness)은 카툰 재질에서는 무시한다
type MatOpts = THREE.MeshStandardMaterialParameters
const std = (color: THREE.ColorRepresentation, extra: MatOpts = {}) => {
  const rest: MatOpts = { ...extra }
  delete rest.metalness
  delete rest.roughness
  return toon(color, rest as THREE.MeshToonMaterialParameters)
}

// ---------------------------------------------------------------- 맵 타일

/** 테마별로 한 번 만들어 두고 셀마다 clone() 해서 쓰는 타일 모델들 */
export class TileKit {
  private wall: THREE.Object3D
  private block: THREE.Object3D
  private push: THREE.Object3D
  private bushGeo = new THREE.IcosahedronGeometry(0.3, 1)
  private bushColors: [string, string]

  constructor(themeId: string) {
    const th = THEMES[themeId] ?? THEMES.village

    // 부서지지 않는 벽: 테마마다 모양이 다르다
    const wall = new THREE.Group()
    if (themeId === 'village') {
      // 지붕이 있는 작은 집
      wall.add(mesh(new RoundedBoxGeometry(0.9, 0.62, 0.9, 2, 0.05), std('#fff3dc'), 0, 0.31, 0))
      const roof = mesh(new THREE.ConeGeometry(0.72, 0.5, 4), std(th.wall, { flatShading: true }), 0, 0.87, 0)
      roof.rotation.y = Math.PI / 4
      wall.add(roof)
      wall.add(mesh(new THREE.BoxGeometry(0.2, 0.3, 0.04), std('#7a4b2a'), 0, 0.15, 0.452))
      wall.add(mesh(new THREE.BoxGeometry(0.16, 0.14, 0.04), std('#9fd8ff', { roughness: 0.2 }), 0.25, 0.38, 0.452))
    } else if (themeId === 'pirate') {
      // 술통 기둥
      const barrel = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.95, 16), std(th.wallTop), 0, 0.475, 0)
      wall.add(barrel)
      for (const y of [0.18, 0.77]) {
        wall.add(mesh(new THREE.TorusGeometry(0.405, 0.035, 8, 24), std('#3b2a20', { metalness: 0.4 }), 0, y, 0))
      }
      wall.children.slice(-2).forEach((r) => (r.rotation.x = Math.PI / 2))
      wall.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 16), std(th.wall), 0, 0.96, 0))
    } else {
      // 공장: 금속 블록 + 경고 줄무늬
      wall.add(mesh(new RoundedBoxGeometry(0.96, 1.0, 0.96, 2, 0.04), std(th.wallTop, { metalness: 0.15, roughness: 0.5 }), 0, 0.5, 0))
      wall.add(mesh(new THREE.BoxGeometry(0.98, 0.1, 0.98), std('#f2c200', { metalness: 0.2 }), 0, 0.82, 0))
      wall.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), std(th.wallTop, { metalness: 0.7, roughness: 0.3 }), 0, 1.03, 0))
    }
    this.wall = wall

    const crate = (base: string, light: string, kind: 'x' | 'o') => {
      const g = new THREE.Group()
      const tex = crateTexture(base, light, kind)
      g.add(mesh(new RoundedBoxGeometry(0.88, 0.84, 0.88, 2, 0.06), std('#ffffff', { map: tex, roughness: 0.85 }), 0, 0.42, 0))
      return g
    }
    this.block = crate(th.block, th.blockTop, 'x')
    this.push = crate(th.push, th.pushTop, 'o')
    for (const o of [this.wall, this.block, this.push]) addOutlines(o, 0.014, '#3a2a20')
    this.bushColors = [th.bush, th.bushDark]
  }

  create(ch: string): THREE.Object3D | null {
    switch (ch) {
      case '#':
        return this.wall.clone()
      case 'x':
        return this.block.clone()
      case 'o':
        return this.push.clone()
      case '~':
        return this.bush()
    }
    return null
  }

  /** 풀숲은 셀마다 재질을 따로 둔다 (내 캐릭터가 들어가면 그 풀숲만 반투명하게). */
  private bush() {
    const g = new THREE.Group()
    const light = std(this.bushColors[0], { flatShading: true, transparent: true })
    const dark = std(this.bushColors[1], { flatShading: true, transparent: true })
    const parts: [number, number, number, number, THREE.Material][] = [
      [-0.2, 0.25, 0.15, 1.0, dark],
      [0.22, 0.25, 0.12, 1.0, dark],
      [0, 0.28, -0.18, 1.05, dark],
      [-0.12, 0.52, 0, 0.95, light],
      [0.16, 0.5, -0.05, 0.9, light],
      [0.02, 0.72, 0.02, 0.75, light],
    ]
    for (const [x, y, z, s, m] of parts) {
      const b = mesh(this.bushGeo, m, x, y, z)
      b.scale.setScalar(s)
      g.add(b)
    }
    g.userData.materials = [light, dark]
    return g
  }
}

// ---------------------------------------------------------------- 캐릭터

export interface CharacterRig extends CharacterParts {
  root: THREE.Group // 맵 위치
  mountSlot: THREE.Group
  body: THREE.Group // 탈것 위 높이 / 점프 / 둥둥 (카메라 쪽으로 젖힘)
  facing: THREE.Group // 바라보는 방향으로 회전
  trapBubble: THREE.Mesh
  shield: THREE.Mesh
  curse: THREE.Sprite
  nameTag: THREE.Sprite
  mountType: string
  seat: number
  yaw: number
  blinkAt: number
  characterId: string
  team: 'red' | 'blue'
  shadow?: THREE.Object3D
  board?: THREE.Mesh // 원작 그림 스프라이트 (있으면 3D 모델 대신 사용)
  mountBoard?: THREE.Mesh
  trapBoard?: THREE.Mesh
  lastX: number
  lastZ: number
  stride: number // 걸은 거리 누적 (걷기 프레임 선택용)
  idleFor: number
}

// 원작처럼 캐릭터가 타일보다 살짝 크게 보이도록
const CHAR_SCALE = 1.3
// 위에서 내려다보는 카메라에서도 얼굴이 보이도록 몸을 카메라 쪽으로 젖힌다
const CAMERA_LEAN = -0.45

export function createCharacter(characterId: string, nick: string, isMe: boolean, teamColor: string): CharacterRig {
  const root = new THREE.Group()
  const mountSlot = new THREE.Group()
  const body = new THREE.Group()
  const facing = new THREE.Group()
  root.add(mountSlot, body)
  body.add(facing)
  body.rotation.x = CAMERA_LEAN
  facing.rotation.order = 'YXZ' // 숙이기(X)는 바라보는 방향 기준

  const parts = buildCharacter(characterId)
  parts.root.scale.setScalar(CHAR_SCALE)
  facing.add(parts.root)

  // 팀 구분용 발밑 고리
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.42, 40),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.85, depthWrite: false }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.015
  root.add(ring)

  // 물방울 (갇힘)
  const trapBubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.66, 32, 24),
    new THREE.MeshPhysicalMaterial({
      color: '#8fd3ff', transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false,
    }),
  )
  trapBubble.position.y = 0.62
  trapBubble.visible = false
  body.add(trapBubble)

  // 방패
  const shield = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.035, 10, 40),
    new THREE.MeshStandardMaterial({ color: '#ffd740', emissive: '#ffb300', emissiveIntensity: 0.8 }),
  )
  shield.position.y = 0.55
  shield.visible = false
  body.add(shield)

  const curse = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('👿'), depthTest: false }))
  curse.scale.setScalar(0.32)
  curse.position.set(0.38, 1.3, 0)
  curse.visible = false
  curse.renderOrder = 10
  body.add(curse)

  const { tex, aspect } = nameTexture(nick, isMe, teamColor)
  const nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
  nameTag.scale.set(0.22 * aspect, 0.22, 1)
  nameTag.position.y = 1.55
  nameTag.renderOrder = 11
  body.add(nameTag)

  return {
    ...parts, root, mountSlot, body, facing, trapBubble, shield, curse, nameTag,
    mountType: '', seat: 0, yaw: 0, blinkAt: 1 + Math.random() * 3, characterId, team: 'red', lastX: 0, lastZ: 0, stride: 0, idleFor: 0,
  }
}

// ---------------------------------------------------------------- 탈것

/** 탈것 모델과 그 위에 캐릭터가 앉는 높이 */
export function createMount(type: string): { model: THREE.Group; seat: number } {
  const g = new THREE.Group()
  const black = std('#1b1b1b', { roughness: 0.3 })
  const white = std('#ffffff')

  if (type === 'turtle' || type === 'pirate_turtle') {
    const pirate = type === 'pirate_turtle'
    const shellMat = std(pirate ? '#37474f' : '#4caf50', { flatShading: true, roughness: 0.5 })
    const skin = std(pirate ? '#8bc34a' : '#c5e1a5')
    const shell = mesh(new THREE.SphereGeometry(0.38, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), shellMat, 0, 0.1, -0.02)
    shell.scale.set(1, 0.75, 1.15)
    const rim = mesh(new THREE.CylinderGeometry(0.39, 0.37, 0.08, 20), std(pirate ? '#263238' : '#33691e'), 0, 0.1, -0.02)
    rim.scale.z = 1.15
    const head = mesh(new THREE.SphereGeometry(0.14, 16, 12), skin, 0, 0.2, 0.45)
    const eyes = [-0.06, 0.06].map((x) => mesh(new THREE.SphereGeometry(0.025, 8, 6), black, x, 0.25, 0.57))
    const legs = [[-0.27, 0.27], [0.27, 0.27], [-0.27, -0.3], [0.27, -0.3]].map(([x, z]) => {
      const l = mesh(new THREE.SphereGeometry(0.09, 10, 8), skin, x, 0.06, z)
      l.scale.set(1, 0.6, 1.2)
      return l
    })
    g.add(shell, rim, head, ...eyes, ...legs)
    if (pirate) {
      const band = mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 20), std('#e53935'), 0, 0.27, 0.45)
      band.rotation.x = Math.PI / 2 - 0.3
      g.add(band)
    }
    addOutlines(g, 0.012)
    return { model: g, seat: 0.32 }
  }

  if (type === 'owl') {
    const brown = std('#8d6e63', { roughness: 0.8 })
    const bodyM = mesh(new THREE.SphereGeometry(0.34, 20, 16), brown, 0, 0.3, 0)
    bodyM.scale.set(1, 0.85, 0.95)
    const belly = mesh(new THREE.SphereGeometry(0.24, 16, 12), std('#d7ccc8'), 0, 0.26, 0.15)
    belly.scale.set(1, 1, 0.6)
    const eyes = [-0.13, 0.13].flatMap((x) => [
      mesh(new THREE.SphereGeometry(0.1, 14, 10), white, x, 0.42, 0.26),
      mesh(new THREE.SphereGeometry(0.05, 10, 8), black, x, 0.42, 0.34),
    ])
    const beak = mesh(new THREE.ConeGeometry(0.05, 0.12, 8), std('#ffb300'), 0, 0.33, 0.34)
    beak.rotation.x = Math.PI / 2 + 0.6
    const wings = [-1, 1].map((s) => {
      const w = mesh(new THREE.SphereGeometry(0.2, 12, 10), std('#6d4c41'), s * 0.32, 0.3, -0.02)
      w.scale.set(0.35, 0.9, 0.8)
      return w
    })
    g.add(bodyM, belly, ...eyes, beak, ...wings)
    addOutlines(g, 0.012)
    return { model: g, seat: 0.5 }
  }

  // UFO
  const metal = std('#cfd8dc', { metalness: 0.3, roughness: 0.3 })
  const disc = mesh(new THREE.CylinderGeometry(0.48, 0.3, 0.14, 32), metal, 0, 0.22, 0)
  const under = mesh(new THREE.SphereGeometry(0.3, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std('#90a4ae', { metalness: 0.3, roughness: 0.35 }), 0, 0.16, 0)
  const lights = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2
    const l = mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffeb3b' : '#00e5ff' }), Math.cos(a) * 0.42, 0.22, Math.sin(a) * 0.42)
    l.castShadow = false
    return l
  })
  g.add(disc, under, ...lights)
  addOutlines(g, 0.012)
  return { model: g, seat: 0.3 }
}
