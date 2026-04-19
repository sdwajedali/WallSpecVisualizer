import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRoomStore, type WallConfig } from '../store/useRoomStore'
import { getContrastTextColor, type Color } from '../lib/colorUtils'
import { FinalViewModal } from './FinalViewModal'

const WALL_WIDTH = 220
const WALL_HEIGHT = 180
const CEILING_HEIGHT = 40
const TRIM_HEIGHT = 28
const GAP = 18
const PADDING = 24
const LABEL_HEIGHT = 30
const THREE_D_BASE_WIDTH = 980
const THREE_D_BASE_HEIGHT = 620

const ANGLE_PRESETS: Array<{ label: string; angle: number }> = [
  { label: 'Front', angle: 0 },
  { label: 'Left Corner', angle: -60 },
  { label: 'Right Corner', angle: 60 },
  { label: 'Back', angle: 180 },
]

// Returns the paint hex for a given pixel row within the wall area.
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

// Euclidean RGB color distance
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

// Samples the dominant color from the image edges (top/bottom/left/right border rows).
// Room walls are almost always visible at the photo borders.
const sampleEdgeDominantColor = (data: Uint8ClampedArray, width: number, height: number): [number, number, number] => {
  const samples: Array<[number, number, number]> = []
  const step = 4
  // Top and bottom rows
  for (let x = 0; x < width; x += step) {
    const ti = (0 * width + x) * 4
    const bi = ((height - 1) * width + x) * 4
    samples.push([data[ti], data[ti + 1], data[ti + 2]])
    samples.push([data[bi], data[bi + 1], data[bi + 2]])
  }
  // Left and right columns
  for (let y = 0; y < height; y += step) {
    const li = (y * width + 0) * 4
    const ri = (y * width + (width - 1)) * 4
    samples.push([data[li], data[li + 1], data[li + 2]])
    samples.push([data[ri], data[ri + 1], data[ri + 2]])
  }
  // Find the sample with the smallest total distance to all others (medoid)
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < samples.length; i++) {
    let totalDist = 0
    for (let j = 0; j < samples.length; j++) {
      totalDist += colorDistance(...samples[i], ...samples[j])
    }
    if (totalDist < bestDist) { bestDist = totalDist; bestIdx = i }
  }
  return samples[bestIdx]
}

