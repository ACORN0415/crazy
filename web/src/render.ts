export const MAP_W = 15
export const MAP_H = 13

export interface Theme {
  floorA: string
  floorB: string
  wall: string
  wallTop: string
  block: string
  blockTop: string
  push: string
  pushTop: string
  bush: string
  bushDark: string
}

export const THEMES: Record<string, Theme> = {
  village: {
    floorA: '#8fd16a', floorB: '#83c65f',
    wall: '#b0563f', wallTop: '#e07a5f',
    block: '#c48a4a', blockTop: '#e2ad6b',
    push: '#7a8ea8', pushTop: '#a7bdd8',
    bush: '#3f9d3a', bushDark: '#2d7a2a',
  },
  pirate: {
    floorA: '#f1d9a2', floorB: '#e8cd92',
    wall: '#5d4037', wallTop: '#8d6e63',
    block: '#a86b32', blockTop: '#cf9150',
    push: '#6d4c41', pushTop: '#a1887f',
    bush: '#4caf50', bushDark: '#2e7d32',
  },
  camp: {
    floorA: '#c9a36b', floorB: '#bf985f',
    wall: '#6d5a3a', wallTop: '#9c8456',
    block: '#8a8f3c', blockTop: '#b3b85a',
    push: '#8d6e63', pushTop: '#a1887f',
    bush: '#3f9d3a', bushDark: '#2d7a2a',
  },
  factory: {
    floorA: '#b8c2cc', floorB: '#aab5c0',
    wall: '#37474f', wallTop: '#607d8b',
    block: '#d18b2c', blockTop: '#f0b25a',
    push: '#5e7fa3', pushTop: '#8fb0d6',
    bush: '#6aa84f', bushDark: '#4a7f35',
  },
}

const theme = (id: string) => THEMES[id] ?? THEMES.village

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 바닥, 벽, 블록을 그린다. tiles는 행 우선 문자열 (MAP_W * MAP_H). */
export function drawBoard(ctx: CanvasRenderingContext2D, tiles: string, themeId: string, T: number) {
  const th = theme(themeId)
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const px = x * T
      const py = y * T
      ctx.fillStyle = (x + y) % 2 === 0 ? th.floorA : th.floorB
      ctx.fillRect(px, py, T, T)
      const ch = tiles[y * MAP_W + x]
      if (ch === '#') {
        ctx.fillStyle = th.wall
        ctx.fillRect(px, py, T, T)
        ctx.fillStyle = th.wallTop
        ctx.fillRect(px + 2, py + 2, T - 4, T * 0.62)
        ctx.strokeStyle = 'rgba(0,0,0,.18)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(px + 2, py + T * 0.33)
        ctx.lineTo(px + T - 2, py + T * 0.33)
        ctx.moveTo(px + T / 2, py + 2)
        ctx.lineTo(px + T / 2, py + T * 0.33)
        ctx.stroke()
      } else if (ch === 'x' || ch === 'o') {
        const base = ch === 'x' ? th.block : th.push
        const top = ch === 'x' ? th.blockTop : th.pushTop
        const m = T * 0.06
        ctx.fillStyle = base
        roundRect(ctx, px + m, py + m, T - 2 * m, T - 2 * m, T * 0.12)
        ctx.fill()
        ctx.fillStyle = top
        roundRect(ctx, px + m * 2, py + m * 2, T - 4 * m, T * 0.58, T * 0.1)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,.22)'
        ctx.lineWidth = Math.max(1, T * 0.04)
        if (ch === 'x') {
          ctx.beginPath()
          ctx.moveTo(px + m * 3, py + m * 3)
          ctx.lineTo(px + T - m * 3, py + T * 0.58)
          ctx.moveTo(px + T - m * 3, py + m * 3)
          ctx.lineTo(px + m * 3, py + T * 0.58)
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(px + T / 2, py + T * 0.36, T * 0.14, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }
  }
}

/** 풀숲은 캐릭터와 물풍선 위에 덮어 그린다. */
export function drawBushes(ctx: CanvasRenderingContext2D, tiles: string, themeId: string, T: number, alpha = 1) {
  const th = theme(themeId)
  ctx.save()
  ctx.globalAlpha = alpha
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (tiles[y * MAP_W + x] !== '~') continue
      const cx = x * T + T / 2
      const cy = y * T + T / 2
      ctx.fillStyle = th.bushDark
      for (const [dx, dy, r] of [[-0.22, 0.12, 0.3], [0.22, 0.12, 0.3], [0, 0.2, 0.32]]) {
        ctx.beginPath()
        ctx.arc(cx + dx * T, cy + dy * T, r * T, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = th.bush
      for (const [dx, dy, r] of [[-0.2, -0.08, 0.26], [0.2, -0.08, 0.26], [0, -0.22, 0.26], [0, 0.05, 0.28]]) {
        ctx.beginPath()
        ctx.arc(cx + dx * T, cy + dy * T, r * T, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.restore()
}
