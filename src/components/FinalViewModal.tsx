import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { type WallConfig } from '../store/useRoomStore'
import { type Color, getContrastTextColor } from '../lib/colorUtils'

interface FinalViewModalProps {
  open: boolean
  onClose: () => void
  walls: WallConfig[]
  ceilingColor: Color | null
  trimColor: Color | null
  layoutMode: 'horizontal' | 'vertical'
  imageMap: Record<string, HTMLImageElement | undefined>
}

type FinalViewMode = 'unfolded' | 'threeD'

export const ANGLE_PRESETS: Array<{ label: string; angle: number }> = [
  { label: 'Front', angle: 0 },
  { label: 'Left Corner', angle: -60 },
  { label: 'Right Corner', angle: 60 },
  { label: 'Back', angle: 180 }
]

const WALL_WIDTH = 220
const WALL_HEIGHT = 180
const CEILING_HEIGHT = 40
const TRIM_HEIGHT = 28
const GAP = 18
const PADDING = 24
const LABEL_HEIGHT = 30

const THREE_D_BASE_WIDTH = 980
const THREE_D_BASE_HEIGHT = 620
const THREE_D_PADDING = 36

const getWallPaintHex = (wall: WallConfig, py: number, height: number): string => {
  if (wall.pattern === 'solid') return wall.solidColor?.hex ?? '#808080'
  if (wall.pattern === 'twoTone') {
    const splitY = (height * wall.splitPercentage) / 100
    return py < splitY ? (wall.upperColor?.hex ?? '#808080') : (wall.lowerColor?.hex ?? '#808080')
  }
  const stripeH = Math.max(1, (height * wall.stripePercentage) / 100)
  const topH = Math.max(1, (height * (50 - wall.stripePercentage / 2)) / 100)
  if (py < topH) return wall.topColor?.hex ?? '#808080'
  if (py < topH + stripeH) return wall.middleColor?.hex ?? '#808080'
  return wall.bottomColor?.hex ?? '#808080'
}

const colorDistance = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number =>
  Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)

const computeAdaptiveTolerance = (data: Uint8ClampedArray, width: number, height: number): number => {
  const samples: Array<[number, number, number]> = []
  const step = 4

  for (let x = 0; x < width; x += step) {
    const ti = (0 * width + x) * 4
    const bi = ((height - 1) * width + x) * 4
    samples.push([data[ti], data[ti + 1], data[ti + 2]])
    samples.push([data[bi], data[bi + 1], data[bi + 2]])
  }
  for (let y = 0; y < height; y += step) {
    const li = (y * width + 0) * 4
    const ri = (y * width + (width - 1)) * 4
    samples.push([data[li], data[li + 1], data[li + 2]])
    samples.push([data[ri], data[ri + 1], data[ri + 2]])
  }

  if (samples.length === 0) return 85

  let avgR = 0
  let avgG = 0
  let avgB = 0
  for (const [r, g, b] of samples) {
    avgR += r
    avgG += g
    avgB += b
  }
  avgR /= samples.length
  avgG /= samples.length
  avgB /= samples.length

  const distances = samples.map(([r, g, b]) => colorDistance(r, g, b, avgR, avgG, avgB))
  const mean = distances.reduce((sum, value) => sum + value, 0) / distances.length
  const variance = distances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / distances.length
  const stdDev = Math.sqrt(variance)

  return Math.max(65, Math.min(120, Math.round(mean + stdDev * 1.35)))
}

const refineWallMask = (initialMask: Uint8Array, width: number, height: number, passes = 2): Uint8Array => {
  let mask = initialMask

  for (let pass = 0; pass < passes; pass++) {
    const next = new Uint8Array(mask)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        let neighbors = 0

        for (let ny = -1; ny <= 1; ny++) {
          for (let nx = -1; nx <= 1; nx++) {
            if (nx === 0 && ny === 0) continue
            const nIdx = (y + ny) * width + (x + nx)
            if (mask[nIdx]) neighbors++
          }
        }

        if (!mask[idx] && neighbors >= 5) {
          next[idx] = 1
        } else if (mask[idx] && neighbors <= 1) {
          next[idx] = 0
        }
      }
    }
    mask = next
  }

  return mask
}

