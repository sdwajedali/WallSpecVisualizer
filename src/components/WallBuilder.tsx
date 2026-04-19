import { useCallback, useState } from 'react'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { extractColorsFromImage, type Color } from '../lib/colorUtils'
import { useRoomStore, type WallConfig } from '../store/useRoomStore'

const ROOMS = ['Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Home Office', 'Dining Room', 'Kids Room']
const MAX_WALLS = 12

interface WallCardProps {
  wall: WallConfig
  active: boolean
  onSelect: () => void
  onUpload: (file: File) => void
  isProcessing: boolean
}

function WallCard({ wall, active, onSelect, onUpload, isProcessing }: WallCardProps) {
  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'image/*': [] },
    maxFiles: 1,
    onDrop: (files) => {
      const file = files[0]
      if (file) onUpload(file)
    }
  })

  return (
    <div
      onClick={onSelect}
      className={`group w-[168px] flex-none rounded-3xl border p-3 transition ${active ? 'border-sky-500 ring-2 ring-sky-200 bg-sky-50/60' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold capitalize text-slate-900">{wall.id.replace('-', ' ')}</h3>
          <p className="text-[11px] leading-4 text-slate-500">Click to edit wall colors.</p>
        </div>
        {isProcessing ? <span className="text-[11px] text-sky-600">Analyzing...</span> : null}
      </div>

      <div
        {...getRootProps()}
        className="mt-3 flex h-24 flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white p-3 text-center transition hover:border-sky-400"
      >
        <input {...getInputProps()} />
        {wall.photoPreviewUrl ? (
          <img src={wall.photoPreviewUrl} alt="Wall preview" className="h-full w-full rounded-xl object-cover" />
        ) : (
          <div className="space-y-1 text-xs text-slate-500">
            <p>Drop image</p>
            <p className="text-[11px]">PNG, JPG, JPEG</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(wall.extractedPalette.length > 0 ? wall.extractedPalette : [{ hex: '#CBD5E1', name: 'Soft Cloud', hsl: { h: 210, s: 0.16, l: 0.82 } }] as Color[])
          .slice(0, 4)
          .map((color) => (
            <div key={color.hex} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
              <span className="h-3.5 w-3.5 rounded-full border border-slate-200" style={{ backgroundColor: color.hex }} />
              <span className="max-w-[80px] truncate">{color.name}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

export function WallBuilder() {
  const roomType = useRoomStore((state) => state.roomType)
  const wallCount = useRoomStore((state) => state.wallCount)
  const walls = useRoomStore((state) => state.walls)
  const activeWallId = useRoomStore((state) => state.activeWallId)
  const setWallCount = useRoomStore((state) => state.setWallCount)
  const setActiveWallId = useRoomStore((state) => state.setActiveWallId)
  const updateWallPhoto = useRoomStore((state) => state.updateWallPhoto)
  const setWallPalette = useRoomStore((state) => state.setWallPalette)
  const setRoomType = useRoomStore((state) => state.setRoomType)
  const [processingWallId, setProcessingWallId] = useState<string | null>(null)

  const handleDrop = useCallback(
    async (wallId: string, file: File) => {
      const previewUrl = URL.createObjectURL(file)
      updateWallPhoto(wallId, file, previewUrl)
      setProcessingWallId(wallId)
      try {
        const palette = await extractColorsFromImage(file)
        setWallPalette(wallId, palette)
      } catch (error) {
        console.error('Color extraction failed', error)
      } finally {
        setProcessingWallId(null)
      }
    },
    [setWallPalette, updateWallPhoto]
  )

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Room Configuration</h2>
              <p className="mt-1 text-xs text-slate-500">Choose the room type and number of wall surfaces to lay out.</p>
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
              1–{MAX_WALLS} walls
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Room Type</label>
              <Select.Root value={roomType} onValueChange={setRoomType}>
                <Select.Trigger className="mt-2 flex w-full items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200">
                  <Select.Value placeholder="Select room" />
                  <Select.Icon>
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="z-50 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
                    <Select.Viewport className="p-2">
                      {ROOMS.map((room) => (
                        <Select.Item
                          key={room}
                          value={room}
                          className="relative flex cursor-default select-none items-center rounded-2xl px-3 py-2 text-sm text-slate-900 outline-none transition hover:bg-slate-100 data-[highlighted]:bg-slate-100"
                        >
                          <Select.ItemText>{room}</Select.ItemText>
                          <Select.ItemIndicator className="absolute right-3">
                            <Check className="h-4 w-4 text-slate-900" />
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-slate-700">Wall Count</label>
                <span className="text-xs text-slate-500">Default 4 visible</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                <button
                  type="button"
                  onClick={() => setWallCount(Math.max(1, wallCount - 1))}
                  className="rounded-full bg-slate-100 px-3 py-1 text-slate-900 transition hover:bg-slate-200"
                >
                  −
                </button>
                <span className="min-w-[2.5rem] text-center text-base font-semibold text-slate-900">{wallCount}</span>
                <button
                  type="button"
                  onClick={() => setWallCount(Math.min(MAX_WALLS, wallCount + 1))}
                  className="rounded-full bg-slate-100 px-3 py-1 text-slate-900 transition hover:bg-slate-200"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Wall Builder</h2>
              <p className="mt-1 text-xs text-slate-500">Upload each wall photo here. Four thumbnails fit comfortably, and extra walls scroll horizontally.</p>
            </div>
            <div className="text-xs text-slate-500">
              Active wall: <span className="font-semibold text-slate-700">{activeWallId?.replace('-', ' ') ?? 'None'}</span>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3 pr-1">
              {walls.slice(0, wallCount).map((wall) => (
                <WallCard
                  key={wall.id}
                  wall={wall}
                  active={wall.id === activeWallId}
                  isProcessing={processingWallId === wall.id}
                  onSelect={() => setActiveWallId(wall.id)}
                  onUpload={(file) => handleDrop(wall.id, file)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
