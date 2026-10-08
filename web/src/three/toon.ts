import * as THREE from 'three'

// 3단계 명암 (카툰 셰이딩)
let gradient: THREE.DataTexture | null = null
function gradientMap() {
  if (!gradient) {
    const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255])
    gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
    gradient.minFilter = THREE.NearestFilter
    gradient.magFilter = THREE.NearestFilter
    gradient.needsUpdate = true
  }
  return gradient
}

export type ToonOpts = Omit<THREE.MeshToonMaterialParameters, 'color'>

export function toon(color: THREE.ColorRepresentation, opts: ToonOpts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts })
}

/** 그림자/명암 없이 항상 같은 색 (눈, 하이라이트 등) */
export function flat(color: THREE.ColorRepresentation, opts: THREE.MeshBasicMaterialParameters = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts })
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 장식용 메시: 그림자도 외곽선도 만들지 않는다 */
export function decal(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = mesh(geo, mat, x, y, z)
  m.castShadow = false
  m.userData.noOutline = true
  return m
}

const outlineMats = new Map<string, THREE.MeshBasicMaterial>()

/**
 * 뒤집힌 껍데기(inverted hull) 방식의 외곽선을 붙인다.
 * 각 메시마다 살짝 키운 뒷면 복제본을 자식으로 붙이며, 두께는 월드 단위로 일정하게 유지된다.
 */
export function addOutlines(root: THREE.Object3D, thickness = 0.012, color = '#2a1c14') {
  let mat = outlineMats.get(color)
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
    outlineMats.set(color, mat)
  }
  const targets: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && !m.userData.noOutline && !m.userData.isOutline) targets.push(m)
  })
  root.updateMatrixWorld(true)
  const ws = new THREE.Vector3()
  for (const m of targets) {
    const geo = m.geometry
    if (!geo.boundingSphere) geo.computeBoundingSphere()
    const bs = geo.boundingSphere!
    m.getWorldScale(ws)
    const s = Math.max(ws.x, ws.y, ws.z)
    const r = bs.radius * s
    if (r <= 0) continue
    const k = 1 + thickness / r
    const o = new THREE.Mesh(geo, mat)
    o.userData.isOutline = true
    o.scale.setScalar(k)
    // 지오메트리 중심을 기준으로 키운다
    o.position.copy(bs.center).multiplyScalar(1 - k)
    m.add(o)
  }
}