const sampleEdgeDominantColor = (data: Uint8ClampedArray, width: number, height: number): [number, number, number] => {
  const samples: Array<[number, number, number]> = []
  const step = 4
  for (let x = 0; x < width; x += step) {
    const ti = (0 * width + x) * 4
    const bi = ((height - 1) * width + x) * 4
    samples.push([data[ti], data[ti + 1], data[ti + 2]])
    samples.push([data[bi], data[bi + 1], data[bi + 2]])
  }
  for (let y = 0; y < height; y += step) {
    const li = (y * width + 0) * 4
    const ri = (y * width + (width - 1)) * 4
    samples.push([data[li], data[li + 1], data[li + 2]])
    samples.push([data[ri], data[ri + 1], data[ri + 2]])
  }
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < samples.length; i++) {
    let totalDist = 0
    for (let j = 0; j < samples.length; j++) totalDist += colorDistance(...samples[i], ...samples[j])
    if (totalDist < bestDist) { bestDist = totalDist; bestIdx = i }
  }
  return samples[bestIdx]
}

const detectWallMask = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seedColor: [number, number, number],
  tolerance: number,
  localTolerance: number
): Uint8Array => {
  const mask = new Uint8Array(width * height)
  const visited = new Uint8Array(width * height)
  const queue: number[] = []
  const enqueue = (x: number, y: number, refR?: number, refG?: number, refB?: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const idx = y * width + x
    if (visited[idx]) return
    visited[idx] = 1
    const i = idx * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const seedPass = colorDistance(r, g, b, seedColor[0], seedColor[1], seedColor[2]) <= tolerance
    const localPass =
      refR !== undefined && refG !== undefined && refB !== undefined
        ? colorDistance(r, g, b, refR, refG, refB) <= localTolerance
        : false

    if (seedPass || localPass) {
      mask[idx] = 1
      queue.push(idx)
    }
  }
  for (let x = 0; x < width; x++) { enqueue(x, 0); enqueue(x, height - 1) }
  for (let y = 0; y < height; y++) { enqueue(0, y); enqueue(width - 1, y) }
  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    const x = idx % width
    const y = Math.floor(idx / width)
    const i = idx * 4
    const refR = data[i]
    const refG = data[i + 1]
    const refB = data[i + 2]

    enqueue(x + 1, y, refR, refG, refB); enqueue(x - 1, y, refR, refG, refB)
    enqueue(x, y + 1, refR, refG, refB); enqueue(x, y - 1, refR, refG, refB)
    enqueue(x + 1, y + 1, refR, refG, refB); enqueue(x - 1, y - 1, refR, refG, refB)
    enqueue(x + 1, y - 1, refR, refG, refB); enqueue(x - 1, y + 1, refR, refG, refB)
  }
  return mask
}

// Recolors only the detected wall pixels.
// Uses Canvas 'color' blend mode: preserves each pixel's luminance (shadows/depth/texture),
// replaces H+S with the selected paint color. Furniture/objects outside the mask are untouched.
const recolorImageToCanvas = (
  image: HTMLImageElement,
  wall: WallConfig,
  width: number,
  height: number
): HTMLCanvasElement => {
  const offscreen = document.createElement('canvas')
  offscreen.width = width
  offscreen.height = height
  const ctx = offscreen.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, width, height)

  // Detect wall pixels using the existing mask pipeline
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  const wallColor = sampleEdgeDominantColor(data, width, height)
  const tolerance = computeAdaptiveTolerance(data, width, height)
  const roughMask = detectWallMask(data, width, height, wallColor, tolerance, Math.round(tolerance * 0.7))
  const mask = refineWallMask(roughMask, width, height)

  // Build a paint-color layer covering only wall pixels
  const paintLayer = document.createElement('canvas')
  paintLayer.width = width
  paintLayer.height = height
  const paintCtx = paintLayer.getContext('2d')!
  const paintData = paintCtx.createImageData(width, height)
  const d = paintData.data

  for (let py = 0; py < height; py++) {
    const hex = getWallPaintHex(wall, py, height)
    const pr = parseInt(hex.slice(1, 3), 16)
    const pg = parseInt(hex.slice(3, 5), 16)
    const pb = parseInt(hex.slice(5, 7), 16)
    for (let px = 0; px < width; px++) {
      const idx = py * width + px
      if (mask[idx]) {
        const di = idx * 4
        d[di]     = pr
        d[di + 1] = pg
        d[di + 2] = pb
        d[di + 3] = 255
      }
    }
  }
  paintCtx.putImageData(paintData, 0, 0)

  // 'color' blend mode: uses H+S from source (paint) and L from dest (photo)
  // This gives accurate color matching while keeping all shadows and texture.
  ctx.globalCompositeOperation = 'color'
  ctx.drawImage(paintLayer, 0, 0)
  ctx.globalCompositeOperation = 'source-over'

  return offscreen
}

