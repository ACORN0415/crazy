import { useEffect, useState } from 'react'
import { ITEM_ICON } from '../itemInfo'
import { cachedFx, loadFx } from '../three/fxAssets'

/** 원작 아이템 그림 (없으면 이모지) */
export default function ItemIcon({ type, size = 26 }: { type: string; size?: number }) {
  const [src, setSrc] = useState(() => cachedFx()?.items[type]?.img.src)
  useEffect(() => {
    let alive = true
    void loadFx().then((fx) => alive && setSrc(fx?.items[type]?.img.src))
    return () => {
      alive = false
    }
  }, [type])
  if (src) return <img src={src} alt="" width={size} height={size} style={{ objectFit: 'contain' }} />
  return (
    <span className="item-icon" style={{ background: ITEM_ICON[type]?.bg, width: size, height: size }}>
      {ITEM_ICON[type]?.icon}
    </span>
  )
}
