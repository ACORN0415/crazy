import type { ChatMsg, Me, Meta, RoomView } from '../types'
import { net } from '../net'
import { PLAYER_COLORS } from '../itemInfo'
import Chat from './Chat'
import ItemIcon from './ItemIcon'
import MapPreview from './MapPreview'
import CharacterSelect, { Portrait } from './CharacterSelect'

interface Props {
  me: Me
  meta: Meta
  room: RoomView
  chat: ChatMsg[]
}

const CATEGORY_NAME: Record<string, string> = {
  stat: '능력치',
  special: '특수',
  mount: '탈것',
  consumable: '사용 아이템',
}

export default function RoomScreen({ me, meta, room, chat }: Props) {
  const isHost = room.hostId === me.id
  const self = room.players.find((p) => p.id === me.id)
  const guest = room.players.find((p) => !p.host)
  const canStart = isHost && room.players.length === room.max && !!guest?.ready
  const mode = meta.modes.find((m) => m.id === room.mode)

  return (
    <div className="room">
      <div className="room-header panel">
        <span className="room-no big">{String(room.id).padStart(3, '0')}</span>
        <span className="room-title">
          {room.locked && '🔒 '}
          {room.title}
        </span>
        <span className="spacer" />
        <button className="btn" onClick={() => net.send('leave_room')}>
          나가기
        </button>
      </div>

      <div className="room-body">
        <div className="room-left">
          <div className="slots">
            {Array.from({ length: room.max }, (_, slot) => {
              const p = room.players.find((q) => q.slot === slot)
              return (
                <div key={slot} className={`slot panel ${p ? '' : 'empty'}`} style={{ borderColor: PLAYER_COLORS[slot] }}>
                  {p ? (
                    <div className="slot-portrait">
                      <Portrait id={p.character} size={84} slot={p.slot} />
                      <span className="slot-tag" style={{ background: PLAYER_COLORS[slot] }}>
                        {slot + 1}P
                      </span>
                    </div>
                  ) : (
                    <div className="slot-avatar" style={{ background: PLAYER_COLORS[slot] }}>
                      {slot + 1}P
                    </div>
                  )}
                  {p ? (
                    <>
                      <div className="slot-name">
                        {p.nickname}
                        {p.id === me.id && <small> (나)</small>}
                        <div className="slot-char">
                          {p.character === 'random' ? '랜덤' : meta.characters.find((c) => c.id === p.character)?.name}
                        </div>
                      </div>
                      <div className={`slot-badge ${p.host ? 'host' : p.ready ? 'ready' : ''}`}>
                        {p.host ? '방장' : p.ready ? 'READY' : '대기'}
                      </div>
                    </>
                  ) : (
                    <div className="slot-name muted">상대를 기다리는 중...</div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="panel">
            <div className="panel-title">캐릭터 선택</div>
            <CharacterSelect characters={meta.characters} selected={self?.character ?? 'dao'} locked={!!self?.ready} slot={self?.slot ?? 0} />
          </div>

          <div className="panel">
            <div className="panel-title">
              게임 선택 {!isHost && <small>(방장만 변경 가능)</small>}
            </div>
            <div className="mode-list">
              {meta.modes.map((m) => (
                <button
                  key={m.id}
                  className={`mode-card ${room.mode === m.id ? 'selected' : ''}`}
                  disabled={!isHost}
                  onClick={() => net.send('select_mode', { id: m.id })}
                >
                  <b>{m.name}</b>
                  <span>{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              맵 선택 {!isHost && <small>(방장만 변경 가능)</small>}
            </div>
            <div className="map-list">
              {meta.maps.map((m) => (
                <button
                  key={m.id}
                  className={`map-card ${room.mapId === m.id ? 'selected' : ''}`}
                  disabled={!isHost}
                  onClick={() => net.send('select_map', { id: m.id })}
                >
                  <MapPreview map={m} tile={11} />
                  <b>{m.name}</b>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="room-right">
          <div className="panel start-box">
            {isHost ? (
              <button className="btn start" disabled={!canStart} onClick={() => net.send('start')}>
                게임 시작
              </button>
            ) : (
              <button className={`btn start ${self?.ready ? 'on' : ''}`} onClick={() => net.send('ready', { ready: !self?.ready })}>
                {self?.ready ? '준비 취소' : '준비'}
              </button>
            )}
            <div className="hint">
              {room.players.length < room.max
                ? '상대가 입장하면 시작할 수 있습니다.'
                : isHost
                  ? guest?.ready
                    ? '준비 완료! 게임을 시작하세요.'
                    : '상대가 준비하면 시작할 수 있습니다.'
                  : '준비를 누르면 방장이 게임을 시작할 수 있습니다.'}
            </div>
          </div>

          <div className="panel items-help">
            <div className="panel-title">아이템 ({mode?.name})</div>
            {(['stat', 'special', 'mount', 'consumable'] as const)
              .filter((c) => c !== 'consumable' || mode?.consumables)
              .map((cat) => (
                <div key={cat} className="item-group">
                  <div className="item-cat">{CATEGORY_NAME[cat]}</div>
                  {meta.items
                    .filter((it) => it.category === cat)
                    .map((it) => (
                      <div key={it.type} className="item-row" title={it.desc}>
                        <ItemIcon type={it.type} />
                        <span className="item-name">
                          {it.name}
                          {it.key && <kbd>{it.key}</kbd>}
                        </span>
                        <span className="item-desc">{it.desc}</span>
                      </div>
                    ))}
                </div>
              ))}
          </div>

          <div className="panel">
            <div className="panel-title">채팅</div>
            <Chat messages={chat} compact />
          </div>
        </div>
      </div>
    </div>
  )
}