const drawWallPattern = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, wall: WallConfig) => {
  if (wall.pattern === 'solid') {
    ctx.fillStyle = wall.solidColor?.hex ?? '#f8fafc'
    ctx.fillRect(x, y, width, height)
    return
  }

  if (wall.pattern === 'twoTone') {
    const upper = wall.upperColor?.hex ?? '#f8fafc'
    const lower = wall.lowerColor?.hex ?? '#f8fafc'
    const splitHeight = Math.max(1, Math.min(height - 1, (height * wall.splitPercentage) / 100))
    ctx.fillStyle = upper
    ctx.fillRect(x, y, width, splitHeight)
    ctx.fillStyle = lower
    ctx.fillRect(x, y + splitHeight, width, height - splitHeight)
    return
  }

  const top = wall.topColor?.hex ?? '#f8fafc'
  const middle = wall.middleColor?.hex ?? '#f8fafc'
  const bottom = wall.bottomColor?.hex ?? '#f8fafc'
  const stripeHeight = Math.max(1, Math.min(height - 2, (height * wall.stripePercentage) / 100))
  const topHeight = Math.max(1, (height * (50 - wall.stripePercentage / 2)) / 100)
  const bottomHeight = Math.max(1, height - topHeight - stripeHeight)

  ctx.fillStyle = top
  ctx.fillRect(x, y, width, topHeight)
  ctx.fillStyle = middle
  ctx.fillRect(x, y + topHeight, width, stripeHeight)
  ctx.fillStyle = bottom
  ctx.fillRect(x, y + topHeight + stripeHeight, width, bottomHeight)
}

