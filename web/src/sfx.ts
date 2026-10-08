// 간단한 WebAudio 효과음 (외부 음원 없이 합성)
let ac: AudioContext | null = null

function ctx(): AudioContext | null {
  if (!ac) {
    try {
      ac = new AudioContext()
    } catch {
      return null
    }
  }
  if (ac.state === 'suspended') void ac.resume()
  return ac
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const a = ctx()
  if (!a) return
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, a.currentTime)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur)
  g.gain.setValueAtTime(vol, a.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur)
  o.connect(g).connect(a.destination)
  o.start()
  o.stop(a.currentTime + dur)
}

function noise(dur: number, vol: number) {
  const a = ctx()
  if (!a) return
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
  const src = a.createBufferSource()
  const f = a.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 900
  const g = a.createGain()
  g.gain.value = vol
  src.buffer = buf
  src.connect(f).connect(g).connect(a.destination)
  src.start()
}

export const sfx: Record<string, () => void> = {
  place: () => tone(520, 0.08, 'sine', 0.15, 300),
  explode: () => noise(0.35, 0.35),
  pickup: () => {
    tone(880, 0.08, 'square', 0.06)
    setTimeout(() => tone(1320, 0.1, 'square', 0.06), 70)
  },
  trap: () => tone(300, 0.4, 'sine', 0.2, 900),
  pop: () => tone(900, 0.25, 'triangle', 0.25, 120),
  kick: () => tone(200, 0.08, 'square', 0.1),
  use: () => tone(660, 0.15, 'sawtooth', 0.08, 990),
  dismount: () => tone(400, 0.2, 'square', 0.1, 200),
}
