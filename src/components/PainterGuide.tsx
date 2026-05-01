import { useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { toPng } from 'html-to-image'
import { useRoomStore } from '../store/useRoomStore'

function ColorRow({ label, hex, name }: { label: string; hex: string; name: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-5 w-5 flex-shrink-0 rounded border border-slate-200 shadow-sm"
        style={{ backgroundColor: hex }}
      />
      <span className="font-mono text-xs text-slate-500">{hex}</span>
      <span className="text-slate-700">–</span>
      <span className="text-slate-700">{name}</span>
      <span className="ml-auto text-xs text-slate-400">{label}</span>
    </div>
  )
}

export function PainterGuide() {
  const roomType = useRoomStore((state) => state.roomType)
  const walls = useRoomStore((state) => state.walls)
  const wallCount = useRoomStore((state) => state.wallCount)
  const ceilingColor = useRoomStore((state) => state.ceilingColor)
  const trimColor = useRoomStore((state) => state.trimColor)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [downloadStatus, setDownloadStatus] = useState('')
  const [isPanelOpen, setIsPanelOpen] = useState(false)

  const guideText = useMemo(() => {
    const lines: string[] = []
    lines.push(`OFFICIAL PAINTER'S GUIDE - ${roomType}`)
    lines.push('')

    walls.slice(0, wallCount).forEach((wall, index) => {
      if (wall.pattern === 'solid') {
        const color = wall.solidColor
        lines.push(`Wall ${index + 1}: Full Wall: ${color?.hex ?? '#FFFFFF'} - ${color?.name ?? 'TBD'}`)
      } else if (wall.pattern === 'twoTone') {
        const upper = wall.upperColor
        const lower = wall.lowerColor
        lines.push(
          `Wall ${index + 1}: Two-Tone Split: Upper ${wall.splitPercentage}%: ${upper?.hex ?? '#FFFFFF'} - ${upper?.name ?? 'TBD'} / Lower ${100 - wall.splitPercentage}%: ${lower?.hex ?? '#FFFFFF'} - ${lower?.name ?? 'TBD'}`
        )
      } else {
        const top = wall.topColor
        const middle = wall.middleColor
        const bottom = wall.bottomColor
        const middlePct = wall.stripePercentage
        const sidePct = (100 - middlePct) / 2
        lines.push(
          `Wall ${index + 1}: Accent Stripe: Top ${sidePct}%: ${top?.hex ?? '#FFFFFF'} - ${top?.name ?? 'TBD'} / Middle ${middlePct}% Stripe: ${middle?.hex ?? '#FFFFFF'} - ${middle?.name ?? 'TBD'} / Bottom ${sidePct}%: ${bottom?.hex ?? '#FFFFFF'} - ${bottom?.name ?? 'TBD'}`
        )
      }
    })

    lines.push('')
    lines.push(`Ceiling: ${ceilingColor?.hex ?? '#FFFFFF'} - ${ceilingColor?.name ?? 'TBD'}`)
    lines.push(`Baseboards/Trim: ${trimColor?.hex ?? '#FFFFFF'} - ${trimColor?.name ?? 'TBD'}`)
    return lines.join('\n')
  }, [roomType, walls, wallCount, ceilingColor, trimColor])

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(guideText)
    setCopyStatus('Copied!')
    window.setTimeout(() => setCopyStatus(''), 2000)
  }

  const downloadImage = async () => {
    if (!cardRef.current) return
    setDownloadStatus('Saving...')
    try {
      const dataUrl = await toPng(cardRef.current, { cacheBust: true })
      const link = document.createElement('a')
      link.download = 'painters-guide.png'
      link.href = dataUrl
      link.click()
      setDownloadStatus('Downloaded')
    } catch (error) {
      console.error(error)
      setDownloadStatus('Failed')
    } finally {
      window.setTimeout(() => setDownloadStatus(''), 2000)
    }
  }

  return (
    <div className="sticky top-6 space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-soft">
        <button
          type="button"
          onClick={() => setIsPanelOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-2"
        >
          <div className="text-left">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Painter&apos;s Specification Sheet</h2>
            <p className="mt-0.5 text-xs text-slate-500">Copy or download the finalized contractor reference.</p>
          </div>
          <ChevronDown
            className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200 ${isPanelOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {isPanelOpen && (
          <div className="mt-4 space-y-4">
          <div ref={cardRef} className="rounded-[2rem] border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700">
          <div className="mb-4 text-xs uppercase tracking-[0.24em] text-slate-500">OFFICIAL PAINTER&apos;S GUIDE</div>
          <div className="mb-4 text-base font-semibold text-slate-900">{roomType}</div>
          <div className="space-y-3 text-sm text-slate-700">
            {walls.slice(0, wallCount).map((wall, index) => (
              <div key={index}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Wall {index + 1}</div>
                {wall.pattern === 'solid' && (
                  <ColorRow label="Full Wall" hex={wall.solidColor?.hex ?? '#FFFFFF'} name={wall.solidColor?.name ?? 'TBD'} />
                )}
                {wall.pattern === 'twoTone' && (
                  <div className="space-y-1">
                    <ColorRow label={`Upper ${wall.splitPercentage}%`} hex={wall.upperColor?.hex ?? '#FFFFFF'} name={wall.upperColor?.name ?? 'TBD'} />
                    <ColorRow label={`Lower ${100 - wall.splitPercentage}%`} hex={wall.lowerColor?.hex ?? '#FFFFFF'} name={wall.lowerColor?.name ?? 'TBD'} />
                  </div>
                )}
                {wall.pattern === 'stripe' && (
                  <div className="space-y-1">
                    <ColorRow label={`Top ${((100 - wall.stripePercentage) / 2).toFixed(0)}%`} hex={wall.topColor?.hex ?? '#FFFFFF'} name={wall.topColor?.name ?? 'TBD'} />
                    <ColorRow label={`Stripe ${wall.stripePercentage}%`} hex={wall.middleColor?.hex ?? '#FFFFFF'} name={wall.middleColor?.name ?? 'TBD'} />
                    <ColorRow label={`Bottom ${((100 - wall.stripePercentage) / 2).toFixed(0)}%`} hex={wall.bottomColor?.hex ?? '#FFFFFF'} name={wall.bottomColor?.name ?? 'TBD'} />
                  </div>
                )}
              </div>
            ))}
            <div className="border-t border-slate-100 pt-3 space-y-1">
              <ColorRow label="Ceiling" hex={ceilingColor?.hex ?? '#FFFFFF'} name={ceilingColor?.name ?? 'TBD'} />
              <ColorRow label="Baseboards/Trim" hex={trimColor?.hex ?? '#FFFFFF'} name={trimColor?.name ?? 'TBD'} />
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={copyToClipboard}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            {copyStatus || 'Copy Text'}
          </button>
          <button
            type="button"
            onClick={downloadImage}
            className="rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
          >
            {downloadStatus || 'Download PNG'}
          </button>
        </div>
        </div>
        )}
      </div>
    </div>
  )
}