const drawUnfoldedLayout = (
  canvas: HTMLCanvasElement,
  walls: WallConfig[],
  ceilingColor: Color | null,
  trimColor: Color | null,
  layoutMode: 'horizontal' | 'vertical',
  images: Record<string, HTMLImageElement | undefined>,
  scale = 2
) => {
  const context = canvas.getContext('2d')
  if (!context) return

  const wallCount = walls.length
  const width = layoutMode === 'horizontal' ? wallCount * WALL_WIDTH + (wallCount - 1) * GAP + PADDING * 2 : WALL_WIDTH + PADDING * 2
  const height =
    CEILING_HEIGHT +
    (layoutMode === 'vertical' ? wallCount * WALL_HEIGHT + (wallCount - 1) * GAP : WALL_HEIGHT) +
    TRIM_HEIGHT +
    LABEL_HEIGHT +
    PADDING * 2

  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)

  const ceilingHex = ceilingColor?.hex ?? '#f8fafc'
  const ceilingName = ceilingColor?.name ?? 'Neutral'
  context.fillStyle = ceilingHex
  context.fillRect(PADDING, PADDING, width - PADDING * 2, CEILING_HEIGHT)
  context.fillStyle = getContrastTextColor(ceilingHex)
  context.font = '600 16px Inter, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(`Ceiling · ${ceilingName}`, width / 2, PADDING + CEILING_HEIGHT / 2)

  const wallStartX = PADDING
  const wallStartY = PADDING + CEILING_HEIGHT + GAP

  walls.forEach((wall, index) => {
    const x = wallStartX + (layoutMode === 'horizontal' ? index * (WALL_WIDTH + GAP) : 0)
    const y = wallStartY + (layoutMode === 'horizontal' ? 0 : index * (WALL_HEIGHT + GAP))

    context.save()
    const photo = images[wall.id]
    if (photo) {
      // Direct pixel HSL recolor: preserves luminance per pixel, applies paint H+S.
      const recolored = recolorImageToCanvas(photo, wall, WALL_WIDTH, WALL_HEIGHT)
      context.drawImage(recolored, x, y)
    } else {
      drawWallPattern(context, x, y, WALL_WIDTH, WALL_HEIGHT, wall)
    }
    context.strokeStyle = '#cbd5e1'
    context.lineWidth = 1
    context.strokeRect(x, y, WALL_WIDTH, WALL_HEIGHT)

    // For each wall:
    const labelX = x
    const labelY = y + WALL_HEIGHT + 10
    const labelWidth = WALL_WIDTH
    const labelHeight = 30

    // Determine label background color and text based on pattern
    let labelColor = '#E2E8F0' // fallback light gray
    let labelText = `Wall ${index + 1}`
    
    if (wall.pattern === 'solid' && wall.solidColor) {
      labelColor = wall.solidColor.hex
      labelText = `Wall ${index + 1} (${wall.solidColor.name})`
    } else if (wall.pattern === 'twoTone') {
      const primaryColor = wall.upperColor ?? wall.lowerColor
      if (primaryColor) {
        labelColor = primaryColor.hex
        labelText = `Wall ${index + 1} · Two-Tone (${primaryColor.name})`
      }
    } else if (wall.pattern === 'stripe') {
      const primaryColor = wall.middleColor ?? wall.topColor
      if (primaryColor) {
        labelColor = primaryColor.hex
        labelText = `Wall ${index + 1} · Stripe (${primaryColor.name})`
      }
    }

    // Draw background rectangle
    context.fillStyle = labelColor
    context.fillRect(labelX, labelY, labelWidth, labelHeight)

    // Draw text with contrasting color
    context.fillStyle = getContrastTextColor(labelColor)
    context.font = 'bold 14px Inter, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(labelText, labelX + labelWidth / 2, labelY + labelHeight / 2)
    context.restore()
  })

  const trimY = wallStartY + (layoutMode === 'horizontal' ? WALL_HEIGHT : wallCount * WALL_HEIGHT + (wallCount - 1) * GAP)
  const trimHex = trimColor?.hex ?? '#f1f5f9'
  const trimName = trimColor?.name ?? 'Neutral'
  context.fillStyle = trimHex
  context.fillRect(PADDING, trimY, width - PADDING * 2, TRIM_HEIGHT)
  context.fillStyle = getContrastTextColor(trimHex)
  context.font = '600 14px Inter, sans-serif'
  context.textAlign = 'center'
  context.fillText(`Trim / Baseboard · ${trimName}`, width / 2, trimY + TRIM_HEIGHT / 2)
}

const renderWallSurface = (
  wall: WallConfig,
  image: HTMLImageElement | undefined,
  width: number,
  height: number
): HTMLCanvasElement => {
  if (image) return recolorImageToCanvas(image, wall, width, height)

  const surface = document.createElement('canvas')
  surface.width = width
  surface.height = height
  const context = surface.getContext('2d')
  if (!context) return surface
  drawWallPattern(context, 0, 0, width, height, wall)
  return surface
}

// Affine-maps a source texture triangle onto a destination triangle in the canvas.
// This gives seamless, warp-free texture projection for perspective quads.
const drawTexturedTriangle = (
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  dx0: number, dy0: number,
  dx1: number, dy1: number,
  dx2: number, dy2: number,
  sx0: number, sy0: number,
  sx1: number, sy1: number,
  sx2: number, sy2: number
) => {
  const denom = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1)
  if (Math.abs(denom) < 0.001) return
  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / denom
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / denom
  const c = (sx0 * (dx1 - dx2) + sx1 * (dx2 - dx0) + sx2 * (dx0 - dx1)) / denom
  const d = (sx0 * (dy1 - dy2) + sx1 * (dy2 - dy0) + sx2 * (dy0 - dy1)) / denom
  const e = (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) / denom
  const f = (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) / denom
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(dx0, dy0); ctx.lineTo(dx1, dy1); ctx.lineTo(dx2, dy2)
  ctx.closePath(); ctx.clip()
  ctx.transform(a, b, c, d, e, f)
  ctx.drawImage(texture, 0, 0)
  ctx.restore()
}

