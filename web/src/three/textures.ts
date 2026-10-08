import * as THREE from 'three'

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

function toTexture(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 둥근 사각형 배경 + 이모지 아이콘 (아이템 스프라이트용) */
export function iconTexture(icon: string, bg: string, label?: string) {
  const S = 128
  const [c, ctx] = canvas(S, S)
  const g = ctx.createLinearGradient(0, 0, 0, S)
  g.addColorStop(0, '#ffffff55')
  g.addColorStop(1, '#00000033')
  ctx.fillStyle = bg
  roundRect(ctx, 6, 6, S - 12, S - 12, 28)
  ctx.fill()
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.font = `76px ${EMOJI_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icon, S / 2, S / 2 + 4)
  if (label) {
    ctx.font = 'bold 26px sans-serif'
    ctx.lineWidth = 5
    ctx.strokeStyle = '#00000088'
    ctx.strokeText(label, S / 2, S - 22)
    ctx.fillStyle = '#fff'
    ctx.fillText(label, S / 2, S - 22)
  }
  return toTexture(c)
}

export function emojiTexture(icon: string) {
  const S = 96
  const [c, ctx] = canvas(S, S)
  ctx.font = `72px ${EMOJI_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icon, S / 2, S / 2 + 4)
  return toTexture(c)
}

/** 이름표. 반환값의 aspect로 스프라이트 가로 비율을 맞춘다. */
export function nameTexture(text: string, highlight: boolean, teamColor = 'rgba(10,20,40,.7)') {
  const H = 64
  const [m] = canvas(1, 1)
  const mctx = m.getContext('2d')!
  mctx.font = 'bold 36px sans-serif'
  const W = Math.ceil(mctx.measureText(text).width) + 36
  const [c, ctx] = canvas(W, H)
  ctx.fillStyle = teamColor
  roundRect(ctx, 2, 2, W - 4, H - 4, 18)
  ctx.fill()
  if (highlight) {
    ctx.lineWidth = 5
    ctx.strokeStyle = '#ffe14d'
    ctx.stroke()
  }
  ctx.font = 'bold 36px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(text, W / 2, H / 2 + 2)
  return { tex: toTexture(c), aspect: W / H }
}

/** 나무 상자 텍스처: 테두리 + X 보강대(x) 또는 원 표시(o) */
export function crateTexture(base: string, light: string, kind: 'x' | 'o') {
  const S = 128
  const [c, ctx] = canvas(S, S)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  // 나뭇결
  ctx.strokeStyle = 'rgba(0,0,0,.12)'
  ctx.lineWidth = 2
  for (let y = 10; y < S; y += 18) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(S * 0.3, y + 4, S * 0.7, y - 4, S, y + 2)
    ctx.stroke()
  }
  ctx.strokeStyle = light
  ctx.lineWidth = 14
  ctx.strokeRect(7, 7, S - 14, S - 14)
  if (kind === 'x') {
    ctx.beginPath()
    ctx.moveTo(14, 14)
    ctx.lineTo(S - 14, S - 14)
    ctx.moveTo(S - 14, 14)
    ctx.lineTo(14, S - 14)
    ctx.stroke()
  } else {
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, 26, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(0,0,0,.35)'
  ctx.lineWidth = 3
  ctx.strokeRect(1.5, 1.5, S - 3, S - 3)
  return toTexture(c)
}

/** 체크무늬 바닥 (타일 하나당 32px) */
export function floorTexture(w: number, h: number, a: string, b: string) {
  const P = 32
  const [c, ctx] = canvas(w * P, h * P)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? a : b
      ctx.fillRect(x * P, y * P, P, P)
      ctx.fillStyle = 'rgba(255,255,255,.06)'
      for (let i = 0; i < 4; i++) {
        const px = x * P + ((x * 7 + y * 13 + i * 11) % P)
        const py = y * P + ((x * 5 + y * 3 + i * 17) % P)
        ctx.fillRect(px, py, 2, 2)
      }
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,.06)'
  ctx.lineWidth = 1
  for (let x = 0; x <= w; x++) {
    ctx.beginPath()
    ctx.moveTo(x * P, 0)
    ctx.lineTo(x * P, h * P)
    ctx.stroke()
  }
  for (let y = 0; y <= h; y++) {
    ctx.beginPath()
    ctx.moveTo(0, y * P)
    ctx.lineTo(w * P, y * P)
    ctx.stroke()
  }
  const tex = toTexture(c)
  tex.magFilter = THREE.NearestFilter
  return tex
}

/** 바닥에 까는 동그란 그림자 */
export function blobShadowTexture() {
  const S = 64
  const [c, ctx] = canvas(S, S)
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(0,0,0,.45)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  return toTexture(c)
}
