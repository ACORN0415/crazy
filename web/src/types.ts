export interface ModeDef {
  id: string
  name: string
  desc: string
  consumables: boolean
}

export interface MapDecor {
  name: string
  x: number
  y: number
  w: number
  h: number
}

export interface MapDef {
  id: string
  name: string
  theme: string
  rows: string[]
  art?: string[] // 칸마다 테마의 특정 그림을 고르는 글자
  items?: string[] // 처음부터 깔린 아이템
  decor?: MapDecor[] // 여러 칸짜리 큰 그림
}

export interface ItemDef {
  type: string
  name: string
  category: 'stat' | 'special' | 'mount' | 'consumable'
  desc: string
  key?: string
}

export interface StatRange {
  start: number
  max: number
}

export interface CharacterDef {
  id: string
  name: string
  type: string
  desc: string
  bubbles: StatRange
  range: StatRange
  speed: StatRange
}

export interface Meta {
  width: number
  height: number
  modes: ModeDef[]
  maps: MapDef[]
  items: ItemDef[]
  characters: CharacterDef[]
}

export interface Me {
  id: string
  nickname: string
}

export interface RoomSummary {
  id: number
  title: string
  locked: boolean
  players: number
  max: number
  state: 'waiting' | 'playing'
  mode: string
  mapId: string
  host: string
}

export interface UserView {
  id: string
  nickname: string
  roomId?: number
}

export interface LobbyView {
  rooms: RoomSummary[]
  users: UserView[]
}

export interface RoomPlayer {
  id: string
  nickname: string
  slot: number
  ready: boolean
  host: boolean
  character: string // 캐릭터 ID 또는 'random'
}

export interface RoomView {
  id: number
  title: string
  locked: boolean
  hostId: string
  mode: string
  mapId: string
  state: 'waiting' | 'playing'
  max: number
  players: RoomPlayer[]
}

export interface ChatMsg {
  scope: 'lobby' | 'room'
  from?: string
  text: string
  system?: boolean
}

export interface GameStart {
  mode: string
  mapId: string
  players: { id: string; nickname: string; slot: number; character: string }[]
}

export interface GameOver {
  winnerId?: string
  winnerNick?: string
  reason: 'knockout' | 'draw' | 'timeout' | 'leave'
}

export interface SPlayer {
  id: string
  character: string
  slot: number
  x: number
  y: number
  face: 'up' | 'down' | 'left' | 'right'
  moving: boolean
  state: 'alive' | 'trapped' | 'dead'
  bubbles: number
  range: number
  speed: number
  kick: boolean
  mount?: string
  shield?: boolean
  invuln?: boolean
  curse?: string
  trap?: number
  jump?: number
  inv?: Record<string, number>
}

export interface SBubble {
  id: number
  x: number
  y: number
  owner: string
  fuse: number
}

export interface SFlame {
  x: number
  y: number
  k: string // 'c' 중심, u/d/l/r 줄기, U/D/L/R 줄기 끝
  a: number // 생긴 뒤 지난 시간(초)
}

export interface SItem {
  x: number
  y: number
  type: string
}

export interface SEvent {
  type: string
  x: number
  y: number
  player?: string
  item?: string
}

export interface Snapshot {
  cd: number
  left: number
  tiles: string
  players: SPlayer[]
  bubbles: SBubble[]
  flames: SFlame[]
  items: SItem[]
  events: SEvent[]
}