// Flood-fills from every border pixel to build a boolean mask of "wall" pixels.
// Uses a queue-based BFS with color-similarity tolerance.
const detectWallMask = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seedColor: [number, number, number],
  tolerance: number,
  localTolerance: number
): Uint8Array => {
  const mask = new Uint8Array(width * height) // 1 = wall pixel
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

  // Seed from all 4 edges
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
// Pipeline: grayscale (luminance) -> tint with selected RGB.
// This keeps wall texture/shadows while applying a stable, explicit paint color.
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

  // Grayscale + RGB tint on wall pixels only
  for (let py = 0; py < height; py++) {
    const hex = getWallPaintHex(wall, py, height)
    const pr = parseInt(hex.slice(1, 3), 16)
    const pg = parseInt(hex.slice(3, 5), 16)
    const pb = parseInt(hex.slice(5, 7), 16)

    for (let px = 0; px < width; px++) {
      const idx = py * width + px
      if (mask[idx]) {
        const di = idx * 4

        // 1) Convert source pixel to luminance (black/white)
        const sr = data[di]
        const sg = data[di + 1]
        const sb = data[di + 2]
        const luminance = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb

        // 2) Map luminance to shading multiplier (avoid crushing very dark areas)
        const shade = 0.15 + 0.85 * (luminance / 255)

        // 3) Apply selected RGB while preserving shading/texture
        data[di] = Math.min(255, Math.round(pr * shade))
        data[di + 1] = Math.min(255, Math.round(pg * shade))
        data[di + 2] = Math.min(255, Math.round(pb * shade))
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)

  return offscreen
}

const drawWallPattern = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, wall: WallConfig) => {
  console.log(`Drawing wall ${wall.id}, pattern: ${wall.pattern}`)
  if (wall.pattern === 'solid') {
    const color = wall.solidColor?.hex ?? '#FF0000'
    console.log(`Solid color: ${color}`)
    ctx.fillStyle = color
    ctx.fillRect(x, y, width, height)
    return
  }

  if (wall.pattern === 'twoTone') {
    const upper = wall.upperColor?.hex ?? '#FF0000'
    const lower = wall.lowerColor?.hex ?? '#FF0000'
    console.log(`Two-tone upper: ${upper}, lower: ${lower}`)
    const splitHeight = Math.max(1, Math.min(height - 1, (height * wall.splitPercentage) / 100))
    ctx.fillStyle = upper
    ctx.fillRect(x, y, width, splitHeight)
    ctx.fillStyle = lower
    ctx.fillRect(x, y + splitHeight, width, height - splitHeight)
    return
  }

  const top = wall.topColor?.hex ?? '#FF0000'
  const middle = wall.middleColor?.hex ?? '#FF0000'
  const bottom = wall.bottomColor?.hex ?? '#FF0000'
  console.log(`Stripe top: ${top}, middle: ${middle}, bottom: ${bottom}`)
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
  scale = 1
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
  context.font = '600 14px Inter, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(`Ceiling · ${ceilingName}`, width / 2, PADDING + CEILING_HEIGHT / 2)

  const wallStartX = PADDING
  const wallStartY = PADDING + CEILING_HEIGHT + GAP

  walls.forEach((wall, index) => {
    const x = wallStartX + (layoutMode === 'horizontal' ? index * (WALL_WIDTH + GAP) : 0)
    const y = wallStartY + (layoutMode === 'horizontal' ? 0 : index * (WALL_HEIGHT + GAP))

    context.save()
    const image = images[wall.id]
    if (image) {
      // Direct pixel HSL recolor: preserves luminance per pixel, applies paint H+S.
      // This is pixel-accurate and avoids all canvas blend mode browser inconsistencies.
      const recolored = recolorImageToCanvas(image, wall, WALL_WIDTH, WALL_HEIGHT)
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
    context.font = 'bold 13px Inter, sans-serif'
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
  context.font = '600 12px Inter, sans-serif'
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
  ctx.moveTo(dx0, dy0)
  ctx.lineTo(dx1, dy1)
  ctx.lineTo(dx2, dy2)
  ctx.closePath()
  ctx.clip()
  ctx.transform(a, b, c, d, e, f)
  ctx.drawImage(texture, 0, 0)
  ctx.restore()
}

const drawTexturedQuad = (
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  tw: number,
  th: number,
  subdivisions = 8
) => {
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

      const sx0 = u0 * tw
      const sy0 = v0 * th
      const sx1 = u1 * tw
      const sy1 = v1 * th

      drawTexturedTriangle(ctx, texture, tl.x, tl.y, tr.x, tr.y, bl.x, bl.y, sx0, sy0, sx1, sy0, sx0, sy1)
      drawTexturedTriangle(ctx, texture, tr.x, tr.y, br.x, br.y, bl.x, bl.y, sx1, sy0, sx1, sy1, sx0, sy1)
    }
  }
}

const strokePoly = (ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], color = '#475569', lineWidth = 1.5) => {
  ctx.save()
  ctx.beginPath()
  pts.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.stroke()
  ctx.restore()
}

const fillPoly = (ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], fillStyle: string | CanvasGradient) => {
  ctx.save()
  ctx.beginPath()
  pts.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.fillStyle = fillStyle
  ctx.fill()
  ctx.restore()
}

