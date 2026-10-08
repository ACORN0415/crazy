// 화면에 그릴 때 쓰는 아이템 아이콘/색. 이름과 설명은 서버 meta.items에서 온다.
export const ITEM_ICON: Record<string, { icon: string; bg: string }> = {
  bubble: { icon: '💧', bg: '#3a8dff' },
  potion: { icon: '🧪', bg: '#2fb7e8' },
  roller: { icon: '🛼', bg: '#ffb020' },
  ultra: { icon: '🧪', bg: '#ff4d6d' },
  red_devil: { icon: '😈', bg: '#e53935' },
  devil: { icon: '👿', bg: '#7b3fbf' }, // 보라 악마 (저주)
  kick: { icon: '👟', bg: '#43a047' },
  turtle: { icon: '🐢', bg: '#66bb6a' },
  pirate_turtle: { icon: '🐢', bg: '#37474f' },
  owl: { icon: '🦉', bg: '#8d6e63' },
  ufo: { icon: '🛸', bg: '#5c6bc0' },
  needle: { icon: '📍', bg: '#ec407a' },
  shield: { icon: '🛡️', bg: '#fbc02d' },
  dart: { icon: '🎯', bg: '#ef5350' },
  spring: { icon: '🦘', bg: '#26a69a' },
}

export const CONSUMABLE_KEYS: { key: string; item: string }[] = [
  { key: '1', item: 'needle' },
  { key: '2', item: 'shield' },
  { key: '3', item: 'dart' },
  { key: '4', item: 'spring' },
]

export const CURSE_NAME: Record<string, string> = {
  reverse: '방향 반전',
  slow: '느려짐',
  autobubble: '물풍선 자동 설치',
  nobubble: '물풍선 설치 불가',
}

export const PLAYER_COLORS = ['#ff5a5a', '#4a8cff']