// Maps a wall texture onto an arbitrary canvas quadrilateral using a subdivided grid.
// Uses bilinear interpolation so each small sub-cell is near-rectangular, giving
// perspective-accurate texture mapping without visible diagonal seams or shearing.
// p0=TopLeft, p1=TopRight, p2=BottomRight, p3=BottomLeft (all in canvas coords)
const drawTexturedQuad = (
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  tw: number, th: number,
  subdivisions = 8
) => {
  // Bilinear interpolation across the quad: u=horizontal (0=left,1=right), v=vertical (0=top,1=bottom)
  const bilerp = (u: number, v: number) => ({
    x: (1 - v) * ((1 - u) * p0.x + u * p1.x) + v * ((1 - u) * p3.x + u * p2.x),
    y: (1 - v) * ((1 - u) * p0.y + u * p1.y) + v * ((1 - u) * p3.y + u * p2.y),
  })

  for (let row = 0; row < subdivisions; row++) {
    for (let col = 0; col < subdivisions; col++) {
      const u0 = col / subdivisions
      const u1 = (col + 1) / subdivisions
      const v0 = row / subdivisions
      const v1 = (row + 1) / subdivisions

      const tl = bilerp(u0, v0)
      const tr = bilerp(u1, v0)
      const br = bilerp(u1, v1)
      const bl = bilerp(u0, v1)

      const sx0 = u0 * tw, sy0 = v0 * th
      const sx1 = u1 * tw, sy1 = v1 * th

      drawTexturedTriangle(ctx, texture, tl.x, tl.y, tr.x, tr.y, bl.x, bl.y, sx0, sy0, sx1, sy0, sx0, sy1)
      drawTexturedTriangle(ctx, texture, tr.x, tr.y, br.x, br.y, bl.x, bl.y, sx1, sy0, sx1, sy1, sx0, sy1)
    }
  }
}

const strokePoly = (ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], color = '#475569', lw = 1.5) => {
  ctx.save()
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke()
  ctx.restore()
}

const fillPoly = (ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], fillStyle: string | CanvasGradient) => {
  ctx.save()
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.fillStyle = fillStyle; ctx.fill()
  ctx.restore()
}

const shadePoly = (ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], alpha: number) => {
  fillPoly(ctx, pts, `rgba(15,23,42,${alpha.toFixed(3)})`)
}

