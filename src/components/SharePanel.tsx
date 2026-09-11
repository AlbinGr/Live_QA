import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { buildJoinUrl } from '../lib/share'

export interface SharePanelProps {
  joinCode: string
  compact?: boolean
  className?: string
}

type Feedback = {
  kind: 'success' | 'error'
  message: string
}

type IconProps = SVGProps<SVGSVGElement>

const iconProps: IconProps = {
  'aria-hidden': true,
  fill: 'none',
  height: 18,
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2,
  viewBox: '0 0 24 24',
  width: 18,
}

function CopyIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <rect height="13" rx="2" width="13" x="9" y="9" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ExternalLinkIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M15 3h6v6" />
      <path d="m10 14 11-11" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

function DownloadIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function ExpandIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M8 3H3v5" />
      <path d="M16 3h5v5" />
      <path d="M8 21H3v-5" />
      <path d="M16 21h5v-5" />
    </svg>
  )
}

function CloseIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m18 6-12 12" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

async function copyText(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Clipboard access can be denied on non-HTTPS classroom networks. The
      // selection-based fallback below still works in many of those browsers.
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard access is unavailable.')
  }

  const input = document.createElement('textarea')
  const previouslyFocused = document.activeElement as HTMLElement | null
  input.value = value
  input.readOnly = true
  input.setAttribute('aria-hidden', 'true')
  input.style.position = 'fixed'
  input.style.left = '-9999px'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()

  try {
    if (!document.execCommand('copy')) {
      throw new Error('Copy was not accepted by the browser.')
    }
  } finally {
    input.remove()
    previouslyFocused?.focus()
  }
}

