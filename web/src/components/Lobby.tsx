import { useState, type FormEvent } from 'react'
import type { ChatMsg, LobbyView, Me, Meta, RoomSummary } from '../types'
import { net } from '../net'
import Chat from './Chat'
import Modal from './Modal'

interface Props {
  me: Me
  meta: Meta
  lobby: LobbyView
  chat: ChatMsg[]
}

export default function Lobby({ me, meta, lobby, chat }: Props) {
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [password, setPassword] = useState('')
  const [joinTarget, setJoinTarget] = useState<RoomSummary | null>(null)
  const [joinPw, setJoinPw] = useState('')
  const [waitingOnly, setWaitingOnly] = useState(false)

  const modeName = (id: string) => meta.modes.find((m) => m.id === id)?.name ?? id
  const mapName = (id: string) => meta.maps.find((m) => m.id === id)?.name ?? id

  const create = (e: FormEvent) => {
    e.preventDefault()
    net.send('create_room', { title: title.trim(), password })
    setCreating(false)
    setTitle('')
    setPassword('')
  }

  const join = (r: RoomSummary) => {
    if (r.state === 'playing' || r.players >= r.max) return
    if (r.locked) {
      setJoinTarget(r)
      setJoinPw('')
      return
    }
    net.send('join_room', { roomId: r.id })
  }

  const submitJoin = (e: FormEvent) => {
    e.preventDefault()
    if (!joinTarget) return
    net.send('join_room', { roomId: joinTarget.id, password: joinPw })
    setJoinTarget(null)
  }

  const rooms = waitingOnly ? lobby.rooms.filter((r) => r.state === 'waiting' && r.players < r.max) : lobby.rooms

  return (
    <div className="lobby">
      <div className="lobby-main panel">
        <div className="panel-title row">
          <span>방 목록</span>
          <label className="check">
            <input type="checkbox" checked={waitingOnly} onChange={(e) => setWaitingOnly(e.target.checked)} /> 대기방만
          </label>
          <button className="btn primary" onClick={() => setCreating(true)}>
            방 만들기
          </button>
        </div>
        <div className="room-grid">
          {rooms.length === 0 && <div className="empty">열린 방이 없습니다. 방을 만들어 보세요!</div>}
          {rooms.map((r) => {
            const full = r.players >= r.max
            const disabled = r.state === 'playing' || full
            return (
              <button key={r.id} className={`room-card ${disabled ? 'disabled' : ''}`} onClick={() => join(r)}>
                <div className="room-no">{String(r.id).padStart(3, '0')}</div>
                <div className="room-info">
                  <div className="room-title">
                    {r.locked && <span title="비밀방">🔒 </span>}
                    {r.title}
                  </div>
                  <div className="room-sub">
                    {modeName(r.mode)} · {mapName(r.mapId)} · 방장 {r.host}
                  </div>
                </div>
                <div className={`room-state ${r.state}`}>
                  {r.state === 'playing' ? '게임중' : full ? '꽉참' : '대기중'}
                  <small>
                    {r.players}/{r.max}
                  </small>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="lobby-side">
        <div className="panel users">
          <div className="panel-title">접속자 ({lobby.users.length})</div>
          <ul>
            {lobby.users.map((u) => (
              <li key={u.id} className={u.id === me.id ? 'me' : ''}>
                <span>{u.nickname}</span>
                <small>{u.roomId ? `${u.roomId}번 방` : '로비'}</small>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <div className="panel-title">로비 채팅</div>
          <Chat messages={chat} />
        </div>
      </div>

      {creating && (
        <Modal title="방 만들기" onClose={() => setCreating(false)}>
          <form className="form" onSubmit={create}>
            <label>
              방 제목
              <input autoFocus value={title} maxLength={20} placeholder={`${me.nickname}님의 방`} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              비밀번호 <small>(비우면 공개방)</small>
              <input type="password" value={password} maxLength={16} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setCreating(false)}>
                취소
              </button>
              <button className="btn primary">만들기</button>
            </div>
          </form>
        </Modal>
      )}

      {joinTarget && (
        <Modal title={`🔒 ${joinTarget.title}`} onClose={() => setJoinTarget(null)}>
          <form className="form" onSubmit={submitJoin}>
            <label>
              비밀번호
              <input autoFocus type="password" value={joinPw} maxLength={16} onChange={(e) => setJoinPw(e.target.value)} />
            </label>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setJoinTarget(null)}>
                취소
              </button>
              <button className="btn primary">입장</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
