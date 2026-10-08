import type { ReactNode } from 'react'

export default function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-title">{title}</div>
        {children}
      </div>
    </div>
  )
}
