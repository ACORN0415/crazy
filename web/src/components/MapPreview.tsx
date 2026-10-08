import { useEffect, useRef } from 'react'
import type { MapDef } from '../types'
import { MAP_H, MAP_W, drawBoard, drawBushes } from '../render'
import { PLAYER_COLORS } from '../itemInfo'
import { artAt, cellHash, hiddenAt, loadMapTheme, type TileKind } from '../three/mapTheme'
import { loadFx } from '../three/fxAssets'

const KIND: Record<string, TileKind> = { '#': 'wall', '%': 'wall', x: 'block', o: 'push', '~': 'bush' }
const ITEM_CHARS: Record<string, string> = {
  b: 'bubble', p: 'potion', r: 'roller', u: 'ultra', R: 'red_devil', d: 'devil', k: 'kick',
  t: 'turtle', T: 'pirate_turtle', w: 'owl', U: 'ufo', n: 'needle', s: 'shield', a: 'dart', j: 'spring',
}

export default function MapPreview({ map, tile = 12 }: { map: MapDef; tile?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    let alive = true
    const tiles = map.rows.join('')
    const spawns = () => {
      for (let i = 0; i < tiles.length; i++) {
        const ch = tiles[i]
        if (ch !== '1' && ch !== '2') continue
        ctx.fillStyle = PLAYER_COLORS[Number(ch) - 1]
        ctx.beginPath()
        ctx.arc((i % MAP_W) * tile + tile / 2, Math.floor(i / MAP_W) * tile + tile / 2, tile * 0.38, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
    drawBoard(ctx, tiles.replace(/[12]/g, '.'), map.theme, tile)
    drawBushes(ctx, tiles, map.theme, tile)
    spawns()
    // 원작 그림이 있으면 원작처럼 위에서 내려다본 모습으로 다시 그린다
    void Promise.all([loadMapTheme(map.theme), loadFx()]).then(([a, fx]) => {
      if (!a || !alive) return
      ctx.clearRect(0, 0, MAP_W * tile, MAP_H * tile)
      for (let y = 0; y < MAP_H; y++)
        for (let x = 0; x < MAP_W; x++) {
          const f = a.floorNamed[artAt(map, y * MAP_W + x)] ?? a.floor[(x + y) % Math.max(1, a.floor.length)]
          if (f) ctx.drawImage(f, x * tile, y * tile, tile, tile)
          if (a.thorn && tiles[y * MAP_W + x] === 'T') ctx.drawImage(a.thorn, x * tile, y * tile, tile, tile)
        }
      // 미리 깔린 아이템
      if (fx)
        for (let y = 0; y < MAP_H; y++)
          for (let x = 0; x < MAP_W; x++) {
            const ch = map.items?.[y]?.[x]
            const name = ch ? ITEM_CHARS[ch] : undefined
            const im = name ? fx.items[name] : undefined
            if (im) ctx.drawImage(im.img, x * tile + tile * 0.1, y * tile + tile * 0.1, tile * 0.8, tile * 0.8)
          }
      // 뒤쪽 줄부터 그려야 앞줄 물체가 뒷줄을 덮는다
      for (let y = 0; y < MAP_H; y++)
        for (let x = 0; x < MAP_W; x++) {
          const i = y * MAP_W + x
          const kind = KIND[tiles[i]]
          if (!kind || hiddenAt(map, i)) continue
          const list = a.pieces[kind]
          const p = a.named[artAt(map, i)] ?? (list.length ? list[cellHash(i) % list.length] : undefined)
          if (!p) continue
          const w = p.w * tile
          const h = p.h * tile
          ctx.drawImage(p.img, x * tile + (tile - w) / 2, (y + 1) * tile - h, w, h)
        }
      for (const d of map.decor ?? []) {
        const p = a.decor[d.name]
        if (p) ctx.drawImage(p.img, d.x * tile, (d.y + d.h) * tile - p.h * tile, p.w * tile, p.h * tile)
      }
      spawns()
    })
    return () => {
      alive = false
    }
  }, [map, tile])
  return <canvas ref={ref} width={MAP_W * tile} height={MAP_H * tile} className="map-preview" />
}
