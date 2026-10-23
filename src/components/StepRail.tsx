import { STEP_LABELS } from '@/lib/constants'
import { clsx } from 'clsx'

interface Props {
  activeStep: number // 0-5
}

/**
 * Six-step lifecycle rail: Create → Collect → Approve → Spend → Return → Close.
 * activeStep is 0-indexed. Steps before active are "done"; active is highlighted.
 */
export function StepRail({ activeStep }: Props) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1" aria-label="Lifecycle position, not proof of completed transactions">
      {STEP_LABELS.map((label, idx) => {
        const done = idx < activeStep
        const active = idx === activeStep
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center min-w-[56px]">
              <div
                className={clsx(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                  done && 'bg-slate-200 text-slate-600',
                  active && 'bg-navy-900 text-white ring-2 ring-navy-900 ring-offset-2',
                  !done && !active && 'bg-slate-200 text-slate-500',
                )}
                style={active ? { backgroundColor: '#0f172a' } : undefined}
              >
                {idx + 1}
              </div>
              <span
                className={clsx(
                  'mt-1 text-[10px] font-medium tracking-wide uppercase',
                  active ? 'text-slate-900' : 'text-slate-400',
                )}
              >
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div
                className={clsx(
                  'h-[2px] w-6 flex-shrink-0 mx-0.5 rounded',
                  idx < activeStep ? 'bg-emerald-500' : 'bg-slate-200',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
