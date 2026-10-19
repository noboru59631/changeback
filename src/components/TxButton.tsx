import { clsx } from 'clsx'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  onClick?: () => void
  disabled?: boolean
  pending?: boolean       // waiting for wallet confirmation
  confirming?: boolean    // submitted, waiting for block
  label: string
  pendingLabel?: string
  confirmingLabel?: string
  variant?: 'primary' | 'ghost' | 'danger'
  className?: string
  type?: 'button' | 'submit' | 'reset'
  children?: ReactNode
}

/** Reusable transaction CTA with honest wallet/confirm states. */
export function TxButton({
  onClick,
  disabled,
  pending,
  confirming,
  label,
  pendingLabel = 'Confirm in wallet…',
  confirmingLabel = 'Confirming…',
  variant = 'primary',
  className,
  type = 'button',
}: Props) {
  const busy = pending || confirming

  const text = pending ? pendingLabel : confirming ? confirmingLabel : label

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={clsx(
        'flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        variant === 'primary' && 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-700 disabled:opacity-50',
        variant === 'ghost' && 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400 disabled:opacity-40',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 disabled:opacity-50',
        className,
      )}
    >
      {busy && <Loader2 size={14} className="animate-spin" />}
      {text}
    </button>
  )
}