const drawThreeDLayout = (
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

  const width = THREE_D_BASE_WIDTH
  const height = THREE_D_BASE_HEIGHT
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, width, height)

  if (!walls.length) {
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 16px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('No walls configured', width / 2, height / 2)
    return
  }

  const ceilingHex = ceilingColor?.hex ?? '#f8fafc'
  const trimHex = trimColor?.hex ?? '#f1f5f9'
  const wallTotal = walls.length
  const degreesPerWall = 360 / wallTotal
  const normalizedAngle = ((viewAngleDeg % 360) + 360) % 360
  const frontIdx = Math.round(normalizedAngle / degreesPerWall) % wallTotal
  const leftIdx = (frontIdx - 1 + wallTotal) % wallTotal
  const rightIdx = (frontIdx + 1) % wallTotal

  const textureWidth = 600
  const textureHeight = 400
  const frontWall = walls[frontIdx]
  const leftWall = walls[leftIdx]
  const rightWall = walls[rightIdx]
  const frontTex = renderWallSurface(frontWall, images[frontWall.id], textureWidth, textureHeight)
  const leftTex = wallTotal >= 2 ? renderWallSurface(leftWall, images[leftWall.id], textureWidth, textureHeight) : frontTex
  const rightTex = wallTotal >= 2 ? renderWallSurface(rightWall, images[rightWall.id], textureWidth, textureHeight) : frontTex

  const padX = 52
  const padY = 58
  const oL = padX
  const oR = width - padX
  const oT = padY + 28
  const oB = height - padY - 28

  const depthH = 0.46
  const depthV = 0.4
  const iL = oL + (oR - oL) * depthH * 0.5
  const iR = oR - (oR - oL) * depthH * 0.5
  const iT = oT + (oB - oT) * depthV * 0.5
  const iB = oB - (oB - oT) * depthV * 0.5

  const backQ = [{ x: iL, y: iT }, { x: iR, y: iT }, { x: iR, y: iB }, { x: iL, y: iB }]
  const leftQ = [{ x: oL, y: oT }, { x: iL, y: iT }, { x: iL, y: iB }, { x: oL, y: oB }]
  const rightQ = [{ x: iR, y: iT }, { x: oR, y: oT }, { x: oR, y: oB }, { x: iR, y: iB }]
  const ceilQ = [{ x: oL, y: oT }, { x: oR, y: oT }, { x: iR, y: iT }, { x: iL, y: iT }]
  const floorQ = [{ x: iL, y: iB }, { x: iR, y: iB }, { x: oR, y: oB }, { x: oL, y: oB }]

  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, width, height)

  fillPoly(ctx, ceilQ, ceilingHex)
  const ceilFade = ctx.createLinearGradient(0, oT, 0, iT)
  ceilFade.addColorStop(0, 'rgba(255,255,255,0.18)')
  ceilFade.addColorStop(1, 'rgba(255,255,255,0)')
  fillPoly(ctx, ceilQ, ceilFade)
  strokePoly(ctx, ceilQ)

  const floorGrad = ctx.createLinearGradient(width / 2, iB, width / 2, oB)
  floorGrad.addColorStop(0, '#6b7280')
  floorGrad.addColorStop(1, '#374151')
  fillPoly(ctx, floorQ, floorGrad)
  strokePoly(ctx, floorQ)

  drawTexturedQuad(ctx, frontTex, backQ[0], backQ[1], backQ[2], backQ[3], textureWidth, textureHeight)
  strokePoly(ctx, backQ)

  drawTexturedQuad(ctx, leftTex, leftQ[0], leftQ[1], leftQ[2], leftQ[3], textureWidth, textureHeight)
  const leftShade = ctx.createLinearGradient(oL, 0, iL, 0)
  leftShade.addColorStop(0, 'rgba(15,23,42,0.38)')
  leftShade.addColorStop(1, 'rgba(15,23,42,0.00)')
  fillPoly(ctx, leftQ, leftShade)
  strokePoly(ctx, leftQ)

  drawTexturedQuad(ctx, rightTex, rightQ[0], rightQ[1], rightQ[2], rightQ[3], textureWidth, textureHeight)
  const rightShade = ctx.createLinearGradient(oR, 0, iR, 0)
  rightShade.addColorStop(0, 'rgba(15,23,42,0.28)')
  rightShade.addColorStop(1, 'rgba(15,23,42,0.00)')
  fillPoly(ctx, rightQ, rightShade)
  strokePoly(ctx, rightQ)

  const trimFrac = 0.13
  const trimTop = iB - (iB - iT) * trimFrac
  const trimQ = [{ x: iL, y: trimTop }, { x: iR, y: trimTop }, { x: iR, y: iB }, { x: iL, y: iB }]
  fillPoly(ctx, trimQ, trimHex)
  strokePoly(ctx, trimQ)

  const ltTrimTL = { x: oL, y: oB - (oB - oT) * trimFrac }
  const ltTrimTR = { x: iL, y: iB - (iB - iT) * trimFrac }
  const ltTrimQ = [ltTrimTL, ltTrimTR, { x: iL, y: iB }, { x: oL, y: oB }]
  fillPoly(ctx, ltTrimQ, trimHex)
  fillPoly(ctx, ltTrimQ, 'rgba(15,23,42,0.28)')
  strokePoly(ctx, ltTrimQ)

  const rtTrimTL = { x: iR, y: iB - (iB - iT) * trimFrac }
  const rtTrimTR = { x: oR, y: oB - (oB - oT) * trimFrac }
  const rtTrimQ = [rtTrimTL, rtTrimTR, { x: oR, y: oB }, { x: iR, y: iB }]
  fillPoly(ctx, rtTrimQ, trimHex)
  fillPoly(ctx, rtTrimQ, 'rgba(15,23,42,0.20)')
  strokePoly(ctx, rtTrimQ)

  const label = (text: string, x: number, y: number, bg: string) => {
    const pad = 6
    ctx.font = '600 11px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const textWidth = ctx.measureText(text).width
    ctx.save()
    ctx.fillStyle = bg
    ctx.globalAlpha = 0.82
    ctx.beginPath()
    ctx.roundRect(x - textWidth / 2 - pad, y - 10, textWidth + pad * 2, 20, 6)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = getContrastTextColor(bg)
    ctx.fillText(text, x, y)
    ctx.restore()
  }

  label(`Ceiling · ${ceilingColor?.name ?? 'Neutral'}`, width / 2, oT + (iT - oT) * 0.5, ceilingHex)

  const frontPrimary = frontWall.pattern === 'solid'
    ? (frontWall.solidColor?.hex ?? '#64748b')
    : frontWall.pattern === 'twoTone'
      ? (frontWall.upperColor?.hex ?? '#64748b')
      : (frontWall.middleColor?.hex ?? '#64748b')
  label(`Wall ${frontIdx + 1}`, (iL + iR) / 2, iT + 22, frontPrimary)

  if (wallTotal >= 2) {
    const leftPrimary = leftWall.pattern === 'solid'
      ? (leftWall.solidColor?.hex ?? '#64748b')
      : leftWall.pattern === 'twoTone'
        ? (leftWall.upperColor?.hex ?? '#64748b')
        : (leftWall.middleColor?.hex ?? '#64748b')
    label(`Wall ${leftIdx + 1}`, oL + (iL - oL) * 0.42, oT + (oB - oT) * 0.38, leftPrimary)
  }

  if (wallTotal >= 3) {
    const rightPrimary = rightWall.pattern === 'solid'
      ? (rightWall.solidColor?.hex ?? '#64748b')
      : rightWall.pattern === 'twoTone'
        ? (rightWall.upperColor?.hex ?? '#64748b')
        : (rightWall.middleColor?.hex ?? '#64748b')
    label(`Wall ${rightIdx + 1}`, iR + (oR - iR) * 0.58, oT + (oB - oT) * 0.38, rightPrimary)
  }

  label(`Trim · ${trimColor?.name ?? 'Neutral'}`, (iL + iR) / 2, (iB + trimTop) / 2 + 1, trimHex)

  ctx.fillStyle = '#64748b'
  ctx.font = '500 11px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    `Inside room · Viewing Wall ${frontIdx + 1} (front) | Wall ${leftIdx + 1} (left) | Wall ${rightIdx + 1} (right) · Angle ${viewAngleDeg}°`,
    width / 2,
    height - 18
  )
}

