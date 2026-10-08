import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChatMsg } from '../types'
import { net } from '../net'

export default function Chat({ messages, compact }: { messages: ChatMsg[]; compact?: boolean }) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    net.send('chat', { text: t })
    setText('')
  }

  return (
    <div className={`chat ${compact ? 'compact' : ''}`}>
      <div className="chat-list" ref={listRef}>
        {messages.map((m, i) =>
          m.system ? (
            <div key={i} className="chat-line system">
              {m.text}
            </div>
          ) : (
            <div key={i} className="chat-line">
              <b>{m.from}</b> : {m.text}
            </div>
          ),
        )}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input value={text} maxLength={100} placeholder="채팅 입력 (Enter)" onChange={(e) => setText(e.target.value)} />
        <button type="submit">전송</button>
      </form>
    </div>
  )
}