export const drawThreeDLayout = (
  canvas: HTMLCanvasElement,
  walls: WallConfig[],
  ceilingColor: Color | null,
  trimColor: Color | null,
  images: Record<string, HTMLImageElement | undefined>,
  viewAngleDeg: number,
  scale = 2
) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = THREE_D_BASE_WIDTH
  const H = THREE_D_BASE_HEIGHT
  canvas.width = Math.round(W * scale)
  canvas.height = Math.round(H * scale)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, W, H)

  if (!walls.length) {
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 16px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('No walls configured', W / 2, H / 2)
    return
  }

  const ceilingHex = ceilingColor?.hex ?? '#f8fafc'
  const trimHex = trimColor?.hex ?? '#f1f5f9'
  const N = walls.length

  // ── Pick which walls to show (front, left, right) based on viewAngle ──
  const degreesPerWall = 360 / N
  const normalizedAngle = ((viewAngleDeg % 360) + 360) % 360
  const frontIdx = Math.round(normalizedAngle / degreesPerWall) % N
  const leftIdx = (frontIdx - 1 + N) % N
  const rightIdx = (frontIdx + 1) % N

  // ── Pre-render wall textures at a good resolution ──
  const TW = 600
  const TH = 400
  const frontWall = walls[frontIdx]
  const leftWall = walls[leftIdx]
  const rightWall = walls[rightIdx]
  const frontTex = renderWallSurface(frontWall, images[frontWall.id], TW, TH)
  const leftTex = N >= 2 ? renderWallSurface(leftWall, images[leftWall.id], TW, TH) : frontTex
  const rightTex = N >= 2 ? renderWallSurface(rightWall, images[rightWall.id], TW, TH) : frontTex

  // ── One-point perspective room geometry ──
  // Outer frame = the "near" room boundary (edges of canvas view)
  const padX = 52, padY = 58
  const oL = padX,         oR = W - padX
  const oT = padY + 28,    oB = H - padY - 28

  // Inner frame = the "far" back wall rectangle (centered, scaled inward)
  const depthH = 0.46   // horizontal depth factor
  const depthV = 0.40   // vertical depth factor
  const iL = oL + (oR - oL) * depthH * 0.5
  const iR = oR - (oR - oL) * depthH * 0.5
  const iT = oT + (oB - oT) * depthV * 0.5
  const iB = oB - (oB - oT) * depthV * 0.5

  // Quads for each surface (p0=TL, p1=TR, p2=BR, p3=BL)
  const backQ  = [{ x: iL, y: iT }, { x: iR, y: iT }, { x: iR, y: iB }, { x: iL, y: iB }]
  const leftQ  = [{ x: oL, y: oT }, { x: iL, y: iT }, { x: iL, y: iB }, { x: oL, y: oB }]
  const rightQ = [{ x: iR, y: iT }, { x: oR, y: oT }, { x: oR, y: oB }, { x: iR, y: iB }]
  const ceilQ  = [{ x: oL, y: oT }, { x: oR, y: oT }, { x: iR, y: iT }, { x: iL, y: iT }]
  const floorQ = [{ x: iL, y: iB }, { x: iR, y: iB }, { x: oR, y: oB }, { x: oL, y: oB }]

  // Background
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, W, H)

  // ── Ceiling ──
  fillPoly(ctx, ceilQ, ceilingHex)
  // Subtle ceiling depth gradient
  const ceilFade = ctx.createLinearGradient(0, oT, 0, iT)
  ceilFade.addColorStop(0, 'rgba(255,255,255,0.18)')
  ceilFade.addColorStop(1, 'rgba(255,255,255,0)')
  fillPoly(ctx, ceilQ, ceilFade)
  strokePoly(ctx, ceilQ)

  // ── Floor ──
  const floorGrad = ctx.createLinearGradient(W / 2, iB, W / 2, oB)
  floorGrad.addColorStop(0, '#6b7280')
  floorGrad.addColorStop(1, '#374151')
  fillPoly(ctx, floorQ, floorGrad)
  strokePoly(ctx, floorQ)

  // ── Back wall (front wall texture) ──
  drawTexturedQuad(ctx, frontTex, backQ[0], backQ[1], backQ[2], backQ[3], TW, TH)
  strokePoly(ctx, backQ)

  // ── Left wall ──
  drawTexturedQuad(ctx, leftTex, leftQ[0], leftQ[1], leftQ[2], leftQ[3], TW, TH)
  // Perspective shade: left side is darker to give depth
  const leftShade = ctx.createLinearGradient(oL, 0, iL, 0)
  leftShade.addColorStop(0, 'rgba(15,23,42,0.38)')
  leftShade.addColorStop(1, 'rgba(15,23,42,0.00)')
  fillPoly(ctx, leftQ, leftShade)
  strokePoly(ctx, leftQ)

  // ── Right wall ──
  drawTexturedQuad(ctx, rightTex, rightQ[0], rightQ[1], rightQ[2], rightQ[3], TW, TH)
  // Perspective shade: slightly lighter than left
  const rightShade = ctx.createLinearGradient(oR, 0, iR, 0)
  rightShade.addColorStop(0, 'rgba(15,23,42,0.28)')
  rightShade.addColorStop(1, 'rgba(15,23,42,0.00)')
  fillPoly(ctx, rightQ, rightShade)
  strokePoly(ctx, rightQ)

  // ── Trim strip on back wall bottom ──
  const trimFrac = 0.13
  const trimTop = iB - (iB - iT) * trimFrac
  const trimQ = [{ x: iL, y: trimTop }, { x: iR, y: trimTop }, { x: iR, y: iB }, { x: iL, y: iB }]
  fillPoly(ctx, trimQ, trimHex)
  strokePoly(ctx, trimQ)

  // Trim on left wall bottom
  const ltTrimFrac = 0.13
  const ltTrimTL = { x: oL, y: oB - (oB - oT) * ltTrimFrac }
  const ltTrimTR = { x: iL, y: iB - (iB - iT) * ltTrimFrac }
  const ltTrimQ = [ltTrimTL, ltTrimTR, { x: iL, y: iB }, { x: oL, y: oB }]
  fillPoly(ctx, ltTrimQ, trimHex)
  fillPoly(ctx, ltTrimQ, 'rgba(15,23,42,0.28)')
  strokePoly(ctx, ltTrimQ)

  // Trim on right wall bottom
  const rtTrimTL = { x: iR, y: iB - (iB - iT) * ltTrimFrac }
  const rtTrimTR = { x: oR, y: oB - (oB - oT) * ltTrimFrac }
  const rtTrimQ = [rtTrimTL, rtTrimTR, { x: oR, y: oB }, { x: iR, y: iB }]
  fillPoly(ctx, rtTrimQ, trimHex)
  fillPoly(ctx, rtTrimQ, 'rgba(15,23,42,0.20)')
  strokePoly(ctx, rtTrimQ)

  // ── Labels ──
  const label = (text: string, x: number, y: number, bg: string) => {
    const pad = 6
    ctx.font = '600 11px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(text).width
    ctx.save()
    ctx.fillStyle = bg
    ctx.globalAlpha = 0.82
    ctx.beginPath()
    ctx.roundRect(x - tw / 2 - pad, y - 10, tw + pad * 2, 20, 6)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = getContrastTextColor(bg)
    ctx.fillText(text, x, y)
    ctx.restore()
  }

  // Ceiling label
  label(
    `Ceiling · ${ceilingColor?.name ?? 'Neutral'}`,
    W / 2, oT + (iT - oT) * 0.5, ceilingHex
  )

  // Back wall label
  const fwPrimary = frontWall.pattern === 'solid' ? (frontWall.solidColor?.hex ?? '#64748b')
    : frontWall.pattern === 'twoTone' ? (frontWall.upperColor?.hex ?? '#64748b')
    : (frontWall.middleColor?.hex ?? '#64748b')
  label(`Wall ${frontIdx + 1}`, (iL + iR) / 2, iT + 22, fwPrimary)

  // Left wall label
  if (N >= 2) {
    const lwPrimary = leftWall.pattern === 'solid' ? (leftWall.solidColor?.hex ?? '#64748b')
      : leftWall.pattern === 'twoTone' ? (leftWall.upperColor?.hex ?? '#64748b')
      : (leftWall.middleColor?.hex ?? '#64748b')
    label(`Wall ${leftIdx + 1}`, oL + (iL - oL) * 0.42, oT + (oB - oT) * 0.38, lwPrimary)
  }

  // Right wall label
  if (N >= 3) {
    const rwPrimary = rightWall.pattern === 'solid' ? (rightWall.solidColor?.hex ?? '#64748b')
      : rightWall.pattern === 'twoTone' ? (rightWall.upperColor?.hex ?? '#64748b')
      : (rightWall.middleColor?.hex ?? '#64748b')
    label(`Wall ${rightIdx + 1}`, iR + (oR - iR) * 0.58, oT + (oB - oT) * 0.38, rwPrimary)
  }

  // Trim label
  label(`Trim · ${trimColor?.name ?? 'Neutral'}`, (iL + iR) / 2, (iB + trimTop) / 2 + 1, trimHex)

  // Footer caption
  ctx.fillStyle = '#64748b'
  ctx.font = '500 11px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    `Inside room · Viewing Wall ${frontIdx + 1} (front) | Wall ${leftIdx + 1} (left) | Wall ${rightIdx + 1} (right) · Angle ${viewAngleDeg}°`,
    W / 2, H - 18
  )
}