const drawThreeDAllWallsLayout = (
  canvas: HTMLCanvasElement,
  walls: WallConfig[],
  ceilingColor: Color | null,
  trimColor: Color | null,
  images: Record<string, HTMLImageElement | undefined>,
  scale = 1
) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const wallCount = walls.length
  if (!wallCount) {
    canvas.width = 640
    canvas.height = 360
    canvas.style.width = '640px'
    canvas.style.height = '360px'
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, 640, 360)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, 640, 360)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 16px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('No walls configured', 320, 180)
    return
  }

  const panelWidth = 180
  const panelGap = 12
  const sidePad = 36
  const topPad = 34
  const bottomPad = 34

  const width = sidePad * 2 + wallCount * panelWidth + (wallCount - 1) * panelGap
  const height = 430
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const bgGrad = ctx.createLinearGradient(0, 0, 0, height)
  bgGrad.addColorStop(0, '#0f172a')
  bgGrad.addColorStop(1, '#1e293b')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, width, height)

  const wallsTop = topPad + 72
  const wallsBottom = height - bottomPad - 78
  const wallHeight = wallsBottom - wallsTop
  const ceilingTop = topPad + 12
  const ceilingBottom = wallsTop
  const trimTop = wallsBottom
  const trimBottom = wallsBottom + 38

  const left = sidePad
  const right = width - sidePad
  const perspectiveInset = 30
  const roofPerspectiveInset = 56

  const ceilingHex = ceilingColor?.hex ?? '#f8fafc'
  const trimHex = trimColor?.hex ?? '#f1f5f9'

  const ceilingQuad = [
    { x: left, y: ceilingBottom },
    { x: right, y: ceilingBottom },
    { x: right - roofPerspectiveInset, y: ceilingTop },
    { x: left + roofPerspectiveInset, y: ceilingTop },
  ]
  fillPoly(ctx, ceilingQuad, ceilingHex)
  fillPoly(ctx, ceilingQuad, 'rgba(255,255,255,0.14)')
  strokePoly(ctx, ceilingQuad)

  const trimQuad = [
    { x: left + perspectiveInset, y: trimTop },
    { x: right - perspectiveInset, y: trimTop },
    { x: right, y: trimBottom },
    { x: left, y: trimBottom },
  ]
  fillPoly(ctx, trimQuad, trimHex)
  fillPoly(ctx, trimQuad, 'rgba(15,23,42,0.22)')
  strokePoly(ctx, trimQuad)

  const textureWidth = 520
  const textureHeight = 360

  walls.forEach((wall, index) => {
    const baseX = sidePad + index * (panelWidth + panelGap)
    const inset = index % 2 === 0 ? perspectiveInset : Math.round(perspectiveInset * 0.75)

    const quad = [
      { x: baseX + inset, y: wallsTop },
      { x: baseX + panelWidth - inset, y: wallsTop },
      { x: baseX + panelWidth, y: wallsBottom },
      { x: baseX, y: wallsBottom },
    ]

    const texture = renderWallSurface(wall, images[wall.id], textureWidth, textureHeight)
    drawTexturedQuad(ctx, texture, quad[0], quad[1], quad[2], quad[3], textureWidth, textureHeight)

    const sideShade = ctx.createLinearGradient(baseX, 0, baseX + panelWidth, 0)
    sideShade.addColorStop(0, 'rgba(15,23,42,0.18)')
    sideShade.addColorStop(0.5, 'rgba(15,23,42,0.03)')
    sideShade.addColorStop(1, 'rgba(15,23,42,0.18)')
    fillPoly(ctx, quad, sideShade)
    strokePoly(ctx, quad)

    const labelBg =
      wall.pattern === 'solid'
        ? wall.solidColor?.hex ?? '#64748b'
        : wall.pattern === 'twoTone'
          ? wall.upperColor?.hex ?? '#64748b'
          : wall.middleColor?.hex ?? '#64748b'

    const labelText = `Wall ${index + 1}`
    const labelX = baseX + panelWidth / 2
    const labelY = trimBottom + 20
    const pad = 7
    ctx.save()
    ctx.font = '600 11px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(labelText).width
    ctx.fillStyle = labelBg
    ctx.globalAlpha = 0.88
    ctx.beginPath()
    ctx.roundRect(labelX - tw / 2 - pad, labelY - 10, tw + pad * 2, 20, 6)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = getContrastTextColor(labelBg)
    ctx.fillText(labelText, labelX, labelY)
    ctx.restore()
  })

  ctx.fillStyle = '#cbd5e1'
  ctx.font = '500 11px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('3D box view · All walls side-by-side', width / 2, height - 14)
}

