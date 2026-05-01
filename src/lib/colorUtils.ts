export interface Color {
  hex: string
  name: string
  hsl: {
    h: number
    s: number
    l: number
  }
}

const paintNameMap: Record<string, string> = {
  '#F8F4EB': 'Alabaster',
  '#2C3E50': 'Hale Navy',
  '#C5A48A': 'Cinnamon Slate',
  '#F4E1D2': 'Blush Linen',
  '#E6E0D4': 'Ivory Whisper',
  '#B8C3D3': 'Coastal Fog',
  '#A7B4A0': 'Sage Retreat',
  '#5A6F74': 'Graphite Moss',
  '#8B5E3C': 'Leathered Oak',
  '#D9C1A5': 'Warm Sandstone',
  '#F2D3C5': 'Peach Fizz',
  '#D0C8C4': 'Driftwood Gray',
  '#64748B': 'Stormy Sky',
  '#F1F3F5': 'Pure Linen',
  '#BEA793': 'Natural Clay',
  '#E3DAC9': 'Calm Khaki',
  '#4A5A6A': 'Midnight Harbor',
  '#C2A18D': 'Maple Sugar',
  '#6A7988': 'Slate Harbor',
  '#E8F1F5': 'Aqua Mist',
  '#927D64': 'Antique Bronze',
  '#F6E8D7': 'Creamed Almond',
  '#B1B8BE': 'Quiet Pewter',
  '#D7B8AA': 'Soft Terracotta',
  '#E7DED3': 'Whisper Beige',
  '#2F4F4F': 'Deep Teal',
  '#E1D8C7': 'Vanilla Bean',
  '#97795B': 'Rustic Taupe',
  '#F3E6DA': 'Porcelain Glow',
  '#B4A79B': 'Vintage Linen',
  '#6699A1': 'Seaside Slate',
  '#EAC9B2': 'Rosewood Mist',
  '#C8D7D5': 'Minted Glass',
  '#A69A82': 'Hilltop Beige',
  '#D2C7BA': 'Soft Putty',
  '#F5F0EC': 'Cloud Cover',
  '#8B8E91': 'Smoke Trail',
  '#D1BFA7': 'Pale Chestnut',
  '#B0C5B8': 'Moss Garden',
  '#E9E0D7': 'Powdered Shell'
}

const normalizeHex = (hex: string): string => {
  const cleaned = hex.trim().toUpperCase()
  if (/^#?[0-9A-F]{3}$/.test(cleaned)) {
    const r = cleaned[cleaned.length - 3]
    const g = cleaned[cleaned.length - 2]
    const b = cleaned[cleaned.length - 1]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return cleaned.startsWith('#') ? cleaned : `#${cleaned}`
}

export const hexToPaintName = (hex: string): string => {
  const normalized = normalizeHex(hex)
  if (paintNameMap[normalized]) {
    return paintNameMap[normalized]
  }
  const { h, s, l } = rgbToHsl(...hexToRgb(normalized))
  const lightness = Math.round(l * 100)
  const saturation = Math.round(s * 100)
  const hue = Math.round(h)

  const tone = hue < 30 || hue >= 330 ? 'Warm' : hue < 90 ? 'Golden' : hue < 150 ? 'Sage' : hue < 210 ? 'Ocean' : hue < 270 ? 'Violet' : 'Earth'
  const depth = lightness > 80 ? 'Whisper' : lightness < 25 ? 'Deep' : saturation < 20 ? 'Muted' : 'Soft'
  const finish = hue < 60 ? 'Sand' : hue < 120 ? 'Leaf' : hue < 180 ? 'Sky' : hue < 240 ? 'Stone' : hue < 300 ? 'Plum' : 'Taupe'
  return `${depth} ${tone} ${finish}`
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = normalizeHex(hex)
  const value = normalized.slice(1)
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return [r, g, b]
}

export const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (value: number) => value.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

export const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const delta = max - min
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / delta + (g < b ? 6 : 0)) * 60
        break
      case g:
        h = ((b - r) / delta + 2) * 60
        break
      case b:
        h = ((r - g) / delta + 4) * 60
        break
    }
  }

  return { h, s, l }
}

export const hslToHex = (h: number, s: number, l: number): string => {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))
  const c = (1 - Math.abs(2 * l - 1)) * s
  const m = l - c / 2
  const hK = h / 360
  const r = Math.round((hue2rgb(m, m + c, hK + 1 / 3)) * 255)
  const g = Math.round((hue2rgb(m, m + c, hK)) * 255)
  const b = Math.round((hue2rgb(m, m + c, hK - 1 / 3)) * 255)
  return rgbToHex(r, g, b)
}

export const getContrastTextColor = (hexColor: string): string => {
  const [r, g, b] = hexToRgb(hexColor)
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#FFFFFF'
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

