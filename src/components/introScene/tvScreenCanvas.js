/**
 * 2D canvas drawing for the attract-mode TV UI (title, HUD pills, EQ, start button). Fed into a texture each frame.
 */

export function drawHudPill(
  ctx,
  x,
  y,
  width,
  height,
  label,
  {
    fill = 'rgba(45, 17, 62, 0.92)',
    stroke = '#ffd166',
    text = '#fff6d8',
    glow = 'rgba(255, 209, 102, 0.45)',
    font = '900 28px "Nunito", sans-serif',
  } = {}
) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x - width / 2, y - height / 2, width, height, height / 2)
  ctx.fillStyle = fill
  ctx.shadowColor = glow
  ctx.shadowBlur = 16
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = stroke
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = text
  ctx.font = font
  ctx.fillText(label, x, y + 1)
  ctx.restore()
}

export function drawSparkle(ctx, x, y, size, color, rotation = 0, alpha = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.globalAlpha *= alpha
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(2, size * 0.15)

  ctx.beginPath()
  ctx.moveTo(-size, 0)
  ctx.lineTo(size, 0)
  ctx.moveTo(0, -size)
  ctx.lineTo(0, size)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(-size * 0.55, -size * 0.55)
  ctx.lineTo(size * 0.55, size * 0.55)
  ctx.moveTo(size * 0.55, -size * 0.55)
  ctx.lineTo(-size * 0.55, size * 0.55)
  ctx.stroke()
  ctx.restore()
}

export function drawPawPrint(ctx, x, y, scale, color, alpha = 1, rotation = 0) {
  const pad = 22 * scale
  const toe = 8 * scale

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.globalAlpha *= alpha
  ctx.fillStyle = color

  ctx.beginPath()
  ctx.ellipse(0, 0, pad, pad * 0.8, 0, 0, Math.PI * 2)
  ctx.fill()

  ;[
    [-pad * 0.9, -pad * 0.9],
    [-pad * 0.3, -pad * 1.2],
    [pad * 0.3, -pad * 1.2],
    [pad * 0.9, -pad * 0.9],
  ].forEach(([toeX, toeY]) => {
    ctx.beginPath()
    ctx.ellipse(toeX, toeY, toe, toe * 1.1, 0, 0, Math.PI * 2)
    ctx.fill()
  })

  ctx.restore()
}