// ─── Flat Color Swatch Panel ──────────────────────────────────────────────────
// Pure CSS/div panel showing exact paint colors — no image processing involved.

interface ColorSwatchPanelProps {
  walls: WallConfig[]
  ceilingColor: Color | null
  trimColor: Color | null
  activeWallId: string | null
  activeElement: string
  colorViewMode: 'flat' | 'threeD'
  threeDPreviewMode: 'room' | 'allWalls'
  viewAngleDeg: number
  onSelectWall: (id: string) => void
  onSelectCeiling: () => void
  onSelectTrim: () => void
}

function WallSwatchBlock({
  wall,
  isActive,
  colorViewMode,
  onSelect,
}: {
  wall: WallConfig
  isActive: boolean
  colorViewMode: 'flat' | 'threeD'
  onSelect: () => void
}) {
  const renderBands = () => {
    if (wall.pattern === 'solid') {
      return <div className="h-full w-full" style={{ backgroundColor: wall.solidColor?.hex ?? '#cbd5e1' }} />
    }
    if (wall.pattern === 'twoTone') {
      const split = wall.splitPercentage ?? 60
      return (
        <div className="flex h-full w-full flex-col">
          <div style={{ height: `${split}%`, backgroundColor: wall.upperColor?.hex ?? '#cbd5e1' }} />
          <div style={{ height: `${100 - split}%`, backgroundColor: wall.lowerColor?.hex ?? '#94a3b8' }} />
        </div>
      )
    }
    const sp = wall.stripePercentage ?? 15
    const topPct = (100 - sp) / 2
    return (
      <div className="flex h-full w-full flex-col">
        <div style={{ height: `${topPct}%`, backgroundColor: wall.topColor?.hex ?? '#cbd5e1' }} />
        <div style={{ height: `${sp}%`, backgroundColor: wall.middleColor?.hex ?? '#64748b' }} />
        <div style={{ height: `${topPct}%`, backgroundColor: wall.bottomColor?.hex ?? '#cbd5e1' }} />
      </div>
    )
  }

  const patternLabel =
    wall.pattern === 'solid' ? 'Solid' : wall.pattern === 'twoTone' ? 'Two-Tone' : 'Accent Stripe'
  const wallNum = wall.id.split('-')[1]

  return (
    <button type="button" onClick={onSelect} className="group flex flex-col items-center gap-2 focus:outline-none">
      <div
        className={`h-40 w-28 overflow-hidden rounded-xl border-2 transition-all ${
          isActive ? 'border-sky-500 ring-2 ring-sky-200' : 'border-slate-200 group-hover:border-slate-400'
        } ${colorViewMode === 'threeD' ? 'shadow-lg [perspective:900px]' : 'shadow-sm'}`}
      >
        <div
          className={`h-full w-full ${
            colorViewMode === 'threeD'
              ? 'origin-bottom transition-transform duration-300 [transform:rotateX(18deg)_rotateY(-12deg)_scale(0.96)]'
              : ''
          }`}
        >
          {renderBands()}
        </div>
      </div>
      <span className="text-xs font-semibold text-slate-500">Wall {wallNum}</span>
      <span className="text-xs text-slate-400">{patternLabel}</span>
    </button>
  )
}

