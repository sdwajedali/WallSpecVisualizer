import { useEffect, useMemo, useRef, useState } from 'react'
import { useRoomStore, type WallConfig } from '../store/useRoomStore'
import { getContrastTextColor, type Color } from '../lib/colorUtils'

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
    drawWallPattern(context, x, y, WALL_WIDTH, WALL_HEIGHT, wall)
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
  width: number,
  height: number
): HTMLCanvasElement => {
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
  const frontTex = renderWallSurface(frontWall, textureWidth, textureHeight)
  const leftTex = wallTotal >= 2 ? renderWallSurface(leftWall, textureWidth, textureHeight) : frontTex
  const rightTex = wallTotal >= 2 ? renderWallSurface(rightWall, textureWidth, textureHeight) : frontTex

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

    const texture = renderWallSurface(wall, textureWidth, textureHeight)
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
  setColorViewMode: (mode: 'flat' | 'threeD') => void
  setThreeDPreviewMode: (mode: 'room' | 'allWalls') => void
  setViewAngleDeg: (angle: number) => void
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

  const colorLines: { label: string; hex: string; name: string }[] = []
  if (wall.pattern === 'solid') {
    if (wall.solidColor) colorLines.push({ label: '', hex: wall.solidColor.hex, name: wall.solidColor.name })
  } else if (wall.pattern === 'twoTone') {
    if (wall.upperColor) colorLines.push({ label: 'Upper', hex: wall.upperColor.hex, name: wall.upperColor.name })
    if (wall.lowerColor) colorLines.push({ label: 'Lower', hex: wall.lowerColor.hex, name: wall.lowerColor.name })
  } else {
    if (wall.topColor) colorLines.push({ label: 'Top', hex: wall.topColor.hex, name: wall.topColor.name })
    if (wall.middleColor) colorLines.push({ label: 'Stripe', hex: wall.middleColor.hex, name: wall.middleColor.name })
    if (wall.bottomColor) colorLines.push({ label: 'Bottom', hex: wall.bottomColor.hex, name: wall.bottomColor.name })
  }

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
      <div className="flex flex-col items-center gap-0.5">
        {colorLines.map((c) => (
          <div key={c.label + c.hex} className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 flex-shrink-0 rounded-full border border-slate-200"
              style={{ backgroundColor: c.hex }}
            />
            <span className="text-[10px] text-slate-500 leading-tight">
              {c.label ? `${c.label}: ` : ''}{c.name} · {c.hex}
            </span>
          </div>
        ))}
      </div>
    </button>
  )
}

