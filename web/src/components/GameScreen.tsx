import { useEffect, useRef, useState } from 'react'
import type { ChatMsg, GameOver, GameStart, Me, Meta, Snapshot } from '../types'
import { net } from '../net'
import { GameScene } from '../three/scene'
import { CONSUMABLE_KEYS, CURSE_NAME, PLAYER_COLORS } from '../itemInfo'
import { sfx } from '../sfx'
import Chat from './Chat'
import ItemIcon from './ItemIcon'
import { Portrait } from './CharacterSelect'

const VIEW_W = 960
const VIEW_H = 720
const TICK_MS = 1000 / 30

const KEY_DIR: Record<string, string> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
}

interface Props {
  me: Me
  meta: Meta
  start: GameStart
  result: GameOver | null
  chat: ChatMsg[]
  onExit: () => void
}

function initialLowGfx() {
  if (new URLSearchParams(location.search).get('gfx') === 'low') return true
  try {
    return localStorage.getItem('ca-gfx') === 'low'
  } catch {
    return false
  }
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}

export default function GameScreen({ me, meta, start, result, chat, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const prev = useRef<Snapshot | null>(null)
  const cur = useRef<Snapshot | null>(null)
  const curAt = useRef(0)
  const [hud, setHud] = useState<Snapshot | null>(null)
  const [lowGfx, setLowGfx] = useState(initialLowGfx)
  const toggleGfx = () => {
    setLowGfx((v) => {
      try {
        localStorage.setItem('ca-gfx', v ? 'high' : 'low')
      } catch {
        // storage unavailable
      }
      return !v
    })
  }

  const map = meta.maps.find((m) => m.id === start.mapId)!
  const mode = meta.modes.find((m) => m.id === start.mode)!
  const nickOf = (id: string) => start.players.find((p) => p.id === id)?.nickname ?? '?'

  // snapshots
  useEffect(() => {
    return net.on('state', (s: Snapshot) => {
      prev.current = cur.current ?? s
      cur.current = s
      curAt.current = performance.now()
      for (const ev of s.events) sfx[ev.type]?.()
      setHud(s)
    })
  }, [])

  // keyboard input
  useEffect(() => {
    const held: string[] = []
    let sent = ''
    const sync = () => {
      const d = held[held.length - 1] ?? ''
      if (d !== sent) {
        sent = d
        net.send('input', { dir: d })
      }
    }
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const d = KEY_DIR[e.code]
      if (d) {
        e.preventDefault()
        if (!held.includes(d)) held.push(d)
        sync()
        return
      }
      if (e.repeat) return
      if (e.code === 'Space') {
        e.preventDefault()
        net.send('bubble')
      } else if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
        net.send('use', { item: 'needle' })
      } else {
        const c = CONSUMABLE_KEYS.find((k) => `Digit${k.key}` === e.code)
        if (c) net.send('use', { item: c.item })
      }
    }
    const up = (e: KeyboardEvent) => {
      const d = KEY_DIR[e.code]
      if (!d) return
      const i = held.indexOf(d)
      if (i >= 0) held.splice(i, 1)
      sync()
    }
    const blur = () => {
      held.length = 0
      sync()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      net.send('input', { dir: '' })
    }
  }, [])

  // 3D render loop
  useEffect(() => {
    const canvas = canvasRef.current!
    const scene = new GameScene(canvas, map.theme, me.id, nickOf, lowGfx, map)
    scene.setTiles(map.rows.join('').replace(/[12]/g, '.'))
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const a = Math.min(1, (now - curAt.current) / TICK_MS)
      scene.render(prev.current, cur.current, a, now / 1000, dt)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      scene.dispose()
    }
  }, [map, me.id, lowGfx])

  const players = hud?.players ?? []
  const left = hud?.left ?? 180
  const cd = hud?.cd ?? 3

  let resultText = ''
  let resultClass = ''
  if (result) {
    if (!result.winnerId) {
      resultText = result.reason === 'timeout' ? '시간 초과 - 무승부' : '무승부'
      resultClass = 'draw'
    } else if (result.winnerId === me.id) {
      resultText = result.reason === 'leave' ? '승리! (상대가 나갔습니다)' : '승리!'
      resultClass = 'win'
    } else {
      resultText = '패배...'
      resultClass = 'lose'
    }
  }

  return (
    <div className="game">
      <div className="board-wrap">
        <canvas key={lowGfx ? 'low' : 'high'} ref={canvasRef} width={VIEW_W} height={VIEW_H} className="board" />
        {!result && cd > 0 && <div className="overlay countdown">{Math.ceil(cd)}</div>}
        {!result && cd === 0 && left > 179 && <div className="overlay countdown go">START!</div>}
        {result && (
          <div className={`overlay result ${resultClass}`}>
            <div className="result-text">{resultText}</div>
            {result.winnerNick && <div className="result-sub">승자: {result.winnerNick}</div>}
            <button className="btn primary" onClick={onExit}>
              방으로 돌아가기
            </button>
          </div>
        )}
      </div>

      <div className="hud">
        <div className="panel timer">
          <span>
            {mode.name} · {map.name}
          </span>
          <b>
            {Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')}
          </b>
        </div>
        {players.map((pl) => (
          <div key={pl.id} className={`panel pcard ${pl.state}`} style={{ borderColor: PLAYER_COLORS[pl.slot] }}>
            <div className="pcard-head">
              <Portrait id={pl.character} size={40} slot={pl.slot} />
              <span className="dot" style={{ background: PLAYER_COLORS[pl.slot] }} />
              <b>{nickOf(pl.id)}</b>
              <small className="muted">{meta.characters.find((c) => c.id === pl.character)?.name}</small>
              {pl.id === me.id && <small>(나)</small>}
              <span className="spacer" />
              <span className="pstate">{pl.state === 'trapped' ? `💦 ${pl.trap?.toFixed(1)}s` : pl.state === 'dead' ? '💀' : ''}</span>
            </div>
            <div className="stats">
              <span title="물풍선">💧 {pl.bubbles}</span>
              <span title="물줄기">🧪 {pl.range}</span>
              <span title="속도">🛼 {pl.speed}</span>
              {pl.kick && <span title="신발">👟</span>}
              {pl.mount && <ItemIcon type={pl.mount} size={20} />}
            </div>
            {pl.curse && <div className="curse">👿 {CURSE_NAME[pl.curse]}</div>}
            {mode.consumables && (
              <div className="inv">
                {CONSUMABLE_KEYS.map((k) => (
                  <span key={k.item} className={pl.inv?.[k.item] ? '' : 'none'}>
                    <kbd>{k.key}</kbd>
                    <ItemIcon type={k.item} size={20} />×{pl.inv?.[k.item] ?? 0}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="panel controls">
          <div>
            <kbd>←↑↓→</kbd> / <kbd>WASD</kbd> 이동
          </div>
          <div>
            <kbd>Space</kbd> 물풍선
          </div>
          {mode.consumables && (
            <div>
              <kbd>1~4</kbd> 아이템 사용 · <kbd>Ctrl</kbd> 바늘
            </div>
          )}
          <button
            className="btn gfx"
            onClick={(e) => {
              toggleGfx()
              e.currentTarget.blur() // Space로 물풍선 놓을 때 버튼이 눌리지 않게
            }}
          >
            그래픽: {lowGfx ? '낮음 (그림자 끔)' : '높음'}
          </button>
        </div>
        <div className="panel">
          <Chat messages={chat} compact />
        </div>
      </div>
    </div>
  )
}