function ThreeDColorSwatchCanvas({
  walls,
  ceilingColor,
  trimColor,
  threeDPreviewMode,
  viewAngleDeg,
  activeWallId,
  activeElement,
  onSelectWall,
  onSelectCeiling,
  onSelectTrim,
}: {
  walls: WallConfig[]
  ceilingColor: Color | null
  trimColor: Color | null
  threeDPreviewMode: 'room' | 'allWalls'
  viewAngleDeg: number
  activeWallId: string | null
  activeElement: string
  onSelectWall: (id: string) => void
  onSelectCeiling: () => void
  onSelectTrim: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (threeDPreviewMode === 'allWalls') {
      drawThreeDAllWallsLayout(canvasRef.current, walls, ceilingColor, trimColor, {}, 1)
      return
    }
    drawThreeDLayout(canvasRef.current, walls, ceilingColor, trimColor, {}, viewAngleDeg, 1)
  }, [walls, ceilingColor, trimColor, threeDPreviewMode, viewAngleDeg])

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <canvas ref={canvasRef} className="mx-auto block" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onSelectCeiling}
          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
            activeElement === 'ceiling' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Ceiling
        </button>
        {walls.map((wall, index) => (
          <button
            key={wall.id}
            type="button"
            onClick={() => onSelectWall(wall.id)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              activeWallId === wall.id && activeElement === 'wall'
                ? 'border-sky-500 bg-sky-50 text-sky-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Wall {index + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={onSelectTrim}
          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
            activeElement === 'trim' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Trim
        </button>
      </div>
    </div>
  )
}

function ColorSwatchPanel({
  walls,
  ceilingColor,
  trimColor,
  activeWallId,
  activeElement,
  colorViewMode,
  threeDPreviewMode,
  viewAngleDeg,
  onSelectWall,
  onSelectCeiling,
  onSelectTrim,
}: ColorSwatchPanelProps) {
  return (
    <div className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Color Swatch View</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Exact paint colors shown as swatches while the preview above stays synchronized in flat or 3D mode.
        </p>
      </div>

      {/* Ceiling strip */}
      {colorViewMode === 'flat' && (
        <button
          type="button"
          onClick={onSelectCeiling}
          className={`mb-3 flex h-10 w-full items-center justify-center rounded-2xl border-2 text-xs font-bold uppercase tracking-widest transition ${
            activeElement === 'ceiling' ? 'border-sky-500 ring-2 ring-sky-200' : 'border-transparent hover:border-slate-300'
          }`}
          style={{
            backgroundColor: ceilingColor?.hex ?? '#f8fafc',
            color: getContrastTextColor(ceilingColor?.hex ?? '#f8fafc'),
          }}
        >
          Ceiling · {ceilingColor?.name ?? '—'}
        </button>
      )}

      {colorViewMode === 'threeD' ? (
        <div className="py-1">
          <ThreeDColorSwatchCanvas
            walls={walls}
            ceilingColor={ceilingColor}
            trimColor={trimColor}
            threeDPreviewMode={threeDPreviewMode}
            viewAngleDeg={viewAngleDeg}
            activeWallId={activeWallId}
            activeElement={activeElement}
            onSelectWall={onSelectWall}
            onSelectCeiling={onSelectCeiling}
            onSelectTrim={onSelectTrim}
          />
        </div>
      ) : (
        <>
          {/* Wall swatches */}
          <div className="flex flex-wrap justify-center gap-4 px-2 py-2">
            {walls.map((wall) => (
              <WallSwatchBlock
                key={wall.id}
                wall={wall}
                isActive={activeWallId === wall.id && activeElement === 'wall'}
                colorViewMode={colorViewMode}
                onSelect={() => onSelectWall(wall.id)}
              />
            ))}
          </div>

          {/* Trim strip */}
          <button
            type="button"
            onClick={onSelectTrim}
            className={`mt-3 flex h-8 w-full items-center justify-center rounded-2xl border-2 text-xs font-bold uppercase tracking-widest transition ${
              activeElement === 'trim' ? 'border-sky-500 ring-2 ring-sky-200' : 'border-transparent hover:border-slate-300'
            }`}
            style={{
              backgroundColor: trimColor?.hex ?? '#f1f5f9',
              color: getContrastTextColor(trimColor?.hex ?? '#f1f5f9'),
            }}
          >
            Trim / Baseboards · {trimColor?.name ?? '—'}
          </button>
        </>
      )}
    </div>
  )
}

export function RoomPreview() {
  const walls = useRoomStore((state) => state.walls)
  const wallCount = useRoomStore((state) => state.wallCount)
  const activeWallId = useRoomStore((state) => state.activeWallId)
  const activeElement = useRoomStore((state) => state.activeElement)
  const ceilingColor = useRoomStore((state) => state.ceilingColor)
  const trimColor = useRoomStore((state) => state.trimColor)
  const version = useRoomStore((state) => state.version)
  const setActiveWallId = useRoomStore((state) => state.setActiveWallId)
  const setActiveElement = useRoomStore((state) => state.setActiveElement)

  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal')
  const [colorViewMode, setColorViewMode] = useState<'flat' | 'threeD'>('flat')
  const [threeDPreviewMode, setThreeDPreviewMode] = useState<'room' | 'allWalls'>('room')
  const [viewAngleDeg, setViewAngleDeg] = useState(0)
  const [imageMap, setImageMap] = useState<Record<string, HTMLImageElement>>({})
  const [isModalOpen, setIsModalOpen] = useState(false)
  const splitPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const wallsToRender = useMemo(() => walls.slice(0, wallCount), [walls, wallCount])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')
    const handleResize = () => setLayoutMode(mediaQuery.matches ? 'vertical' : 'horizontal')
    handleResize()
    mediaQuery.addEventListener('change', handleResize)
    return () => mediaQuery.removeEventListener('change', handleResize)
  }, [])

  useEffect(() => {
    wallsToRender.forEach((wall) => {
      if (!wall.photoPreviewUrl) return
      const cached = imageMap[wall.id]
      if (cached && cached.src === wall.photoPreviewUrl) return
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = wall.photoPreviewUrl
      image.onload = () => setImageMap((current) => ({ ...current, [wall.id]: image }))
    })
  }, [wallsToRender, imageMap])

  const drawSplitPreview = useCallback(() => {
    if (!splitPreviewCanvasRef.current) return

    if (colorViewMode === 'flat') {
      drawUnfoldedLayout(splitPreviewCanvasRef.current, wallsToRender, ceilingColor, trimColor, layoutMode, imageMap, 1)
      return
    }

    if (threeDPreviewMode === 'allWalls') {
      drawThreeDAllWallsLayout(splitPreviewCanvasRef.current, wallsToRender, ceilingColor, trimColor, imageMap, 1)
      return
    }

    drawThreeDLayout(splitPreviewCanvasRef.current, wallsToRender, ceilingColor, trimColor, imageMap, viewAngleDeg, 1)
  }, [colorViewMode, threeDPreviewMode, wallsToRender, ceilingColor, trimColor, layoutMode, imageMap, viewAngleDeg, version])

  useEffect(() => {
    drawSplitPreview()
  }, [drawSplitPreview])

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Unfolded Room Layout</h2>
          <p className="text-xs text-slate-500">
            Exact color swatch view with all panels visible.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            Generate Final Combined View
          </button>
        </div>
      </div>

        <div className="space-y-6 rounded-3xl border border-violet-200 bg-violet-50 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Split Color Preview</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Top panel shows the uploaded-image preview. Bottom panel keeps the exact paint swatches in sync.
              </p>
            </div>
            <div className="inline-flex rounded-xl border border-violet-200 bg-white p-1 self-start">
              <button
                type="button"
                onClick={() => setColorViewMode('flat')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  colorViewMode === 'flat' ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Flat
              </button>
              <button
                type="button"
                onClick={() => setColorViewMode('threeD')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  colorViewMode === 'threeD' ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                3D
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                    {colorViewMode === 'flat'
                      ? 'Uploaded Image Preview'
                      : threeDPreviewMode === 'allWalls'
                        ? '3D · All Walls Image View'
                        : '3D Room Preview'}
                </h4>
                <p className="text-xs text-slate-500">
                  {colorViewMode === 'flat'
                    ? 'Photo-based unfolded preview with your applied wall colors.'
                      : threeDPreviewMode === 'allWalls'
                        ? 'All walls are shown next to each other like the image view while keeping 3D mode active.'
                        : 'Switch the room perspective here without opening the final combined view.'}
                </p>
              </div>
              {colorViewMode === 'threeD' && (
                <div className="flex flex-col items-start gap-2">
                  <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setThreeDPreviewMode('room')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        threeDPreviewMode === 'room' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Room
                    </button>
                    <button
                      type="button"
                      onClick={() => setThreeDPreviewMode('allWalls')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        threeDPreviewMode === 'allWalls' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      All Walls
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ANGLE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setViewAngleDeg(preset.angle)}
                        disabled={threeDPreviewMode === 'allWalls'}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                          threeDPreviewMode === 'allWalls'
                            ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                            : viewAngleDeg === preset.angle
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

              {colorViewMode === 'threeD' && threeDPreviewMode === 'room' && (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="mb-2 flex items-center justify-between text-sm text-slate-700">
                  <span className="font-medium">View Angle</span>
                  <span className="font-semibold text-slate-900">{viewAngleDeg}°</span>
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

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <canvas ref={splitPreviewCanvasRef} className="mx-auto block" />
            </div>
          </div>

          <ColorSwatchPanel
            walls={wallsToRender}
            ceilingColor={ceilingColor}
            trimColor={trimColor}
            activeWallId={activeWallId}
            activeElement={activeElement}
            colorViewMode={colorViewMode}
            threeDPreviewMode={threeDPreviewMode}
            viewAngleDeg={viewAngleDeg}
            onSelectWall={(id) => {
              setActiveWallId(id)
              setActiveElement('wall')
            }}
            onSelectCeiling={() => setActiveElement('ceiling')}
            onSelectTrim={() => setActiveElement('trim')}
          />
        </div>

      {
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setActiveElement('ceiling')}
            className={`rounded-3xl border p-4 text-left transition ${activeElement === 'ceiling' ? 'border-sky-500 ring-2 ring-sky-200' : 'border-slate-200 hover:border-slate-300'}`}
            style={{ backgroundColor: ceilingColor?.hex ?? '#f8fafc' }}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Ceiling</div>
            <div className="mt-3 text-sm text-slate-700">{ceilingColor?.name}</div>
          </button>

          {wallsToRender.map((wall) => {
            let primaryColor = '#E2E8F0'
            if (wall.pattern === 'solid' && wall.solidColor) primaryColor = wall.solidColor.hex
            else if (wall.pattern === 'twoTone' && wall.upperColor) primaryColor = wall.upperColor.hex
            else if (wall.pattern === 'stripe' && wall.middleColor) primaryColor = wall.middleColor.hex

            return (
              <button
                key={wall.id}
                type="button"
                onClick={() => {
                  setActiveWallId(wall.id)
                  setActiveElement('wall')
                }}
                style={{ backgroundColor: primaryColor }}
                className={`relative rounded-3xl border p-4 text-left transition ${
                  activeWallId === wall.id && activeElement === 'wall'
                    ? 'border-sky-500 ring-2 ring-sky-200'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="absolute inset-x-4 top-4 rounded-2xl bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 backdrop-blur-sm">
                  {`Wall ${wall.id.split('-')[1]}`}
                </div>
                <div className="mt-10 text-sm" style={{ color: getContrastTextColor(primaryColor) }}>
                  Pattern: {wall.pattern === 'solid' ? 'Solid' : wall.pattern === 'twoTone' ? 'Two-Tone' : 'Accent Stripe'}
                </div>
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => setActiveElement('trim')}
            className={`rounded-3xl border p-4 text-left transition ${activeElement === 'trim' ? 'border-sky-500 ring-2 ring-sky-200' : 'border-slate-200 hover:border-slate-300'}`}
            style={{ backgroundColor: trimColor?.hex ?? '#f1f5f9' }}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Trim / Baseboards</div>
            <div className="mt-3 text-sm text-slate-700">{trimColor?.name}</div>
          </button>
        </div>
      }

      <FinalViewModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        walls={wallsToRender}
        ceilingColor={ceilingColor}
        trimColor={trimColor}
        layoutMode={layoutMode}
        imageMap={imageMap}
      />
    </div>
  )
}
