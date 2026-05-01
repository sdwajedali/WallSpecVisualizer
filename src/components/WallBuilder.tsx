import { useState } from 'react'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { useRoomStore } from '../store/useRoomStore'

const ROOMS = ['Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Home Office', 'Dining Room', 'Kids Room']
const MAX_WALLS = 4

export function WallBuilder() {
  const [isOpen, setIsOpen] = useState(false)
  const roomType = useRoomStore((state) => state.roomType)
  const wallCount = useRoomStore((state) => state.wallCount)
  const setWallCount = useRoomStore((state) => state.setWallCount)
  const setRoomType = useRoomStore((state) => state.setRoomType)

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Room Configuration</h2>
          <p className="mt-1 text-xs text-slate-500">Choose the room type and number of wall surfaces.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
            1–{MAX_WALLS} walls
          </div>
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            aria-expanded={isOpen}
            aria-label="Toggle room configuration"
          >
            {isOpen ? 'Hide' : 'Settings'}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Room Type</label>
            <Select.Root value={roomType} onValueChange={setRoomType}>
              <Select.Trigger className="mt-2 flex w-full items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200">
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
              <span className="text-xs text-slate-500">1 min · 4 max</span>
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
      )}
    </div>
  )
}