export function drawTvScreen(ctx, canvas, time, { hovered = false, disabled = false, buttonLabel = 'PRESS START' } = {}) {
  const { width, height } = canvas
  const flicker = 0.96 + Math.sin(time * 12) * 0.02
  const pulse = 0.5 + Math.sin(time * 2.6) * 0.5
  const marqueePulse = 0.5 + Math.sin(time * 8.4) * 0.5
  const hoverMix = hovered && !disabled ? 1 : 0
  const horizonY = height * 0.57

  ctx.clearRect(0, 0, width, height)
  ctx.globalAlpha = flicker
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
  bgGradient.addColorStop(0, '#12051f')
  bgGradient.addColorStop(0.36, '#41195f')
  bgGradient.addColorStop(0.68, '#a63f6b')
  bgGradient.addColorStop(1, '#ff934f')
  ctx.fillStyle = bgGradient
  ctx.fillRect(0, 0, width, height)

  for (let index = 0; index < 18; index += 1) {
    const x = width * (0.08 + (index * 0.0513) % 0.84)
    const y = height * (0.08 + ((index * 0.117) % 0.28))
    const size = 5 + (index % 4) * 2 + pulse * 1.5
    const alpha = 0.35 + (0.5 + Math.sin(time * (2 + index * 0.09) + index) * 0.5) * 0.55
    drawSparkle(ctx, x, y, size, '#ffe8a3', index * 0.38, alpha)
  }

  const sunX = width * 0.5
  const sunY = height * 0.34
  const sunRadius = width * 0.17
  const sunGradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 1.5)
  sunGradient.addColorStop(0, 'rgba(255, 247, 200, 0.98)')
  sunGradient.addColorStop(0.38, 'rgba(255, 190, 94, 0.96)')
  sunGradient.addColorStop(0.78, 'rgba(255, 107, 73, 0.52)')
  sunGradient.addColorStop(1, 'rgba(255, 107, 73, 0)')
  ctx.fillStyle = sunGradient
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = '#ffd76a'
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunRadius * 0.88, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 115, 84, 0.9)'
  for (let stripe = 0; stripe < 8; stripe += 1) {
    const stripeY = sunY - sunRadius * 0.3 + stripe * sunRadius * 0.16
    const stripeHeight = 12 + stripe * 4
    ctx.fillRect(sunX - sunRadius, stripeY, sunRadius * 2, stripeHeight)
  }
  ctx.restore()

  ctx.fillStyle = '#29123f'
  ctx.beginPath()
  ctx.moveTo(0, horizonY)
  ctx.lineTo(width * 0.1, horizonY - 30)
  ctx.lineTo(width * 0.22, horizonY - 95)
  ctx.lineTo(width * 0.34, horizonY - 25)
  ctx.lineTo(width * 0.5, horizonY - 120)
  ctx.lineTo(width * 0.67, horizonY - 18)
  ctx.lineTo(width * 0.81, horizonY - 88)
  ctx.lineTo(width * 0.92, horizonY - 34)
  ctx.lineTo(width, horizonY)
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.closePath()
  ctx.fill()

  const floorGradient = ctx.createLinearGradient(0, horizonY, 0, height)
  floorGradient.addColorStop(0, '#140d24')
  floorGradient.addColorStop(1, '#040205')
  ctx.fillStyle = floorGradient
  ctx.fillRect(0, horizonY, width, height - horizonY)

  ctx.strokeStyle = 'rgba(75, 235, 255, 0.4)'
  ctx.lineWidth = 3
  for (let line = 0; line < 10; line += 1) {
    const y = horizonY + (line / 9) ** 1.7 * (height - horizonY)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  for (let line = -8; line <= 8; line += 1) {
    ctx.beginPath()
    ctx.moveTo(width * 0.5, horizonY)
    ctx.lineTo(width * 0.5 + line * width * 0.1, height)
    ctx.stroke()
  }

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(32, 32, width - 64, height - 64, 38)
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(255, 229, 163, 0.65)'
  ctx.shadowColor = 'rgba(255, 161, 92, 0.28)'
  ctx.shadowBlur = 20
  ctx.stroke()
  ctx.restore()

  drawHudPill(ctx, width * 0.16, height * 0.09, 160, 56, '1UP', {
    fill: 'rgba(54, 15, 64, 0.94)',
    stroke: '#7cf7ff',
    text: '#dbfdff',
    glow: 'rgba(124, 247, 255, 0.5)',
  })
  drawHudPill(ctx, width * 0.5, height * 0.09, 320, 56, 'HI-SCORE 90210', {
    fill: 'rgba(66, 18, 48, 0.92)',
    stroke: '#ffd166',
    text: '#fff5d5',
    glow: 'rgba(255, 209, 102, 0.45)',
  })
  drawHudPill(ctx, width * 0.84, height * 0.09, 170, 56, 'STAGE 01', {
    fill: 'rgba(42, 22, 79, 0.94)',
    stroke: '#ff81b5',
    text: '#ffe3ef',
    glow: 'rgba(255, 129, 181, 0.45)',
  })

  const titleGradient = ctx.createLinearGradient(width * 0.25, height * 0.22, width * 0.75, height * 0.56)
  titleGradient.addColorStop(0, '#fff2a8')
  titleGradient.addColorStop(0.45, '#ffba5f')
  titleGradient.addColorStop(0.78, '#ff6f91')
  titleGradient.addColorStop(1, '#73f7ff')

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 18
  ctx.strokeStyle = '#481752'
  ctx.shadowColor = 'rgba(255, 160, 92, 0.6)'
  ctx.shadowBlur = 28 + hoverMix * 10
  ctx.font = '118px "Knewave", cursive'
  ctx.strokeText('SKATE', width * 0.5, height * 0.33)
  ctx.fillStyle = titleGradient
  ctx.fillText('SKATE', width * 0.5, height * 0.33)
  ctx.strokeText('CAT', width * 0.5, height * 0.48)
  ctx.fillText('CAT', width * 0.5, height * 0.48)
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(width * 0.27, height * 0.51, width * 0.46, 58, 28)
  ctx.fillStyle = 'rgba(19, 13, 42, 0.84)'
  ctx.strokeStyle = '#7cf7ff'
  ctx.lineWidth = 4
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#e5fdff'
  ctx.font = '900 28px "Nunito", sans-serif'
  ctx.fillText('MEOW TO THE BEAT', width * 0.5, height * 0.55)
  ctx.restore()

  drawHudPill(ctx, width * 0.22, height * 0.63, 170, 52, 'JUMP', {
    fill: 'rgba(37, 23, 64, 0.92)',
    stroke: '#7cf7ff',
    text: '#dbfdff',
    glow: 'rgba(124, 247, 255, 0.38)',
    font: '36px "Knewave", cursive',
  })
  drawHudPill(ctx, width * 0.78, height * 0.63, 170, 52, 'GRIND', {
    fill: 'rgba(63, 22, 52, 0.92)',
    stroke: '#ff81b5',
    text: '#ffe8f3',
    glow: 'rgba(255, 129, 181, 0.38)',
    font: '34px "Knewave", cursive',
  })

  for (let bar = 0; bar < 14; bar += 1) {
    const barWidth = 28
    const x = width * 0.27 + bar * (barWidth + 12)
    const barHeight = 20 + (0.5 + Math.sin(time * 5.2 + bar * 0.7) * 0.5) * 64
    const y = height * 0.71 - barHeight
    const barGradient = ctx.createLinearGradient(0, y, 0, y + barHeight)
    barGradient.addColorStop(0, '#fff2a8')
    barGradient.addColorStop(0.55, '#ff7f72')
    barGradient.addColorStop(1, '#73f7ff')
    ctx.fillStyle = barGradient
    ctx.fillRect(x, y, barWidth, barHeight)
  }

  drawPawPrint(ctx, width * 0.12, height * 0.79, 0.72, '#ffd166', 0.38, -0.28)
  drawPawPrint(ctx, width * 0.17, height * 0.86, 0.58, '#ff8db3', 0.34, -0.12)
  drawPawPrint(ctx, width * 0.88, height * 0.79, 0.72, '#7cf7ff', 0.36, 0.22)
  drawSparkle(ctx, width * 0.18, height * 0.24, 11 + pulse * 4, '#fff2a8', time * 0.35, 0.9)
  drawSparkle(ctx, width * 0.82, height * 0.28, 11 + pulse * 4, '#73f7ff', -time * 0.42, 0.9)

  const buttonScale = disabled ? 0.98 : hovered ? 1.08 : 1
  const buttonWidth = width * 0.48 * buttonScale
  const buttonHeight = height * 0.12 * buttonScale
  const buttonX = width * 0.5 - buttonWidth / 2
  const buttonY = height * 0.82 - buttonHeight / 2

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(buttonX - 18, buttonY - 16, buttonWidth + 36, buttonHeight + 32, 42)
  ctx.fillStyle = 'rgba(17, 10, 30, 0.82)'
  ctx.strokeStyle = 'rgba(124, 247, 255, 0.5)'
  ctx.lineWidth = 5
  ctx.shadowColor = hovered ? 'rgba(124, 247, 255, 0.35)' : 'rgba(255, 129, 181, 0.2)'
  ctx.shadowBlur = hovered ? 22 : 14
  ctx.fill()
  ctx.stroke()

  for (let bulb = 0; bulb < 10; bulb += 1) {
    const bulbX = buttonX + 24 + bulb * ((buttonWidth - 48) / 9)
    const glowColor = bulb % 2 === 0 ? '#ffd166' : '#7cf7ff'
    ctx.beginPath()
    ctx.arc(bulbX, buttonY - 8, 5 + marqueePulse * 1.5, 0, Math.PI * 2)
    ctx.fillStyle = glowColor
    ctx.globalAlpha = 0.45 + marqueePulse * 0.35
    ctx.fill()
  }
  ctx.globalAlpha = flicker

  ctx.beginPath()
  ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 30)
  const btnGradient = ctx.createLinearGradient(0, buttonY, 0, buttonY + buttonHeight)
  btnGradient.addColorStop(0, disabled ? '#8e738a' : hovered ? '#fff0a7' : '#ffd166')
  btnGradient.addColorStop(0.55, disabled ? '#6b5874' : hovered ? '#ff9d70' : '#ff7b6b')
  btnGradient.addColorStop(1, disabled ? '#4f4359' : hovered ? '#ff6db7' : '#ff5a9d')
  ctx.fillStyle = btnGradient
  ctx.shadowColor = hovered ? 'rgba(255, 209, 102, 0.85)' : 'rgba(255, 109, 183, 0.45)'
  ctx.shadowBlur = hovered ? 28 : 18
  ctx.fill()

  ctx.beginPath()
  ctx.roundRect(buttonX + 10, buttonY + 8, buttonWidth - 20, buttonHeight * 0.34, 18)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.fill()

  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(255, 250, 240, 0.82)'
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.font = '52px "Knewave", cursive'
  ctx.fillText(buttonLabel, width * 0.5, buttonY + buttonHeight * 0.69)

  ctx.fillStyle = '#201130'
  ctx.font = '900 22px "Nunito", sans-serif'
  ctx.fillText(disabled ? 'LOADING TAPE...' : 'SPACE / ENTER TO SHRED', width * 0.5, height * 0.94)
  ctx.fillStyle = '#fff8d8'
  ctx.fillText(disabled ? 'LOADING TAPE...' : 'SPACE / ENTER TO SHRED', width * 0.5, height * 0.937)
  ctx.restore()

  if (disabled) {
    ctx.save()
    ctx.fillStyle = 'rgba(10, 8, 20, 0.28)'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  ctx.globalAlpha = 1
}