const getUnfoldedSize = (wallCount: number, layoutMode: 'horizontal' | 'vertical') => {
  const width = layoutMode === 'horizontal' ? wallCount * WALL_WIDTH + (wallCount - 1) * GAP + PADDING * 2 : WALL_WIDTH + PADDING * 2
  const height =
    CEILING_HEIGHT +
    (layoutMode === 'vertical' ? wallCount * WALL_HEIGHT + (wallCount - 1) * GAP : WALL_HEIGHT) +
    TRIM_HEIGHT +
    LABEL_HEIGHT +
    PADDING * 2
  return { width, height }
}

const getThreeDSize = (_wallCount?: number) => ({
  width: THREE_D_BASE_WIDTH,
  height: THREE_D_BASE_HEIGHT
})

export function FinalViewModal({ open, onClose, walls, ceilingColor, trimColor, layoutMode, imageMap }: FinalViewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [viewMode, setViewMode] = useState<FinalViewMode>('unfolded')
  const [viewAngleDeg, setViewAngleDeg] = useState(0)

  const baseSize = useMemo(() => {
    return viewMode === 'unfolded' ? getUnfoldedSize(walls.length, layoutMode) : getThreeDSize(walls.length)
  }, [walls.length, layoutMode, viewMode])

  useEffect(() => {
    if (!open || !canvasRef.current) return
    if (viewMode === 'unfolded') {
      drawUnfoldedLayout(canvasRef.current, walls, ceilingColor, trimColor, layoutMode, imageMap, 2)
      return
    }
    drawThreeDLayout(canvasRef.current, walls, ceilingColor, trimColor, imageMap, viewAngleDeg, 2)
  }, [open, walls, ceilingColor, trimColor, layoutMode, imageMap, viewMode, viewAngleDeg])

  const downloadPng = async () => {
    const scale = 3
    const { width: w, height: h } = viewMode === 'unfolded' ? getUnfoldedSize(walls.length, layoutMode) : getThreeDSize(walls.length)

    // Pre-load any photos not yet in imageMap
    const loadedImages: Record<string, HTMLImageElement | undefined> = { ...imageMap }
    await Promise.all(
      walls.map(
        (wall) =>
          new Promise<void>((resolve) => {
            if (!wall.photoPreviewUrl || loadedImages[wall.id]) {
              resolve()
              return
            }
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
              loadedImages[wall.id] = img
              resolve()
            }
            img.onerror = () => resolve() // fallback: draw color only
            img.src = wall.photoPreviewUrl
          })
      )
    )

    const offscreen = document.createElement('canvas')
    offscreen.width = w * scale
    offscreen.height = h * scale
    if (viewMode === 'unfolded') {
      drawUnfoldedLayout(offscreen, walls, ceilingColor, trimColor, layoutMode, loadedImages, scale)
    } else {
      drawThreeDLayout(offscreen, walls, ceilingColor, trimColor, loadedImages, viewAngleDeg, scale)
    }

    const link = document.createElement('a')
    link.download = viewMode === 'unfolded' ? 'room-harmony-final-unfolded.png' : 'room-harmony-final-3d.png'
    link.href = offscreen.toDataURL('image/png')
    link.click()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 sm:items-center sm:p-6">
      <div className="relative my-2 max-h-[calc(100vh-1rem)] w-full max-w-[1200px] overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:my-0 sm:max-h-[calc(100vh-3rem)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 z-20 rounded-full border border-slate-300 bg-white p-2 text-slate-700 shadow-sm transition hover:bg-slate-100"
          aria-label="Close final view modal"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Final Combined Room View</h2>
            <p className="text-sm text-slate-600">Combined final image with all walls, ceiling, and trim in unfolded or 3D perspective mode.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setViewMode('unfolded')}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${viewMode === 'unfolded' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Unfolded
            </button>
            <button
              type="button"
              onClick={() => setViewMode('threeD')}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${viewMode === 'threeD' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              3D View
            </button>
            <button
              type="button"
              onClick={downloadPng}
              className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              Download Final Room Image
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>

        {viewMode === 'threeD' && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-sm text-slate-700">
              <span className="font-medium">View Angle</span>
              <span className="font-semibold text-slate-900">{viewAngleDeg}°</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {ANGLE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setViewAngleDeg(preset.angle)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${viewAngleDeg === preset.angle ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={viewAngleDeg}
              onChange={(event) => setViewAngleDeg(Number(event.target.value))}
              className="w-full accent-sky-600"
              aria-label="3D view angle"
            />
          </div>
        )}

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <canvas ref={canvasRef} style={{ width: `${baseSize.width}px`, height: `${baseSize.height}px` }} />
        </div>
      </div>
    </div>
  )
}
