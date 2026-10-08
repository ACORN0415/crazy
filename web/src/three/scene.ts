import * as THREE from 'three'
import type { SPlayer, Snapshot } from '../types'
import { ITEM_ICON, PLAYER_COLORS } from '../itemInfo'
import { MAP_H, MAP_W, THEMES } from '../render'
import { TileKit, createCharacter, createMount, type CharacterRig } from './models'
import { VIEW_ELEVATION, VIEW_STRETCH, cachedSpriteSet, createSpriteBoard, loadSpriteSet, setBoardFrame, teamOfSlot, type Dir } from './sprites'
import { SpriteTileKit, hiddenAt, loadMapTheme, type MapLayout, type MapThemeAssets } from './mapTheme'
import { loadFx, type FxAssets, type FxImage } from './fxAssets'
import { blobShadowTexture, floorTexture, iconTexture } from './textures'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const FACE_YAW: Record<string, number> = { down: 0, up: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 }
const JUMP_TIME = 0.35
const FLAME_TIME = 0.5
const ITEM_SCALE = 1
// 걷기 프레임 하나당 이동 거리(칸). 4프레임 한 바퀴 ≈ 한 칸
const STRIDE_PER_FRAME = 0.24

/** 셀 좌표(0..W) → 월드 좌표. 맵의 x → X, y → Z, 위쪽이 +Y. */
const wx = (x: number) => x - MAP_W / 2
const wz = (y: number) => y - MAP_H / 2

interface Anim {
  obj: THREE.Object3D
  t: number
  dur: number
  kind: 'vanish' | 'slide'
  from?: THREE.Vector3
  to?: THREE.Vector3
}

