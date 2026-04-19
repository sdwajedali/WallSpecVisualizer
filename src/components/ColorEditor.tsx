import { useEffect, useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import * as Select from '@radix-ui/react-select'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { Check, ChevronDown, Pencil } from 'lucide-react'
import { hslToHex, hexToPaintName, hexToRgb, rgbToHsl, Color } from '../lib/colorUtils'
import { useRoomStore } from '../store/useRoomStore'

const PATTERN_OPTIONS = [
  { value: 'solid', label: 'Solid Color' },
  { value: 'twoTone', label: 'Two-Tone Split' },
  { value: 'stripe', label: 'Accent Stripe' }
] as const

const COLOR_FIELDS = {
  solidColor: 'Solid Color',
  upperColor: 'Upper Color',
  lowerColor: 'Lower Color',
  topColor: 'Top Color',
  middleColor: 'Middle Stripe Color',
  bottomColor: 'Bottom Color'
} as const

const HSL_KEYS = ['h', 's', 'l'] as const

type HslKey = (typeof HSL_KEYS)[number]
type HslValues = { h: number; s: number; l: number }

const defaultPalette: Color[] = [
  { hex: '#ECEFF4', name: 'Pale Cloud', hsl: rgbToHsl(236, 239, 244) },
  { hex: '#CBD5E1', name: 'Soft Cloud', hsl: rgbToHsl(203, 213, 225) },
  { hex: '#A3B5C6', name: 'Slate Mist', hsl: rgbToHsl(163, 181, 198) },
  { hex: '#8B99A4', name: 'Stone Harbor', hsl: rgbToHsl(139, 153, 164) },
  { hex: '#64748B', name: 'Ocean Slate', hsl: rgbToHsl(100, 116, 139) }
]

const createPresetColor = (hex: string, name: string): Color => {
  const [r, g, b] = hexToRgb(hex)
  return { hex, name, hsl: rgbToHsl(r, g, b) }
}

type CommonToneKey = 'light' | 'littleDark' | 'dark' | 'veryDark'

type CommonToneSection = {
  key: CommonToneKey
  label: string
  lightness: number[]
}

const COMMON_TONE_SECTIONS: CommonToneSection[] = [
  { key: 'light', label: 'Light', lightness: [0.92, 0.86] },
  { key: 'littleDark', label: 'Little Dark', lightness: [0.78, 0.72] },
  { key: 'dark', label: 'Dark', lightness: [0.64] },
  { key: 'veryDark', label: 'Very Dark', lightness: [0.52] }
]

const COMMON_WALL_HUES = Array.from({ length: 40 }, (_, index) => index * 9)
const COMMON_WALL_SATURATIONS = [0.04, 0.08, 0.12, 0.16, 0.2, 0.24]

const buildCommonColorsByTone = () => {
  const byTone = new Map<CommonToneKey, Color[]>()

  COMMON_TONE_SECTIONS.forEach((section) => {
    const colors: Color[] = []

    COMMON_WALL_HUES.forEach((hue) => {
      COMMON_WALL_SATURATIONS.forEach((saturation) => {
        section.lightness.forEach((lightness) => {
          const hex = hslToHex(hue, saturation, lightness).toUpperCase()
          const name = `${section.label} H${hue} S${Math.round(saturation * 100)} L${Math.round(lightness * 100)}`
          colors.push(createPresetColor(hex, name))
        })
      })
    })

    byTone.set(section.key, colors)
  })

  return byTone
}

const commonColorsByTone = buildCommonColorsByTone()
const commonWallPaletteSections = COMMON_TONE_SECTIONS.map((section) => ({
  key: section.key,
  label: section.label,
  colors: commonColorsByTone.get(section.key) ?? []
}))
const commonWallPalette = commonWallPaletteSections.flatMap((section) => section.colors)

type ColorFieldKey = keyof typeof COLOR_FIELDS

type SpecialArea = 'ceiling' | 'trim'

export function ColorEditor() {
  const walls = useRoomStore((state) => state.walls)
  const wallCount = useRoomStore((state) => state.wallCount)
  const activeWallId = useRoomStore((state) => state.activeWallId)
  const activeElement = useRoomStore((state) => state.activeElement)
  const ceilingColor = useRoomStore((state) => state.ceilingColor)
  const trimColor = useRoomStore((state) => state.trimColor)
  const setWallPattern = useRoomStore((state) => state.setWallPattern)
  const setWallColorField = useRoomStore((state) => state.setWallColorField)
  const setSplitPercentage = useRoomStore((state) => state.setSplitPercentage)
  const setStripePercentage = useRoomStore((state) => state.setStripePercentage)
  const setCeilingColor = useRoomStore((state) => state.setCeilingColor)
  const setTrimColor = useRoomStore((state) => state.setTrimColor)

  const activeWall = useMemo(
    () => walls.find((wall) => wall.id === activeWallId) ?? null,
    [walls, activeWallId]
  )

  const palette = useMemo(() => {
    if (activeWall?.extractedPalette.length) {
      return activeWall.extractedPalette
    }
    const combined = walls.slice(0, wallCount).flatMap((wall) => wall.extractedPalette)
    return combined.length ? combined : defaultPalette
  }, [activeWall, walls, wallCount])

  const [editingKey, setEditingKey] = useState<ColorFieldKey | null>(null)
  const [editingSpecial, setEditingSpecial] = useState<SpecialArea | null>(null)
  const [editorHsl, setEditorHsl] = useState<HslValues>({ h: 0, s: 0, l: 0 })
  const [pickerTab, setPickerTab] = useState<'wheel' | 'hsl'>('wheel')
  const [openCommonSection, setOpenCommonSection] = useState<CommonToneKey>('light')

  useEffect(() => {
    if (editingKey && activeWall) {
      const current = activeWall[editingKey] as Color | null
      if (current) {
        setEditorHsl(current.hsl)
      }
    }
  }, [editingKey, activeWall])

  useEffect(() => {
    if (editingSpecial === 'ceiling' && ceilingColor) {
      setEditorHsl(ceilingColor.hsl)
    }
    if (editingSpecial === 'trim' && trimColor) {
      setEditorHsl(trimColor.hsl)
    }
  }, [editingSpecial, ceilingColor, trimColor])

  const getFieldColor = (key: ColorFieldKey) => {
    if (!activeWall) return defaultPalette[0]
    return (activeWall[key] as Color) ?? defaultPalette[0]
  }

  const handlePaletteSelect = (field: ColorFieldKey, color: Color) => {
    if (!activeWall) return
    setWallColorField(activeWall.id, field, color)
  }

  const handleHslUpdate = (field: ColorFieldKey, next: Partial<HslValues>) => {
    if (!activeWall) return
    const updated = { ...editorHsl, ...next }
    setEditorHsl(updated)
    const hex = hslToHex(updated.h, updated.s, updated.l)
    setWallColorField(activeWall.id, field, {
      hex,
      name: hexToPaintName(hex),
      hsl: updated
    })
  }

  const handleSpecialHslUpdate = (area: SpecialArea, next: Partial<HslValues>) => {
    const updated = { ...editorHsl, ...next }
    setEditorHsl(updated)
    const hex = hslToHex(updated.h, updated.s, updated.l)
    const color = { hex, name: hexToPaintName(hex), hsl: updated }
    if (area === 'ceiling') {
      setCeilingColor(color)
    } else {
      setTrimColor(color)
    }
  }

  const handleHexChange = (field: ColorFieldKey, hex: string) => {
    if (!activeWall) return
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return
    const [r, g, b] = hexToRgb(hex)
    const hsl = rgbToHsl(r, g, b)
    setEditorHsl(hsl)
    setWallColorField(activeWall.id, field, { hex: hex.toUpperCase(), name: hexToPaintName(hex), hsl })
  }

  const handleSpecialHexChange = (area: SpecialArea, hex: string) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return
    const [r, g, b] = hexToRgb(hex)
    const hsl = rgbToHsl(r, g, b)
    setEditorHsl(hsl)
    const color = { hex: hex.toUpperCase(), name: hexToPaintName(hex), hsl }
    if (area === 'ceiling') {
      setCeilingColor(color)
    } else {
      setTrimColor(color)
    }
  }

  const resetToExtracted = (field: ColorFieldKey) => {
    if (!activeWall) return
    const paletteIndex = field === 'solidColor' ? 0 : field === 'upperColor' || field === 'topColor' ? 0 : field === 'lowerColor' ? 1 : field === 'middleColor' ? 1 : 2
    const extracted = palette[paletteIndex] ?? palette[0]
    setWallColorField(activeWall.id, field, extracted)
    setEditorHsl(extracted.hsl)
  }

  const combinedPalette = useMemo(() => {
    const unique = new Map<string, Color>()
    palette.forEach((color) => unique.set(color.hex, color))
    return Array.from(unique.values()).slice(0, 8)
  }, [palette])

  const specialColor = editingSpecial === 'ceiling' ? ceilingColor : editingSpecial === 'trim' ? trimColor : null

  const renderColorSwatches = (
    colors: Color[],
    selectedHex: string,
    onSelect: (color: Color) => void,
    sizeClass = 'h-10 w-10 rounded-2xl',
    containerClass = 'flex flex-wrap gap-2'
  ) => (
    <div className={containerClass}>
      {colors.map((color) => (
        <button
          key={`${color.hex}-${color.name}`}
          type="button"
          title={`${color.name} (${color.hex})`}
          onClick={() => onSelect(color)}
          className={`${sizeClass} border ${selectedHex === color.hex ? 'border-sky-500 ring-2 ring-sky-200' : 'border-slate-200'}`}
          style={{ backgroundColor: color.hex }}
        />
      ))}
    </div>
  )

  const renderCommonSectionPanels = (
    selectedHex: string,
    onSelect: (color: Color) => void,
    gridClass = 'grid max-h-44 grid-cols-10 gap-2 overflow-y-auto pr-1',
    swatchSizeClass = 'h-8 w-8 rounded-xl'
  ) => (
    <div className="space-y-2">
      {commonWallPaletteSections.map((section) => {
        const isOpen = openCommonSection === section.key
        return (
          <div key={section.key} className="rounded-2xl border border-slate-200 bg-white p-2">
            <button
              type="button"
              onClick={() => setOpenCommonSection(section.key)}
              className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left hover:bg-slate-50"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{section.label}</span>
              <span className="text-[11px] text-slate-500">{section.colors.length} colors</span>
            </button>
            {isOpen ? renderColorSwatches(section.colors, selectedHex, onSelect, swatchSizeClass, gridClass) : null}
          </div>
        )
      })}
    </div>
  )

  const renderHslPopover = (field: ColorFieldKey, label: string) => {
    const color = getFieldColor(field)
    return (
      <Popover.Root open={editingKey === field} onOpenChange={(open) => setEditingKey(open ? field : null)}>
        <Popover.Trigger asChild>
          <button type="button" className="text-sm text-sky-600 hover:underline flex items-center gap-1">
            <Pencil className="h-4 w-4" />
            Edit
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content sideOffset={8} className="z-50 w-[320px] rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800">{label}</div>
                <div className="text-xs text-slate-500">{color.hex} · {color.name}</div>
              </div>
            </div>
            <div className="mb-3 flex gap-1 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setPickerTab('wheel')}
                className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition ${pickerTab === 'wheel' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Color Wheel
              </button>
              <button
                type="button"
                onClick={() => setPickerTab('hsl')}
                className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition ${pickerTab === 'hsl' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                HSL Sliders
              </button>
            </div>
            {pickerTab === 'wheel' ? (
              <div className="space-y-3">
                <HexColorPicker color={color.hex} onChange={(hex) => handleHexChange(field, hex)} style={{ width: '100%' }} />
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-widest text-slate-500">HEX</span>
                  <HexColorInput
                    color={color.hex}
                    onChange={(hex) => handleHexChange(field, hex)}
                    prefixed
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
              </div>
            ) : (
              <>
                {HSL_KEYS.map((prop) => (
                  <div key={prop} className="space-y-1 pb-3">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
                      <span>{prop.toUpperCase()}</span>
                      <span>{prop === 'h' ? Math.round(editorHsl.h) : Math.round(editorHsl[prop] * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={prop === 'h' ? 0 : 0}
                      max={prop === 'h' ? 360 : 1}
                      step={prop === 'h' ? 1 : 0.01}
                      value={editorHsl[prop]}
                      onChange={(event) => handleHslUpdate(field, { [prop]: Number(event.target.value) })}
                      className="w-full"
                    />
                  </div>
                ))}
              </>
            )}
            <button
              type="button"
              onClick={() => resetToExtracted(field)}
              className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Reset to Extracted
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    )
  }

  const renderSpecialHslPopover = (area: SpecialArea, label: string) => (
    <Popover.Root open={editingSpecial === area} onOpenChange={(open) => setEditingSpecial(open ? area : null)}>
      <Popover.Trigger asChild>
        <button type="button" className="text-sm text-sky-600 hover:underline flex items-center gap-1">
          <Pencil className="h-4 w-4" />
          Edit
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={8} className="z-50 w-[320px] rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">{label}</div>
              <div className="text-xs text-slate-500">{specialColor?.hex} · {specialColor?.name}</div>
            </div>
          </div>
          <div className="mb-3 flex gap-1 rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setPickerTab('wheel')}
              className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition ${pickerTab === 'wheel' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Color Wheel
            </button>
            <button
              type="button"
              onClick={() => setPickerTab('hsl')}
              className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition ${pickerTab === 'hsl' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              HSL Sliders
            </button>
          </div>
          {pickerTab === 'wheel' ? (
            <div className="space-y-3">
              <HexColorPicker color={specialColor?.hex ?? '#ffffff'} onChange={(hex) => handleSpecialHexChange(area, hex)} style={{ width: '100%' }} />
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest text-slate-500">HEX</span>
                <HexColorInput
                  color={specialColor?.hex ?? '#ffffff'}
                  onChange={(hex) => handleSpecialHexChange(area, hex)}
                  prefixed
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>
            </div>
          ) : (
            <>
              {HSL_KEYS.map((prop) => (
                <div key={prop} className="space-y-1 pb-3">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
                    <span>{prop.toUpperCase()}</span>
                    <span>{prop === 'h' ? Math.round(editorHsl.h) : Math.round(editorHsl[prop] * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={prop === 'h' ? 0 : 0}
                    max={prop === 'h' ? 360 : 1}
                    step={prop === 'h' ? 1 : 0.01}
                    value={editorHsl[prop]}
                    onChange={(event) => handleSpecialHslUpdate(area, { [prop]: Number(event.target.value) })}
                    className="w-full"
                  />
                </div>
              ))}
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Pattern & Color Editor</h2>
        <p className="mt-1 text-xs text-slate-500">Edit the active wall, ceiling, or trim using extracted paint colors.</p>
      </div>

      {activeElement === 'wall' && activeWall ? (
        <div className="space-y-5">
          <div>
            <label className="text-sm font-semibold text-slate-700">Pattern</label>
            <Select.Root value={activeWall.pattern} onValueChange={(value) => setWallPattern(activeWall.id, value as typeof activeWall.pattern)}>
              <Select.Trigger className="mt-2 flex w-full items-center justify-between rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200">
                <Select.Value />
                <Select.Icon>
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="z-50 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
                  <Select.Viewport className="p-2">
                    {PATTERN_OPTIONS.map((option) => (
                      <Select.Item
                        key={option.value}
                        value={option.value}
                        className="relative flex cursor-default select-none items-center rounded-2xl px-3 py-2 text-sm text-slate-900 outline-none transition hover:bg-slate-100 data-[highlighted]:bg-slate-100"
                      >
                        <Select.ItemText>{option.label}</Select.ItemText>
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

          {activeWall.pattern === 'solid' && (
            <div className="space-y-4">
              <label className="text-sm font-semibold text-slate-700">Solid Color</label>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">From Photo</div>
                {renderColorSwatches(combinedPalette, getFieldColor('solidColor').hex, (color) => handlePaletteSelect('solidColor', color), 'h-12 w-12 rounded-2xl')}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Common Wall Colors · {commonWallPalette.length}</div>
                {renderCommonSectionPanels(
                  getFieldColor('solidColor').hex,
                  (color) => handlePaletteSelect('solidColor', color),
                  'grid max-h-52 grid-cols-10 gap-2 overflow-y-auto pr-1',
                  'h-8 w-8 rounded-xl'
                )}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Adjust Solid Color</span>
                  {renderHslPopover('solidColor', 'Solid Color')}
                </div>
              </div>
            </div>
          )}

          {activeWall.pattern === 'twoTone' && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {(['upperColor', 'lowerColor'] as ColorFieldKey[]).map((field) => {
                  const color = getFieldColor(field)
                  return (
                    <div key={field} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-700">{COLOR_FIELDS[field]}</div>
                          <div className="text-xs text-slate-500">{color.hex} · {color.name}</div>
                        </div>
                        {renderHslPopover(field, COLOR_FIELDS[field])}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">From Photo</div>
                          {renderColorSwatches(combinedPalette, color.hex, (paletteColor) => handlePaletteSelect(field, paletteColor))}
                        </div>
                        <div>
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Common Wall Colors · {commonWallPalette.length}</div>
                          {renderCommonSectionPanels(
                            color.hex,
                            (paletteColor) => handlePaletteSelect(field, paletteColor),
                            'grid max-h-44 grid-cols-8 gap-2 overflow-y-auto pr-1',
                            'h-8 w-8 rounded-xl'
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <label className="text-sm font-semibold text-slate-700">Split Percentage</label>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={activeWall.splitPercentage}
                  onChange={(event) => setSplitPercentage(activeWall.id, Number(event.target.value))}
                  className="mt-3 w-full"
                />
                <div className="mt-2 text-xs text-slate-600">Upper: {activeWall.splitPercentage}% / Lower: {100 - activeWall.splitPercentage}%</div>
              </div>
            </div>
          )}

          {activeWall.pattern === 'stripe' && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                {(['topColor', 'middleColor', 'bottomColor'] as ColorFieldKey[]).map((field) => {
                  const color = getFieldColor(field)
                  return (
                    <div key={field} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-700">{COLOR_FIELDS[field]}</div>
                        {renderHslPopover(field, COLOR_FIELDS[field])}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">From Photo</div>
                          {renderColorSwatches(combinedPalette, color.hex, (paletteColor) => handlePaletteSelect(field, paletteColor))}
                        </div>
                        <div>
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Common Wall Colors · {commonWallPalette.length}</div>
                          {renderCommonSectionPanels(
                            color.hex,
                            (paletteColor) => handlePaletteSelect(field, paletteColor),
                            'grid max-h-44 grid-cols-8 gap-2 overflow-y-auto pr-1',
                            'h-8 w-8 rounded-xl'
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <label className="text-sm font-semibold text-slate-700">Stripe Width</label>
                <input
                  type="range"
                  min={5}
                  max={35}
                  value={activeWall.stripePercentage}
                  onChange={(event) => setStripePercentage(activeWall.id, Number(event.target.value))}
                  className="mt-3 w-full"
                />
                <div className="mt-2 text-xs text-slate-600">Middle stripe width: {activeWall.stripePercentage}%</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-700">Ceiling / Trim Palette</div>
            <p className="mt-2 text-xs text-slate-500">Choose a neutral or extracted wall color for finish elements.</p>
          </div>
          {activeElement === 'ceiling' ? (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">From Photo</div>
                {renderColorSwatches(combinedPalette, ceilingColor?.hex ?? '', (color) => setCeilingColor(color), 'h-12 w-12 rounded-2xl')}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Common Wall Colors · {commonWallPalette.length}</div>
                {renderCommonSectionPanels(
                  ceilingColor?.hex ?? '',
                  (color) => setCeilingColor(color),
                  'grid max-h-52 grid-cols-10 gap-2 overflow-y-auto pr-1',
                  'h-8 w-8 rounded-xl'
                )}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-800">Selected Ceiling</div>
                    <div className="text-xs text-slate-500">{ceilingColor?.hex} · {ceilingColor?.name}</div>
                  </div>
                  {renderSpecialHslPopover('ceiling', 'Ceiling')}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">From Photo</div>
                {renderColorSwatches(combinedPalette, trimColor?.hex ?? '', (color) => setTrimColor(color), 'h-12 w-12 rounded-2xl')}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Common Wall Colors · {commonWallPalette.length}</div>
                {renderCommonSectionPanels(
                  trimColor?.hex ?? '',
                  (color) => setTrimColor(color),
                  'grid max-h-52 grid-cols-10 gap-2 overflow-y-auto pr-1',
                  'h-8 w-8 rounded-xl'
                )}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-800">Selected Trim</div>
                    <div className="text-xs text-slate-500">{trimColor?.hex} · {trimColor?.name}</div>
                  </div>
                  {renderSpecialHslPopover('trim', 'Trim')}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