function svgToPng(svg: SVGSVGElement, size = 1024): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const copy = svg.cloneNode(true) as SVGSVGElement
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    copy.setAttribute('width', String(size))
    copy.setAttribute('height', String(size))

    const source = new XMLSerializer().serializeToString(copy)
    const svgBlob = new Blob([source], {
      type: 'image/svg+xml;charset=utf-8',
    })
    const objectUrl = URL.createObjectURL(svgBlob)
    const image = new Image()

    const finish = () => URL.revokeObjectURL(objectUrl)

    image.onerror = () => {
      finish()
      reject(new Error('The QR image could not be rendered.'))
    }

    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')

      if (!context) {
        finish()
        reject(new Error('Canvas is unavailable in this browser.'))
        return
      }

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, size, size)
      context.imageSmoothingEnabled = false
      context.drawImage(image, 0, 0, size, size)
      finish()

      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('The QR download could not be created.'))
      }, 'image/png')
    }

    image.src = objectUrl
  })
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-forest/15 bg-white px-3.5 py-2.5 text-sm font-semibold text-forest transition hover:border-forest/30 hover:bg-mint/40 disabled:cursor-wait disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function SharePanel({
  joinCode,
  compact = false,
  className,
}: SharePanelProps) {
  const titleId = useId()
  const dialogTitleId = useId()
  const qrRef = useRef<SVGSVGElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const feedbackTimerRef = useRef<number | undefined>(undefined)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const normalizedCode = joinCode.trim().toUpperCase()
  const urlResult = useMemo(() => {
    try {
      return { url: buildJoinUrl(joinCode), error: null }
    } catch (error) {
      return {
        url: '',
        error:
          error instanceof Error
            ? error.message
            : 'The student join link could not be created.',
      }
    }
  }, [joinCode])

  const announce = useCallback((message: string, kind: Feedback['kind']) => {
    window.clearTimeout(feedbackTimerRef.current)
    setFeedback({ kind, message })
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 5000)
  }, [])

  useEffect(
    () => () => {
      window.clearTimeout(feedbackTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!isExpanded) return undefined

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsExpanded(false)
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )

      if (focusable.length === 0) return

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [isExpanded])

  const handleCopy = async () => {
    if (!urlResult.url) {
      announce(urlResult.error ?? 'The join link is unavailable.', 'error')
      return
    }

    try {
      await copyText(urlResult.url)
      announce('Student join link copied.', 'success')
    } catch {
      announce('Could not copy the link. Select the URL and copy it manually.', 'error')
    }
  }

  const handleDownload = async () => {
    if (!qrRef.current || !urlResult.url) {
      announce('The QR code is not ready to download.', 'error')
      return
    }

    setIsDownloading(true)
    try {
      const png = await svgToPng(qrRef.current)
      const href = URL.createObjectURL(png)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = `student-join-${normalizedCode || 'session'}.png`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 1000)
      announce('QR code downloaded as a PNG.', 'success')
    } catch (error) {
      announce(
        error instanceof Error
          ? error.message
          : 'The QR code could not be downloaded.',
        'error',
      )
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cx(
        'overflow-hidden rounded-3xl border border-forest/10 bg-white shadow-card',
        compact ? 'p-4' : 'p-5 sm:p-6',
        className,
      )}
    >
      <div
        className={cx(
          'grid items-center',
          compact
            ? 'gap-4'
            : 'gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-8',
        )}
      >
        <div className="mx-auto shrink-0">
          <div className="rounded-2xl border border-forest/10 bg-white p-2 shadow-sm">
            {urlResult.url ? (
              <QRCodeSVG
                ref={qrRef}
                aria-label={`QR code to join with code ${normalizedCode}`}
                bgColor="#ffffff"
                className="h-auto w-[240px] max-w-full"
                fgColor="#12352f"
                level="M"
                marginSize={4}
                role="img"
                size={240}
                title={`Join classroom ${normalizedCode}`}
                value={urlResult.url}
              />
            ) : (
              <div className="flex size-[240px] max-w-full items-center justify-center rounded-xl bg-cream p-6 text-center text-sm text-coral">
                {urlResult.error}
              </div>
            )}
          </div>
          {urlResult.url && (
            <button
              aria-label="Enlarge QR code"
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-forest/15 bg-white px-3 text-sm font-semibold text-forest transition hover:border-forest/30 hover:bg-mint"
              onClick={() => setIsExpanded(true)}
              title="Enlarge QR code"
              type="button"
            >
              <ExpandIcon /> Enlarge QR
            </button>
          )}
        </div>

        <div className="min-w-0">
          <p className="eyebrow">Invite students</p>
          <h2
            className={cx(
              'mt-1 font-display font-bold text-ink',
              compact ? 'text-xl' : 'text-2xl sm:text-3xl',
            )}
            id={titleId}
          >
            Scan or enter the code
          </h2>
          {!compact && (
            <p className="mt-2 text-sm leading-6 text-ink/65">
              Students can join instantly from any phone. No account needed.
            </p>
          )}

          <div className={cx('grid gap-3', compact ? 'mt-3' : 'mt-5 sm:grid-cols-2')}>
            <div className="rounded-2xl bg-forest px-4 py-3 text-white">
              <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">
                Join code
              </span>
              <span className="mt-0.5 block font-display text-2xl font-extrabold tracking-[0.22em]">
                {normalizedCode || '—'}
              </span>
            </div>

            <div className="min-w-0 rounded-2xl border border-forest/10 bg-cream/70 px-4 py-3">
              <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-pine">
                Student link
              </span>
              {urlResult.url ? (
                <a
                  className="mt-1 block truncate text-sm font-semibold text-forest underline decoration-forest/25 underline-offset-4 hover:decoration-forest"
                  href={urlResult.url}
                  rel="noreferrer"
                  target="_blank"
                  title={urlResult.url}
                >
                  {urlResult.url}
                </a>
              ) : (
                <span className="mt-1 block text-sm font-semibold text-coral">
                  Link unavailable
                </span>
              )}
            </div>
          </div>

          <div
            className={cx(
              'mt-4 grid gap-2',
              compact ? 'grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3',
            )}
          >
            <ActionButton disabled={!urlResult.url} onClick={() => void handleCopy()}>
              <CopyIcon /> Copy link
            </ActionButton>
            {urlResult.url ? (
              <a
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-forest/15 bg-white px-3.5 py-2.5 text-sm font-semibold text-forest transition hover:border-forest/30 hover:bg-mint/40"
                href={urlResult.url}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLinkIcon /> Open student view
              </a>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-forest/10 px-3.5 py-2.5 text-sm font-semibold text-forest/40"
              >
                <ExternalLinkIcon /> Open student view
              </span>
            )}
            <div className={compact ? 'col-span-2' : 'sm:col-span-2 xl:col-span-1'}>
              <ActionButton
                disabled={isDownloading || !urlResult.url}
                onClick={() => void handleDownload()}
              >
                <DownloadIcon />
                {isDownloading ? 'Preparing PNG…' : 'Download QR'}
              </ActionButton>
            </div>
          </div>

          <p
            aria-atomic="true"
            aria-live="polite"
            className={cx(
              'mt-3 min-h-5 text-sm font-medium',
              feedback?.kind === 'error' ? 'text-coral' : 'text-pine',
            )}
            role="status"
          >
            {feedback?.message ?? ''}
          </p>
        </div>
      </div>

      {isExpanded && urlResult.url && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-forest/90 p-4 backdrop-blur-sm sm:p-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsExpanded(false)
          }}
        >
          <div
            aria-labelledby={dialogTitleId}
            aria-modal="true"
            className="relative flex max-h-full w-full max-w-2xl flex-col items-center overflow-auto rounded-3xl bg-white p-5 text-center shadow-2xl sm:p-8"
            ref={dialogRef}
            role="dialog"
          >
            <button
              aria-label="Close enlarged QR code"
              className="absolute right-4 top-4 inline-flex size-11 items-center justify-center rounded-xl text-forest transition hover:bg-mint"
              onClick={() => setIsExpanded(false)}
              ref={closeButtonRef}
              type="button"
            >
              <CloseIcon height={22} width={22} />
            </button>

            <p className="eyebrow">Student join</p>
            <h2
              className="mt-1 pr-10 font-display text-2xl font-extrabold text-ink sm:text-3xl"
              id={dialogTitleId}
            >
              Scan to join the class
            </h2>
            <div className="mt-5 w-full max-w-[26rem] rounded-3xl border border-forest/10 bg-white p-3 shadow-card">
              <QRCodeSVG
                aria-label={`QR code to join with code ${normalizedCode}`}
                bgColor="#ffffff"
                className="h-auto w-full"
                fgColor="#12352f"
                level="M"
                marginSize={4}
                role="img"
                size={420}
                title={`Join classroom ${normalizedCode}`}
                value={urlResult.url}
              />
            </div>
            <p className="mt-5 text-sm font-semibold uppercase tracking-[0.14em] text-pine">
              Or enter code
            </p>
            <p className="mt-1 font-display text-4xl font-extrabold tracking-[0.24em] text-forest sm:text-5xl">
              {normalizedCode}
            </p>
            <button
              className="btn-primary mt-6 w-full sm:w-auto"
              onClick={() => void handleCopy()}
              type="button"
            >
              <CopyIcon /> Copy student link
            </button>
            {feedback && (
              <p
                className={cx(
                  'mt-3 text-sm font-medium',
                  feedback.kind === 'error' ? 'text-coral' : 'text-pine',
                )}
              >
                {feedback.message}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default SharePanel