export class GameScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.OrthographicCamera
  private kit: { create(ch: string, cell: number): THREE.Object3D | null }
  private floorMesh!: THREE.Mesh
  private disposed = false
  private tiles = ''
  private cells: (THREE.Object3D | null)[] = new Array(MAP_W * MAP_H).fill(null)
  private anims: Anim[] = []
  private chars = new Map<string, CharacterRig>()
  private items = new Map<string, { obj: THREE.Group; type: string }>()
  private itemTex = new Map<string, THREE.Texture>()
  private bubbles: THREE.Group[] = []
  private flames: THREE.Mesh[] = []
  private shadowTex = blobShadowTexture()
  private bubbleGeo = new THREE.SphereGeometry(0.4, 32, 24)
  private bubbleMat = new THREE.MeshPhysicalMaterial({
    color: '#3a9cff', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
    transparent: true, opacity: 0.9, emissive: '#0b3d91', emissiveIntensity: 0.25,
  })
  // 톤매핑을 끄면 물줄기가 하얗게 날아가지 않고 선명한 파란색으로 보인다
  private flameMat = new THREE.MeshStandardMaterial({
    color: '#1e8bff', emissive: '#0a5cff', emissiveIntensity: 0.6, roughness: 0.15, transparent: true, opacity: 0.85, toneMapped: false,
  })
  private flameCore = new THREE.MeshBasicMaterial({ color: '#c9efff', transparent: true, opacity: 0.95, toneMapped: false })
  private flameGeo = {
    c: new THREE.SphereGeometry(0.46, 24, 16),
    h: new THREE.BoxGeometry(1.02, 0.42, 0.62),
    v: new THREE.BoxGeometry(0.62, 0.42, 1.02),
  }
  private coreGeo = {
    c: new THREE.SphereGeometry(0.26, 16, 12),
    h: new THREE.BoxGeometry(1.02, 0.2, 0.26),
    v: new THREE.BoxGeometry(0.26, 0.2, 1.02),
  }

  constructor(
    canvas: HTMLCanvasElement,
    themeId: string,
    private meId: string,
    private nickOf: (id: string) => string,
    low = false,
    private layout?: MapLayout,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low })
    this.renderer.setPixelRatio(low ? 0.75 : Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(canvas.width, canvas.height, false)
    this.renderer.shadowMap.enabled = !low
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    // 원근 없는 정사영 카메라: 원작처럼 맵이 반듯한 직사각형으로 보이고 캐릭터가 기울지 않는다
    const halfH = 6.45
    const halfW = halfH * (canvas.width / canvas.height)
    this.camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.5, 100)
    const dist = 30
    this.camera.position.set(0, Math.sin(VIEW_ELEVATION) * dist, Math.cos(VIEW_ELEVATION) * dist + 0.05)
    this.camera.lookAt(0, 0, 0.05)

    const th = THEMES[themeId] ?? THEMES.village
    this.scene.background = new THREE.Color(th.floorB).lerp(new THREE.Color('#87ceeb'), 0.6)
    this.scene.fog = new THREE.Fog(this.scene.background, 45, 90)

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#7a6a50', 1.4))
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2)
    sun.position.set(-6, 14, 8)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const sc = sun.shadow.camera
    sc.left = -10
    sc.right = 10
    sc.top = 10
    sc.bottom = -10
    sc.near = 1
    sc.far = 40
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.04
    this.scene.add(sun)

    this.buildGround(th)
    this.kit = new TileKit(themeId)
    // 원작 맵 그림이 있으면 불러와서 바꿔 끼운다 (없으면 3D 모델 그대로)
    void loadMapTheme(themeId).then((a) => {
      if (a && !this.disposed) this.applyTheme(a)
    })
    // 원작 물풍선/물줄기/아이템/탈것 그림
    void loadFx().then((fx) => {
      if (fx && !this.disposed) this.fx = fx
    })
  }

  private fx: FxAssets | null = null
  private boardGeo = (() => {
    const g = new THREE.PlaneGeometry(1, 1)
    g.translate(0, 0.5, 0)
    return g
  })()
  private flatGeo = new THREE.PlaneGeometry(1, 1)
  private fxMats = new Map<THREE.Texture, THREE.MeshBasicMaterial>()

  private fxMat(tex: THREE.Texture, opacity = 1) {
    let m = this.fxMats.get(tex)
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, toneMapped: false, depthWrite: opacity >= 1 })
      m.opacity = opacity
      this.fxMats.set(tex, m)
    }
    return m
  }

  /** 세워 놓는 그림 판 (발이 원점) */
  private fxBoard() {
    const m = new THREE.Mesh(this.boardGeo, this.fxMat(new THREE.Texture()))
    m.renderOrder = 2
    return m
  }

  private setFxBoard(m: THREE.Mesh, im: FxImage, opacity = 1) {
    m.material = this.fxMat(im.tex, opacity)
    m.scale.set(im.w, im.h * VIEW_STRETCH, 1)
  }

  private makeCell(ch: string, i: number) {
    if (ch === '#' && hiddenAt(this.layout, i)) return null
    return this.kit.create(ch, i)
  }

  private applyTheme(assets: MapThemeAssets) {
    const kit = new SpriteTileKit(assets, this.layout)
    this.kit = kit
    // 여러 칸짜리 장식 (트럭 등)
    for (const d of this.layout?.decor ?? []) {
      const obj = kit.createDecor(d.name, d.w, d.h)
      if (!obj) continue
      obj.position.set(wx(d.x), 0, wz(d.y))
      this.scene.add(obj)
    }
    const tex = kit.floorTexture()
    if (tex) {
      // 원작 색 그대로 보이도록 조명 영향 없는 재질로 바꾼다
      const old = this.floorMesh.material as THREE.MeshStandardMaterial
      old.map?.dispose()
      old.dispose()
      this.floorMesh.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
    }
    // 이미 깔린 칸을 원작 그림으로 다시 만든다
    for (let i = 0; i < this.cells.length; i++) {
      const prev = this.cells[i]
      if (prev) this.scene.remove(prev)
      const obj = this.tiles ? this.makeCell(this.tiles[i], i) : null
      this.cells[i] = obj
      if (obj) {
        obj.position.set(wx((i % MAP_W) + 0.5), 0, wz(Math.floor(i / MAP_W) + 0.5))
        this.scene.add(obj)
      }
    }
  }

  private buildGround(th: (typeof THEMES)[string]) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_W, MAP_H),
      new THREE.MeshStandardMaterial({ map: floorTexture(MAP_W, MAP_H, th.floorA, th.floorB), roughness: 0.95 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)
    this.floorMesh = floor

    // 바깥 땅
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(th.floorB).multiplyScalar(0.7), roughness: 1 }),
    )
    outer.rotation.x = -Math.PI / 2
    outer.position.y = -0.4
    outer.receiveShadow = true
    this.scene.add(outer)

    // 맵 테두리 (단상처럼 보이게)
    const edge = new THREE.MeshStandardMaterial({ color: th.wall, roughness: 0.7 })
    const top = new THREE.MeshStandardMaterial({ color: th.wallTop, roughness: 0.6 })
    const T = 0.35
    const H = 0.55
    const add = (w: number, d: number, x: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), [edge, edge, top, edge, edge, edge])
      b.position.set(x, H / 2 - 0.4, z)
      b.castShadow = true
      b.receiveShadow = true
      this.scene.add(b)
    }
    add(MAP_W + 2 * T, T, 0, -MAP_H / 2 - T / 2)
    add(MAP_W + 2 * T, T, 0, MAP_H / 2 + T / 2)
    add(T, MAP_H, -MAP_W / 2 - T / 2, 0)
    add(T, MAP_H, MAP_W / 2 + T / 2, 0)
    // 바닥 판 옆면
    const base = new THREE.Mesh(new THREE.BoxGeometry(MAP_W, 0.4, MAP_H), edge)
    base.position.y = -0.21
    this.scene.add(base)
  }

  /** 서버 타일 문자열을 반영한다. 바뀐 칸만 다시 만든다. */
  setTiles(tiles: string) {
    if (tiles === this.tiles) return
    const old = this.tiles
    this.tiles = tiles
    const removedPush: number[] = []
    const addedPush: number[] = []
    for (let i = 0; i < tiles.length; i++) {
      const before = old[i] ?? ''
      const after = tiles[i]
      if (before === after) continue
      if (before === 'o' && after === '.') removedPush.push(i)
      if (after === 'o' && before === '.') addedPush.push(i)
    }
    // 밀린 블록은 사라졌다 생기는 대신 미끄러지게 한다
    const slid = new Set<number>()
    for (const to of addedPush) {
      const from = removedPush.find((f) => !slid.has(f) && Math.abs((f % MAP_W) - (to % MAP_W)) + Math.abs(Math.floor(f / MAP_W) - Math.floor(to / MAP_W)) === 1)
      if (from === undefined) continue
      slid.add(from)
      slid.add(to)
      const obj = this.cells[from]!
      this.cells[from] = null
      this.cells[to] = obj
      const target = new THREE.Vector3(wx((to % MAP_W) + 0.5), 0, wz(Math.floor(to / MAP_W) + 0.5))
      this.anims.push({ obj, t: 0, dur: 0.18, kind: 'slide', from: obj.position.clone(), to: target })
    }
    for (let i = 0; i < tiles.length; i++) {
      if (slid.has(i) || old[i] === tiles[i]) continue
      const prev = this.cells[i]
      if (prev) {
        if (old) this.anims.push({ obj: prev, t: 0, dur: 0.25, kind: 'vanish' })
        else this.scene.remove(prev)
      }
      const obj = this.makeCell(tiles[i], i)
      this.cells[i] = obj
      if (obj) {
        obj.position.set(wx((i % MAP_W) + 0.5), 0, wz(Math.floor(i / MAP_W) + 0.5))
        this.scene.add(obj)
      }
    }
  }

  render(prev: Snapshot | null, cur: Snapshot | null, a: number, t: number, dt: number) {
    if (cur) {
      this.setTiles(cur.tiles)
      const p = prev ?? cur
      this.updateItems(cur, t)
      this.updateBubbles(p, cur, a, t)
      this.updateFlames(cur, t)
      this.updatePlayers(p, cur, a, t, dt)
    }
    this.updateAnims(dt)
    this.renderer.render(this.scene, this.camera)
  }

  private cellChar(x: number, y: number) {
    return this.tiles[Math.floor(y) * MAP_W + Math.floor(x)]
  }

  private updateAnims(dt: number) {
    this.anims = this.anims.filter((an) => {
      an.t += dt
      const k = Math.min(1, an.t / an.dur)
      if (an.kind === 'slide') {
        an.obj.position.lerpVectors(an.from!, an.to!, k)
      } else {
        an.obj.scale.setScalar(Math.max(0.001, 1 - k))
        an.obj.position.y = k * 0.4
        an.obj.rotation.y = k * 1.5
        if (k >= 1) this.scene.remove(an.obj)
      }
      return k < 1
    })
  }

  private updateItems(s: Snapshot, t: number) {
    const seen = new Set<string>()
    for (const it of s.items) {
      const key = `${it.x},${it.y}`
      seen.add(key)
      let entry = this.items.get(key)
      if (entry && entry.type !== it.type) {
        this.scene.remove(entry.obj)
        entry = undefined
      }
      const art = this.fx?.items[it.type]
      if (entry && !!entry.obj.userData.art !== !!art) {
        this.scene.remove(entry.obj)
        entry = undefined
      }
      if (!entry && art) {
        // 원작 아이템 그림: 바닥 위에서 둥실둥실
        const g = new THREE.Group()
        const b = this.fxBoard()
        this.setFxBoard(b, art)
        // 원작 화면처럼 칸보다 작게 (한 칸의 약 80%)
        b.scale.multiplyScalar(ITEM_SCALE)
        b.position.z = 0.3
        g.add(b)
        g.add(this.blobShadow(0.6))
        g.userData.art = true
        g.position.set(wx(it.x + 0.5), 0, wz(it.y + 0.5))
        this.scene.add(g)
        entry = { obj: g, type: it.type }
        this.items.set(key, entry)
      }
      if (!entry) {
        const g = new THREE.Group()
        let tex = this.itemTex.get(it.type)
        if (!tex) {
          const info = ITEM_ICON[it.type] ?? { icon: '?', bg: '#999' }
          tex = iconTexture(info.icon, info.bg, it.type === 'ultra' ? 'MAX' : undefined)
          this.itemTex.set(it.type, tex)
        }
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }))
        sprite.scale.setScalar(0.7)
        g.add(sprite)
        g.add(this.blobShadow(0.55))
        g.position.set(wx(it.x + 0.5), 0, wz(it.y + 0.5))
        this.scene.add(g)
        entry = { obj: g, type: it.type }
        this.items.set(key, entry)
      }
      const sprite = entry.obj.children[0]
      if (entry.obj.userData.art) sprite.position.y = 0.06 + (Math.sin(t * 5 + it.x * 1.3 + it.y) + 1) * 0.05
      else sprite.position.y = 0.45 + Math.sin(t * 4 + it.x * 1.3 + it.y) * 0.06
    }
    for (const [key, entry] of this.items) {
      if (!seen.has(key)) {
        this.scene.remove(entry.obj)
        this.items.delete(key)
      }
    }
  }

  private blobShadow(size: number) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }),
    )
    m.rotation.x = -Math.PI / 2
    m.position.y = 0.01
    return m
  }

  private spriteBubbles: THREE.Mesh[] = []

  private updateBubbles(p: Snapshot, s: Snapshot, a: number, t: number) {
    const frames = this.fx?.bubble
    if (frames?.length) {
      this.bubbles.forEach((g) => (g.visible = false))
      while (this.spriteBubbles.length < s.bubbles.length) {
        const m = this.fxBoard()
        this.scene.add(m)
        this.spriteBubbles.push(m)
      }
      // 원작처럼 말랑말랑 흔들린다 (0-1-2-1), 터지기 직전엔 빨라진다
      const seq = [0, 1, 2, 1]
      this.spriteBubbles.forEach((m, i) => {
        const b = s.bubbles[i]
        m.visible = !!b
        if (!b) return
        const pb = p.bubbles.find((q) => q.id === b.id) ?? b
        const x = lerp(pb.x, b.x, a)
        const y = lerp(pb.y, b.y, a)
        if (this.cellChar(b.x + 0.5, b.y + 0.5) === '~' && b.owner !== this.meId) m.visible = false
        const fps = b.fuse < 1 ? 12 : 5
        this.setFxBoard(m, frames[seq[Math.floor(t * fps + b.id) % seq.length] % frames.length])
        m.position.set(wx(x + 0.5), 0, wz(y + 0.5) + 0.42)
      })
      return
    }
    while (this.bubbles.length < s.bubbles.length) {
      const g = new THREE.Group()
      const ball = new THREE.Mesh(this.bubbleGeo, this.bubbleMat)
      ball.castShadow = true
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
      glint.position.set(-0.15, 0.17, 0.27)
      glint.scale.set(1.3, 0.8, 0.5)
      ball.add(glint)
      g.add(ball)
      this.scene.add(g)
      this.bubbles.push(g)
    }
    this.bubbles.forEach((g, i) => {
      const b = s.bubbles[i]
      if (!b) {
        g.visible = false
        return
      }
      const pb = p.bubbles.find((q) => q.id === b.id) ?? b
      const x = lerp(pb.x, b.x, a)
      const y = lerp(pb.y, b.y, a)
      // 풀숲 속 상대 물풍선은 보이지 않는다
      g.visible = !(this.cellChar(b.x + 0.5, b.y + 0.5) === '~' && b.owner !== this.meId)
      const speed = b.fuse < 1 ? 18 : 7
      const pulse = 1 + Math.sin(t * speed + b.id) * 0.05
      g.position.set(wx(x + 0.5), 0.42, wz(y + 0.5))
      g.scale.set(pulse, 2 - pulse, pulse)
      g.rotation.y = Math.sin(t * 2 + b.id) * 0.3
    })
  }

  private spriteFlames: THREE.Mesh[] = []

  private updateFlames(s: Snapshot, t: number) {
    const fl = this.fx?.flame
    if (fl?.center?.length) {
      this.flames.forEach((m) => (m.visible = false))
      while (this.spriteFlames.length < s.flames.length) {
        const m = new THREE.Mesh(this.flatGeo, this.fxMat(new THREE.Texture()))
        m.rotation.x = -Math.PI / 2
        m.renderOrder = 1
        this.scene.add(m)
        this.spriteFlames.push(m)
      }
      const name: Record<string, string> = { u: 'up_mid', d: 'down_mid', l: 'left_mid', r: 'right_mid', U: 'up_end', D: 'down_end', L: 'left_end', R: 'right_end' }
      this.spriteFlames.forEach((m, i) => {
        const f = s.flames[i]
        m.visible = !!f
        if (!f) return
        const list = f.k === 'c' ? fl.center : fl[name[f.k]] ?? fl.center
        // 물줄기는 0.5초 동안 원작 프레임 순서대로 퍼졌다가 사라진다
        const k = Math.min(list.length - 1, Math.floor((f.a / FLAME_TIME) * list.length))
        const im = list[Math.max(0, k)]
        m.material = this.fxMat(im.tex)
        m.position.set(wx(f.x + 0.5), 0.02, wz(f.y + 0.5))
      })
      return
    }
    while (this.flames.length < s.flames.length) {
      const m = new THREE.Mesh(this.flameGeo.c, this.flameMat)
      const core = new THREE.Mesh(this.coreGeo.c, this.flameCore)
      m.add(core)
      this.scene.add(m)
      this.flames.push(m)
    }
    this.flames.forEach((m, i) => {
      const f = s.flames[i]
      m.visible = !!f
      if (!f) return
      const core = m.children[0] as THREE.Mesh
      const k3 = f.k === 'c' ? 'c' : 'lrLR'.includes(f.k) ? 'h' : 'v'
      m.geometry = this.flameGeo[k3]
      core.geometry = this.coreGeo[k3]
      const wob = 1 + Math.sin(t * 28 + f.x * 2 + f.y) * 0.08
      m.position.set(wx(f.x + 0.5), 0.3, wz(f.y + 0.5))
      if (k3 === 'h') m.scale.set(1, wob, wob)
      else if (k3 === 'v') m.scale.set(wob, wob, 1)
      else m.scale.set(wob, wob * 0.8, wob)
    })
  }

  private updatePlayers(p: Snapshot, s: Snapshot, a: number, t: number, dt: number) {
    for (const pl of s.players) {
      let rig = this.chars.get(pl.id)
      if (!rig) {
        rig = createCharacter(pl.character, this.nickOf(pl.id), pl.id === this.meId, PLAYER_COLORS[pl.slot] ?? '#888')
        rig.team = teamOfSlot(pl.slot)
        rig.shadow = this.blobShadow(0.7)
        rig.root.add(rig.shadow)
        this.scene.add(rig.root)
        this.chars.set(pl.id, rig)
      }
      this.attachSprite(rig)
      const pp = p.players.find((q) => q.id === pl.id) ?? pl
      this.poseCharacter(rig, pl, lerp(pp.x, pl.x, a), lerp(pp.y, pl.y, a), t, dt)
    }
    // 풀숲에 숨은 내 캐릭터 위치의 풀숲은 반투명하게
    const me = s.players.find((q) => q.id === this.meId)
    const myCell = me && me.state !== 'dead' ? Math.floor(me.y) * MAP_W + Math.floor(me.x) : -1
    this.cells.forEach((obj, i) => {
      const mats = obj?.userData.materials as THREE.MeshStandardMaterial[] | undefined
      if (!mats) return
      const target = i === myCell ? 0.45 : 1
      for (const m of mats) m.opacity = lerp(m.opacity, target, 0.2)
    })
  }

  /** 원작 그림이 준비되면 3D 모델을 숨기고 그림 판으로 바꾼다 */
  private attachSprite(rig: CharacterRig) {
    if (rig.board) return
    const set = cachedSpriteSet(rig.characterId, rig.team)
    if (set === undefined) {
      void loadSpriteSet(rig.characterId, rig.team)
      return
    }
    if (!set) return
    rig.board = createSpriteBoard(set)
    // 원작 그림에 그림자가 그려져 있으면 바닥 그림자는 숨긴다
    if (rig.shadow) rig.shadow.visible = set.needsShadow
    // 그림이 3D 모델보다 커서 이름표/저주 표시를 위로 올린다
    rig.nameTag.position.y = 2.05
    // 몸(body)은 카메라 쪽으로 젖혀져 있으므로 그림 판은 root에 똑바로 세운다
    rig.root.add(rig.board)
    rig.facing.visible = false
  }

  private poseSprite(rig: CharacterRig, pl: SPlayer, lift: number, t: number) {
    const board = rig.board!
    const set = cachedSpriteSet(rig.characterId, rig.team)!
    const trapped = pl.state === 'trapped'
    const dir = (pl.face as Dir) ?? 'down'
    // 실제로 움직인 거리만큼 발을 내딛는다: 빠르면 빨리, 멈추면 바로 선 자세
    const p = rig.root.position
    const moved = Math.hypot(p.x - rig.lastX, p.z - rig.lastZ)
    rig.lastX = p.x
    rig.lastZ = p.z
    const walking = !trapped && moved > 0.0005
    if (walking) {
      rig.stride += moved
      rig.idleFor = 0
    } else {
      rig.idleFor += 1
    }
    // 프레임 사이 한두 번 멈춰도 자세가 튀지 않게 잠깐은 걷는 중으로 본다
    const showWalk = walking || (pl.moving && rig.idleFor < 4)
    let frames = set.dirs[dir] ?? set.dirs.down
    let frame = 0
    if (trapped && set.trapped) {
      frames = set.trapped
      frame = Math.floor(t * set.fps)
    } else if (showWalk) {
      frames = set.walk[dir] ?? frames
      frame = Math.floor(rig.stride / STRIDE_PER_FRAME)
    } else {
      rig.stride = 0
    }
    setBoardFrame(board, frames, frame)
    board.position.y = lift
  }

  private poseCharacter(rig: CharacterRig, pl: SPlayer, x: number, y: number, t: number, dt: number) {
    const hiddenInBush = pl.id !== this.meId && this.cellChar(x, y) === '~'
    const blink = pl.invuln && Math.floor(t * 12) % 2 === 0
    rig.root.visible = pl.state !== 'dead' && !hiddenInBush && !blink
    if (!rig.root.visible) return

    rig.root.position.set(wx(x), 0, wz(y))

    // 탈것 교체
    const mount = pl.mount ?? ''
    let seat = 0
    if (mount !== rig.mountType) {
      rig.mountSlot.clear()
      rig.mountType = mount
      rig.seat = 0
      if (mount) {
        const m = createMount(mount)
        rig.mountSlot.add(m.model)
        rig.seat = m.seat
      }
    }
    // 원작 탈것 그림이 있으면 3D 탈것 대신 그림 판 (캐릭터 그림일 때만)
    const mountArt = rig.board && mount ? this.fx?.mounts[mount] : undefined
    rig.mountSlot.visible = !mountArt
    if (mountArt) {
      if (!rig.mountBoard) {
        rig.mountBoard = this.fxBoard()
        rig.root.add(rig.mountBoard)
      }
      const frames = mountArt[pl.face] ?? mountArt.down
      const im = frames[pl.moving ? Math.floor(t * 8) % frames.length : 0]
      this.setFxBoard(rig.mountBoard, im)
      rig.mountBoard.visible = true
      // 탈것은 캐릭터 뒤에 그리고, 캐릭터를 탈것 위로 올린다 (원작처럼 올라탄 모습)
      rig.mountBoard.position.set(0, mount === 'ufo' ? 0.08 + Math.sin(t * 3) * 0.04 : 0, -0.06)
      seat = mount === 'ufo' ? 0.3 : mount === 'owl' ? 0.32 : 0.22
    } else if (rig.mountBoard) {
      rig.mountBoard.visible = false
    }
    if (mount && !mountArt) {
      seat = rig.seat
      rig.mountSlot.rotation.y = rig.yaw
      const hover = mount === 'ufo' ? 0.12 + Math.sin(t * 3) * 0.05 : 0
      rig.mountSlot.position.y = hover
      seat += hover
    }

    // 방향 (부드럽게 회전)
    const target = FACE_YAW[pl.face] ?? 0
    let diff = target - rig.yaw
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    rig.yaw += diff * Math.min(1, dt * 18)
    rig.facing.rotation.y = rig.yaw

    // 걷기 / 숨쉬기 / 점프 / 갇힘
    const trapped = pl.state === 'trapped'
    const walk = pl.moving && !trapped && !mount
    const ph = t * 13
    const swing = walk ? Math.sin(ph) : 0
    rig.legs[0].rotation.x = swing * 0.7
    rig.legs[1].rotation.x = -swing * 0.7
    if (trapped) {
      // 물방울 속에서 허우적거림
      const flap = Math.sin(t * 10) * 0.35
      rig.arms[0].rotation.set(0, 0, -2.4 + flap)
      rig.arms[1].rotation.set(0, 0, 2.4 - flap)
    } else {
      rig.arms[0].rotation.set(-swing * 0.6, 0, -0.38)
      rig.arms[1].rotation.set(swing * 0.6, 0, 0.38)
    }
    const breathe = 1 + Math.sin(t * 2.6) * 0.018
    rig.torso.scale.set(1, breathe, 1)
    rig.head.rotation.z = walk ? Math.sin(ph) * 0.06 : Math.sin(t * 1.3) * 0.03
    rig.head.position.y = 0.43 + (breathe - 1) * 0.6
    if (rig.tail) rig.tail.rotation.y = Math.sin(t * (walk ? 9 : 3)) * 0.35

    // 눈 깜빡임
    rig.blinkAt -= dt
    let eyeY = 1
    if (rig.blinkAt < 0) {
      eyeY = 0.12
      if (rig.blinkAt < -0.12) rig.blinkAt = 2 + Math.random() * 3
    }
    if (trapped) eyeY = 0.55 + Math.sin(t * 8) * 0.1
    for (const e of rig.eyes) e.scale.y = eyeY

    let lift = seat + (walk && !rig.board ? Math.abs(Math.sin(ph)) * 0.05 : 0)
    if (pl.jump) lift += Math.sin((1 - pl.jump / JUMP_TIME) * Math.PI) * 0.9
    if (trapped) lift += 0.12 + Math.sin(t * 3) * 0.06
    rig.body.position.y = lift
    if (rig.board) this.poseSprite(rig, pl, lift, t)
    // 걸을 때 살짝 앞으로 숙인다
    rig.facing.rotation.x = walk ? 0.1 : 0
    rig.facing.rotation.z = trapped ? Math.sin(t * 5) * 0.12 : 0

    // 원작 갇힘 물방울 그림 (캐릭터 그림 위에 반투명으로 덮는다)
    const trapArt = rig.board ? this.fx?.trap : undefined
    rig.trapBubble.visible = trapped && !trapArt?.length
    if (trapped && trapArt?.length) {
      if (!rig.trapBoard) {
        rig.trapBoard = this.fxBoard()
        rig.root.add(rig.trapBoard)
      }
      // 처음엔 커지는 프레임, 그다음 마지막 두 프레임을 오간다
      const n = trapArt.length
      const k = Math.floor(t * 6)
      const im = trapArt[n <= 2 ? k % n : n - 2 + (k % 2)]
      this.setFxBoard(rig.trapBoard, im, 0.8)
      rig.trapBoard.visible = true
      rig.trapBoard.position.set(0, lift - 0.05, 0.05)
    } else if (rig.trapBoard) {
      rig.trapBoard.visible = false
    }
    if (trapped && !trapArt?.length) {
      const k = 1 + Math.sin(t * 6) * 0.03
      rig.trapBubble.scale.set(k, 2 - k, k)
    }
    rig.shield.visible = !!pl.shield
    if (pl.shield) {
      rig.shield.rotation.x = Math.PI / 2 + Math.sin(t * 3) * 0.3
      rig.shield.rotation.z = t * 3
    }
    rig.curse.visible = !!pl.curse
    if (pl.curse) rig.curse.position.y = (rig.board ? 1.8 : 1.3) + Math.sin(t * 5) * 0.05
  }

  dispose() {
    this.disposed = true
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
    })
    this.itemTex.forEach((tx) => tx.dispose())
    this.renderer.dispose()
  }
}
