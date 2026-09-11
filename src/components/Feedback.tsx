import { AlertCircle, LoaderCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react'

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-[45vh] place-items-center" role="status">
      <div className="flex items-center gap-3 text-ink/60">
        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coral/25 bg-coral/10 px-4 py-3 text-sm text-[#8e3020]" role="alert">
      <span className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {message}
      </span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 font-bold underline underline-offset-2">
          <RefreshCw className="size-3.5" aria-hidden="true" /> Retry
        </button>
      ) : null}
    </div>
  )
}

export function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        connected ? 'bg-mint text-pine' : 'bg-gold/25 text-[#75590f]'
      }`}
      aria-live="polite"
    >
      {connected ? <Wifi className="size-3.5" aria-hidden="true" /> : <WifiOff className="size-3.5" aria-hidden="true" />}
      {connected ? 'Live' : 'Reconnecting'}
    </span>
  )
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'live'
      ? 'bg-coral/12 text-[#ad3f2c]'
      : status === 'revealed'
        ? 'bg-mint text-pine'
        : status === 'ended'
          ? 'bg-ink/10 text-ink/60'
          : 'bg-gold/20 text-[#75590f]'
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${tone}`}>{status}</span>
}
