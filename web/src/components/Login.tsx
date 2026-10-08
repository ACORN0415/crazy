import { useState, type FormEvent } from 'react'

export default function Login({ onSubmit, busy, error }: { onSubmit: (nick: string) => void; busy: boolean; error: string }) {
  const [nick, setNick] = useState(() => {
    try {
      return localStorage.getItem('ca-nick') ?? ''
    } catch {
      return ''
    }
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = nick.trim()
    if (!n) return
    try {
      localStorage.setItem('ca-nick', n)
    } catch {
      // storage unavailable
    }
    onSubmit(n)
  }

  return (
    <div className="login">
      <h1 className="logo">
        <span>CRAZY</span> <span>ARCADE</span>
      </h1>
      <form className="panel login-box" onSubmit={submit}>
        <div className="panel-title">닉네임을 입력하세요</div>
        <input autoFocus value={nick} maxLength={12} placeholder="닉네임 (1~12자)" onChange={(e) => setNick(e.target.value)} />
        <button className="btn primary" disabled={busy || !nick.trim()}>
          {busy ? '접속 중...' : '접속하기'}
        </button>
        {error && <div className="error-text">{error}</div>}
      </form>
    </div>
  )
}
