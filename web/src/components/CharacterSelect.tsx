import type { CharacterDef } from '../types'
import { usePortrait } from '../three/portrait'
import { characterColor } from '../three/characters'
import { net } from '../net'
import { teamOfSlot } from '../three/sprites'

export function Portrait({ id, size = 64, slot = 0 }: { id: string; size?: number; slot?: number }) {
  const url = usePortrait(id === 'random' ? undefined : id, teamOfSlot(slot))
  if (id === 'random') {
    return (
      <div className="portrait random" style={{ width: size, height: size, fontSize: size * 0.5 }}>
        ?
      </div>
    )
  }
  return (
    <div className="portrait" style={{ width: size, height: size, background: `radial-gradient(circle at 50% 40%, #ffffff, ${characterColor(id)}55)` }}>
      {url && <img src={url} alt="" width={size} height={size} />}
    </div>
  )
}

function StatBar({ label, start, max, top }: { label: string; start: number; max: number; top: number }) {
  return (
    <div className="stat-bar">
      <span>{label}</span>
      <div className="bar">
        <i className="max" style={{ width: `${(max / top) * 100}%` }} />
        <i className="start" style={{ width: `${(start / top) * 100}%` }} />
      </div>
      <small>
        {start}/{max}
      </small>
    </div>
  )
}

interface Props {
  characters: CharacterDef[]
  selected: string
  locked: boolean
  slot: number
}

export default function CharacterSelect({ characters, selected, locked, slot }: Props) {
  const top = {
    bubbles: Math.max(...characters.map((c) => c.bubbles.max)),
    range: Math.max(...characters.map((c) => c.range.max)),
    speed: Math.max(...characters.map((c) => c.speed.max)),
  }
  const cur = characters.find((c) => c.id === selected)

  return (
    <div className="char-select">
      <div className="char-grid">
        {characters.map((c) => (
          <button
            key={c.id}
            className={`char-card ${selected === c.id ? 'selected' : ''}`}
            disabled={locked}
            onClick={() => net.send('select_character', { id: c.id })}
            title={c.desc}
          >
            <Portrait id={c.id} size={72} slot={slot} />
            <b>{c.name}</b>
            <small>{c.type}</small>
          </button>
        ))}
        <button
          className={`char-card ${selected === 'random' ? 'selected' : ''}`}
          disabled={locked}
          onClick={() => net.send('select_character', { id: 'random' })}
        >
          <Portrait id="random" size={72} />
          <b>랜덤</b>
          <small>무작위</small>
        </button>
      </div>
      <div className="char-detail">
        {cur ? (
          <>
            <div className="char-detail-head">
              <b>{cur.name}</b> <span>{cur.type}</span>
            </div>
            <p>{cur.desc}</p>
            <StatBar label="💧 물풍선" start={cur.bubbles.start} max={cur.bubbles.max} top={top.bubbles} />
            <StatBar label="🧪 물줄기" start={cur.range.start} max={cur.range.max} top={top.range} />
            <StatBar label="🛼 속도" start={cur.speed.start} max={cur.speed.max} top={top.speed} />
          </>
        ) : (
          <p>게임이 시작될 때 캐릭터가 무작위로 정해집니다.</p>
        )}
        {locked && <p className="muted">준비 상태에서는 캐릭터를 바꿀 수 없습니다.</p>}
      </div>
    </div>
  )
}
