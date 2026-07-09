import { useEffect, useRef, useState } from 'react'
import { copyText } from '@/utils'
import { Button } from './Button'
import { CopyIcon, CopiedIcon } from './icons'

/** Copies `text` on click (explicit user action), with brief "Copied" feedback. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const onClick = () => {
    if (!copyText(text)) return
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Button variant="secondary" onClick={onClick}>
      {copied ? <CopiedIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </Button>
  )
}
