import * as THREE from 'three'
import { useEffect, useState } from 'react'
import { buildCharacter } from './characters'
import { loadSpriteSet, type Team } from './sprites'

// 캐릭터 선택창/HUD용 초상화. WebGL 컨텍스트 하나로 한 번씩 그려서 이미지로 캐시한다.
const SIZE = 256
let renderer: THREE.WebGLRenderer | null = null
const cache = new Map<string, string>()

function render(id: string): string {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(SIZE, SIZE, false)
    renderer.setPixelRatio(1)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
  }
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#b0a090', 1.6))
  const key = new THREE.DirectionalLight('#fff6e8', 2.2)
  key.position.set(1.5, 2.5, 3)
  scene.add(key)
  const rim = new THREE.DirectionalLight('#bfe3ff', 1.2)
  rim.position.set(-2, 1.5, -2)
  scene.add(rim)

  const parts = buildCharacter(id)
  parts.root.rotation.y = -0.45
  parts.arms[0].rotation.z = -0.55
  parts.arms[1].rotation.z = 0.7
  scene.add(parts.root)

  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
  cam.position.set(0, 0.75, 2.45)
  cam.lookAt(0, 0.52, 0)
  renderer.render(scene, cam)
  const url = renderer.domElement.toDataURL('image/png')

  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.geometry.dispose()
  })
  return url
}

export function getPortrait(id: string): string {
  let url = cache.get(id)
  if (!url) {
    url = render(id)
    cache.set(id, url)
  }
  return url
}

/** 원작 그림이 있으면 그것을, 없으면 3D 모델을 그린 이미지를 쓴다 */
export function usePortrait(id: string | undefined, team: Team = 'red'): string | undefined {
  const ck = id ? `${id}:${team}` : ''
  const [url, setUrl] = useState(() => (id ? cache.get(ck) : undefined))
  useEffect(() => {
    if (!id) return
    const hit = cache.get(ck)
    if (hit) {
      setUrl(hit)
      return
    }
    let alive = true
    void loadSpriteSet(id, team).then((set) => {
      if (!alive) return
      // 첫 렌더를 막지 않도록 다음 프레임에 그린다
      requestAnimationFrame(() => {
        if (!alive) return
        const u = set ? set.portraitUrl : getPortrait(id)
        cache.set(ck, u)
        setUrl(u)
      })
    })
    return () => {
      alive = false
    }
  }, [id, team, ck])
  return id ? url : undefined
}
