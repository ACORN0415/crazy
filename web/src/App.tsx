import { useEffect, useRef, useState } from 'react'
import type { ChatMsg, GameOver, GameStart, LobbyView, Me, Meta, RoomView } from './types'
import { net } from './net'
import Login from './components/Login'
import Lobby from './components/Lobby'
import RoomScreen from './components/RoomScreen'
import GameScreen from './components/GameScreen'

type Screen = 'login' | 'lobby' | 'room' | 'game'

const MAX_CHAT = 100
const RESULT_MS = 6000

export default function App() {
  const [screen, setScreen] = useState<Screen>('login')
  const [busy, setBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [me, setMe] = useState<Me | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [lobby, setLobby] = useState<LobbyView>({ rooms: [], users: [] })
  const [room, setRoom] = useState<RoomView | null>(null)
  const [lobbyChat, setLobbyChat] = useState<ChatMsg[]>([])
  const [roomChat, setRoomChat] = useState<ChatMsg[]>([])
  const [gameStart, setGameStart] = useState<GameStart | null>(null)
  const [result, setResult] = useState<GameOver | null>(null)
  const [toast, setToast] = useState('')
  const screenRef = useRef(screen)
  screenRef.current = screen
  const resultTimer = useRef<number>()

  useEffect(() => {
    const offs = [
      net.on('welcome', (d: { id: string; nickname: string; meta: Meta }) => {
        setMe({ id: d.id, nickname: d.nickname })
        setMeta(d.meta)
        setBusy(false)
        setScreen('lobby')
      }),
      net.on('lobby', setLobby),
      net.on('room', (r: RoomView) => {
        setRoom(r)
        if (screenRef.current === 'lobby') {
          setRoomChat([])
          setScreen('room')
        }
      }),
      net.on('left_room', () => {
        setRoom(null)
        setGameStart(null)
        setResult(null)
        setScreen('lobby')
      }),
      net.on('chat', (m: ChatMsg) => {
        const add = (list: ChatMsg[]) => [...list, m].slice(-MAX_CHAT)
        if (m.scope === 'room') setRoomChat(add)
        else setLobbyChat(add)
      }),
      net.on('game_start', (g: GameStart) => {
        window.clearTimeout(resultTimer.current)
        setGameStart(g)
        setResult(null)
        setScreen('game')
      }),
      net.on('game_over', (g: GameOver) => {
        setResult(g)
        resultTimer.current = window.setTimeout(() => {
          if (screenRef.current === 'game') setScreen('room')
        }, RESULT_MS)
      }),
      net.on('error', (e: { message: string }) => {
        if (screenRef.current === 'login') {
          setLoginError(e.message)
          setBusy(false)
          return
        }
        setToast(e.message)
        window.setTimeout(() => setToast(''), 2500)
      }),
      net.on('close', () => {
        setScreen('login')
        setRoom(null)
        setMe(null)
        setBusy(false)
        setLoginError('서버와 연결이 끊어졌습니다.')
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  const login = async (nick: string) => {
    setBusy(true)
    setLoginError('')
    try {
      await net.connect()
      net.send('hello', { nickname: nick })
    } catch (err) {
      setBusy(false)
      setLoginError((err as Error).message)
    }
  }

  return (
    <div className="app">
      {screen !== 'login' && me && (
        <header className="topbar">
          <span className="logo small">
            <span>CRAZY</span> <span>ARCADE</span>
          </span>
          <span className="spacer" />
          <span className="whoami">👤 {me.nickname}</span>
        </header>
      )}

      {screen === 'login' && <Login onSubmit={login} busy={busy} error={loginError} />}
      {screen === 'lobby' && me && meta && <Lobby me={me} meta={meta} lobby={lobby} chat={lobbyChat} />}
      {screen === 'room' && me && meta && room && <RoomScreen me={me} meta={meta} room={room} chat={roomChat} />}
      {screen === 'game' && me && meta && gameStart && (
        <GameScreen
          me={me}
          meta={meta}
          start={gameStart}
          result={result}
          chat={roomChat}
          onExit={() => {
            window.clearTimeout(resultTimer.current)
            setScreen('room')
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