const pointInPoly = (px: number, py: number, poly: { x: number; y: number }[]): boolean => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
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
      drawThreeDAllWallsLayout(canvasRef.current, walls, ceilingColor, trimColor, 1)
      return
    }
    drawThreeDLayout(canvasRef.current, walls, ceilingColor, trimColor, viewAngleDeg, 1)
  }, [walls, ceilingColor, trimColor, threeDPreviewMode, viewAngleDeg])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const logicalW = parseFloat(canvas.style.width) || canvas.width
    const logicalH = parseFloat(canvas.style.height) || canvas.height
    const x = (e.clientX - rect.left) * (logicalW / rect.width)
    const y = (e.clientY - rect.top) * (logicalH / rect.height)

    if (threeDPreviewMode === 'allWalls') {
      const sidePad = 36, panelWidth = 180, panelGap = 12
      const wallCount = walls.length
      const width = sidePad * 2 + wallCount * panelWidth + (wallCount - 1) * panelGap
      const wallsTop = 106, wallsBottom = 318
      const perspectiveInset = 30, roofPerspectiveInset = 56
      const left = sidePad, right = width - sidePad
      const ceilingTop = 46
      const trimBottom = wallsBottom + 38

      const ceilQ = [
        { x: left, y: wallsTop }, { x: right, y: wallsTop },
        { x: right - roofPerspectiveInset, y: ceilingTop }, { x: left + roofPerspectiveInset, y: ceilingTop },
      ]
      if (pointInPoly(x, y, ceilQ)) { onSelectCeiling(); return }

      const trimQ = [
        { x: left + perspectiveInset, y: wallsBottom }, { x: right - perspectiveInset, y: wallsBottom },
        { x: right, y: trimBottom }, { x: left, y: trimBottom },
      ]
      if (pointInPoly(x, y, trimQ)) { onSelectTrim(); return }

      for (let i = 0; i < walls.length; i++) {
        const baseX = sidePad + i * (panelWidth + panelGap)
        const inset = i % 2 === 0 ? perspectiveInset : Math.round(perspectiveInset * 0.75)
        const quad = [
          { x: baseX + inset, y: wallsTop }, { x: baseX + panelWidth - inset, y: wallsTop },
          { x: baseX + panelWidth, y: wallsBottom }, { x: baseX, y: wallsBottom },
        ]
        if (pointInPoly(x, y, quad)) { onSelectWall(walls[i].id); return }
      }
    } else {
      const width = THREE_D_BASE_WIDTH, height = THREE_D_BASE_HEIGHT
      const padX = 52, padY = 58
      const oL = padX, oR = width - padX
      const oT = padY + 28, oB = height - padY - 28
      const depthH = 0.46, depthV = 0.4
      const iL = oL + (oR - oL) * depthH * 0.5
      const iR = oR - (oR - oL) * depthH * 0.5
      const iT = oT + (oB - oT) * depthV * 0.5
      const iB = oB - (oB - oT) * depthV * 0.5

      const wallTotal = walls.length
      const normalizedAngle = ((viewAngleDeg % 360) + 360) % 360
      const frontIdx = Math.round(normalizedAngle / (360 / wallTotal)) % wallTotal
      const leftIdx = (frontIdx - 1 + wallTotal) % wallTotal
      const rightIdx = (frontIdx + 1) % wallTotal

      const ceilQ = [{ x: oL, y: oT }, { x: oR, y: oT }, { x: iR, y: iT }, { x: iL, y: iT }]
      if (pointInPoly(x, y, ceilQ)) { onSelectCeiling(); return }

      const backQ = [{ x: iL, y: iT }, { x: iR, y: iT }, { x: iR, y: iB }, { x: iL, y: iB }]
      const trimFrac = 0.13
      const trimTopY = iB - (iB - iT) * trimFrac
      const trimQ = [{ x: iL, y: trimTopY }, { x: iR, y: trimTopY }, { x: iR, y: iB }, { x: iL, y: iB }]
      if (pointInPoly(x, y, trimQ)) { onSelectTrim(); return }
      if (pointInPoly(x, y, backQ)) { onSelectWall(walls[frontIdx].id); return }

      const leftQ = [{ x: oL, y: oT }, { x: iL, y: iT }, { x: iL, y: iB }, { x: oL, y: oB }]
      if (wallTotal >= 2 && pointInPoly(x, y, leftQ)) { onSelectWall(walls[leftIdx].id); return }

      const rightQ = [{ x: iR, y: iT }, { x: oR, y: oT }, { x: oR, y: oB }, { x: iR, y: iB }]
      if (wallTotal >= 3 && pointInPoly(x, y, rightQ)) { onSelectWall(walls[rightIdx].id); return }
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <canvas ref={canvasRef} className="mx-auto block cursor-pointer" onClick={handleCanvasClick} />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onSelectCeiling}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
            activeElement === 'ceiling' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span
            className="inline-block h-3 w-3 flex-shrink-0 rounded-full border border-slate-200"
            style={{ backgroundColor: ceilingColor?.hex ?? '#f8fafc' }}
          />
          <span>Ceiling · {ceilingColor?.name ?? '—'} · {ceilingColor?.hex ?? '—'}</span>
        </button>
        {walls.map((wall, index) => {
          const primaryHex =
            wall.pattern === 'solid' ? wall.solidColor?.hex
            : wall.pattern === 'twoTone' ? wall.upperColor?.hex
            : wall.middleColor?.hex
          const primaryName =
            wall.pattern === 'solid' ? wall.solidColor?.name
            : wall.pattern === 'twoTone' ? wall.upperColor?.name
            : wall.middleColor?.name
          return (
            <button
              key={wall.id}
              type="button"
              onClick={() => onSelectWall(wall.id)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                activeWallId === wall.id && activeElement === 'wall'
                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span
                className="inline-block h-3 w-3 flex-shrink-0 rounded-full border border-slate-200"
                style={{ backgroundColor: primaryHex ?? '#cbd5e1' }}
              />
              <span>Wall {index + 1} · {primaryName ?? '—'} · {primaryHex ?? '—'}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={onSelectTrim}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
            activeElement === 'trim' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span
            className="inline-block h-3 w-3 flex-shrink-0 rounded-full border border-slate-200"
            style={{ backgroundColor: trimColor?.hex ?? '#f1f5f9' }}
          />
          <span>Trim · {trimColor?.name ?? '—'} · {trimColor?.hex ?? '—'}</span>
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
  setColorViewMode,
  setThreeDPreviewMode,
  setViewAngleDeg,
  onSelectWall,
  onSelectCeiling,
  onSelectTrim,
}: ColorSwatchPanelProps) {
  return (
    <div className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Color Swatch View</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Exact paint colors in flat swatches or 3D room mode with quick element selection.
          </p>
        </div>
        <div className="inline-flex self-start rounded-xl border border-violet-200 bg-white p-1">
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

      {colorViewMode === 'threeD' && (
        <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
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
          Ceiling · {ceilingColor?.name ?? '—'} · {ceilingColor?.hex ?? '—'}
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
            Trim / Baseboards · {trimColor?.name ?? '—'} · {trimColor?.hex ?? '—'}
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
  const setActiveWallId = useRoomStore((state) => state.setActiveWallId)
  const setActiveElement = useRoomStore((state) => state.setActiveElement)

  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal')
  const [colorViewMode, setColorViewMode] = useState<'flat' | 'threeD'>('flat')
  const [threeDPreviewMode, setThreeDPreviewMode] = useState<'room' | 'allWalls'>('room')
  const [viewAngleDeg, setViewAngleDeg] = useState(0)

  const wallsToRender = useMemo(() => walls.slice(0, wallCount), [walls, wallCount])

  const downloadImage = () => {
    const scale = 3
    const offscreen = document.createElement('canvas')
    let filename = 'room-harmony.png'
    if (colorViewMode === 'flat') {
      drawUnfoldedLayout(offscreen, wallsToRender, ceilingColor, trimColor, layoutMode, scale)
      filename = 'room-harmony-flat.png'
    } else if (threeDPreviewMode === 'allWalls') {
      drawThreeDAllWallsLayout(offscreen, wallsToRender, ceilingColor, trimColor, scale)
      filename = 'room-harmony-3d-all-walls.png'
    } else {
      drawThreeDLayout(offscreen, wallsToRender, ceilingColor, trimColor, viewAngleDeg, scale)
      filename = 'room-harmony-3d-room.png'
    }
    const link = document.createElement('a')
    link.download = filename
    link.href = offscreen.toDataURL('image/png')
    link.click()
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')
    const handleResize = () => setLayoutMode(mediaQuery.matches ? 'vertical' : 'horizontal')
    handleResize()
    mediaQuery.addEventListener('change', handleResize)
    return () => mediaQuery.removeEventListener('change', handleResize)
  }, [])

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Room Color Preview</h2>
          <p className="text-xs text-slate-500">
            Switch between flat and 3D views in one place while keeping paint selection fast.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadImage}
          className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
        >
          Download Image
        </button>
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
            setColorViewMode={setColorViewMode}
            setThreeDPreviewMode={setThreeDPreviewMode}
            setViewAngleDeg={setViewAngleDeg}
            onSelectWall={(id) => {
              setActiveWallId(id)
              setActiveElement('wall')
            }}
            onSelectCeiling={() => setActiveElement('ceiling')}
            onSelectTrim={() => setActiveElement('trim')}
          />

    </div>
  )
}
