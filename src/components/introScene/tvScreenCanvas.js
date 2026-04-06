/**
 * 2D canvas drawing for the attract-mode TV UI (title, HUD pills, start button). Fed into a texture each frame.
 */

export function drawHudPill(
  ctx,
  x,
  y,
  width,
  height,
  label,
  {
    fill = "rgba(45, 17, 62, 0.92)",
    stroke = "#ffd166",
    text = "#fff6d8",
    glow = "rgba(255, 209, 102, 0.45)",
    font = '900 28px "Nunito", sans-serif',
  } = {},
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
  ctx.fillStyle = fill;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = text;
  ctx.font = font;
  ctx.fillText(label, x, y + 1);
  ctx.restore();
}

export function drawSparkle(ctx, x, y, size, color, rotation = 0, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, size * 0.15);

  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(size, 0);
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-size * 0.55, -size * 0.55);
  ctx.lineTo(size * 0.55, size * 0.55);
  ctx.moveTo(size * 0.55, -size * 0.55);
  ctx.lineTo(-size * 0.55, size * 0.55);
  ctx.stroke();
  ctx.restore();
}

export function drawPawPrint(ctx, x, y, scale, color, alpha = 1, rotation = 0) {
  const pad = 22 * scale;
  const toe = 8 * scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.ellipse(0, 0, pad, pad * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  [
    [-pad * 0.9, -pad * 0.9],
    [-pad * 0.3, -pad * 1.2],
    [pad * 0.3, -pad * 1.2],
    [pad * 0.9, -pad * 0.9],
  ].forEach(([toeX, toeY]) => {
    ctx.beginPath();
    ctx.ellipse(toeX, toeY, toe, toe * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawScreenBackground(ctx, width, height) {
  const horizonY = height * 0.57;

  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, "#12051f");
  bgGradient.addColorStop(0.36, "#41195f");
  bgGradient.addColorStop(0.68, "#a63f6b");
  bgGradient.addColorStop(1, "#ff934f");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  for (let index = 0; index < 18; index += 1) {
    const x = width * (0.08 + ((index * 0.0513) % 0.84));
    const y = height * (0.08 + ((index * 0.117) % 0.28));
    const size = 7 + (index % 4) * 2;
    const alpha = 0.62;
    drawSparkle(ctx, x, y, size, "#ffe8a3", index * 0.38, alpha);
  }

  const sunX = width * 0.5;
  const sunY = height * 0.34;
  const sunRadius = width * 0.17;
  const sunGradient = ctx.createRadialGradient(
    sunX,
    sunY,
    0,
    sunX,
    sunY,
    sunRadius * 1.5,
  );
  sunGradient.addColorStop(0, "rgba(255, 247, 200, 0.98)");
  sunGradient.addColorStop(0.38, "rgba(255, 190, 94, 0.96)");
  sunGradient.addColorStop(0.78, "rgba(255, 107, 73, 0.52)");
  sunGradient.addColorStop(1, "rgba(255, 107, 73, 0)");
  ctx.fillStyle = sunGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#ffd76a";
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius * 0.88, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 115, 84, 0.9)";
  for (let stripe = 0; stripe < 8; stripe += 1) {
    const stripeY = sunY - sunRadius * 0.3 + stripe * sunRadius * 0.16;
    const stripeHeight = 12 + stripe * 4;
    ctx.fillRect(sunX - sunRadius, stripeY, sunRadius * 2, stripeHeight);
  }
  ctx.restore();

  ctx.fillStyle = "#29123f";
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(width * 0.1, horizonY - 30);
  ctx.lineTo(width * 0.22, horizonY - 95);
  ctx.lineTo(width * 0.34, horizonY - 25);
  ctx.lineTo(width * 0.5, horizonY - 120);
  ctx.lineTo(width * 0.67, horizonY - 18);
  ctx.lineTo(width * 0.81, horizonY - 88);
  ctx.lineTo(width * 0.92, horizonY - 34);
  ctx.lineTo(width, horizonY);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  const floorGradient = ctx.createLinearGradient(0, horizonY, 0, height);
  floorGradient.addColorStop(0, "#140d24");
  floorGradient.addColorStop(1, "#040205");
  ctx.fillStyle = floorGradient;
  ctx.fillRect(0, horizonY, width, height - horizonY);

  ctx.strokeStyle = "rgba(75, 235, 255, 0.4)";
  ctx.lineWidth = 3;
  for (let line = 0; line < 10; line += 1) {
    const y = horizonY + (line / 9) ** 1.7 * (height - horizonY);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let line = -8; line <= 8; line += 1) {
    ctx.beginPath();
    ctx.moveTo(width * 0.5, horizonY);
    ctx.lineTo(width * 0.5 + line * width * 0.1, height);
    ctx.stroke();
  }
}

function drawScreenFrame(ctx, width, height) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(32, 32, width - 64, height - 64, 38);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(255, 229, 163, 0.65)";
  ctx.shadowColor = "rgba(255, 161, 92, 0.28)";
  ctx.shadowBlur = 20;
  ctx.stroke();
  ctx.restore();
}

function getSummaryTitle(summary) {
  return summary?.outcome === "complete" ? "TRACK COMPLETE" : "GAME OVER";
}

function getSummarySubhead(summary) {
  if (!summary) return "Queue up another run.";
  if (summary.outcome === "complete") return "Song cleared. Pull back through the tube and go again.";
  if (summary.failReason) return `${summary.failReason.toUpperCase()}. PULL BACK AND RUN IT AGAIN.`;
  return "LINE BROKE. PULL BACK AND RUN IT AGAIN.";
}

function drawSummaryCard(ctx, x, y, width, height, label, value, accent) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, 24);
  ctx.fillStyle = "rgba(18, 10, 34, 0.82)";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.shadowColor = `${accent}55`;
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 245, 216, 0.72)";
  ctx.font = '900 21px "Nunito", sans-serif';
  ctx.fillText(label, x, y - 12);
  ctx.fillStyle = "#ffffff";
  ctx.font = '50px "Knewave", cursive';
  ctx.fillText(String(value), x, y + 38);
  ctx.restore();
}

function drawActionButton(ctx, width, height, {
  hovered,
  disabled,
  buttonLabel,
  instructionLabel,
  instructionFont = '900 22px "Nunito", sans-serif',
  y = 0.82,
}) {
  const buttonScale =
    disabled ? 0.98
    : hovered ? 1.08
    : 1;
  const buttonWidth = width * 0.48 * buttonScale;
  const buttonHeight = height * 0.12 * buttonScale;
  const buttonX = width * 0.5 - buttonWidth / 2;
  const buttonY = height * y - buttonHeight / 2;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(
    buttonX - 18,
    buttonY - 16,
    buttonWidth + 36,
    buttonHeight + 32,
    42,
  );
  ctx.fillStyle = "rgba(17, 10, 30, 0.82)";
  ctx.strokeStyle = "rgba(124, 247, 255, 0.5)";
  ctx.lineWidth = 5;
  ctx.shadowColor =
    hovered ? "rgba(124, 247, 255, 0.35)" : "rgba(255, 129, 181, 0.2)";
  ctx.shadowBlur = hovered ? 22 : 14;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 30);
  const btnGradient = ctx.createLinearGradient(0, buttonY, 0, buttonY + buttonHeight);
  btnGradient.addColorStop(
    0,
    disabled ? "#8e738a"
    : hovered ? "#fff0a7"
    : "#ffd166",
  );
  btnGradient.addColorStop(
    0.55,
    disabled ? "#6b5874"
    : hovered ? "#ff9d70"
    : "#ff7b6b",
  );
  btnGradient.addColorStop(
    1,
    disabled ? "#4f4359"
    : hovered ? "#ff6db7"
    : "#ff5a9d",
  );
  ctx.fillStyle = btnGradient;
  ctx.shadowColor =
    hovered ? "rgba(255, 209, 102, 0.85)" : "rgba(255, 109, 183, 0.45)";
  ctx.shadowBlur = hovered ? 28 : 18;
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(
    buttonX + 10,
    buttonY + 8,
    buttonWidth - 20,
    buttonHeight * 0.34,
    18,
  );
  ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(255, 250, 240, 0.82)";
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = '52px "Knewave", cursive';
  ctx.fillText(buttonLabel, width * 0.5, buttonY + buttonHeight * 0.69);

  ctx.fillStyle = "#201130";
  ctx.font = instructionFont;
  ctx.fillText(
    disabled ? "LOADING TAPE..." : instructionLabel,
    width * 0.5,
    height * 0.94,
  );
  ctx.fillStyle = "#fff8d8";
  ctx.fillText(
    disabled ? "LOADING TAPE..." : instructionLabel,
    width * 0.5,
    height * 0.937,
  );
  ctx.restore();
}

function getActionButtonBounds(width, height, {
  disabled,
  hovered,
  y = 0.82,
}) {
  const buttonScale =
    disabled ? 0.98
    : hovered ? 1.08
    : 1;
  const buttonWidth = width * 0.48 * buttonScale;
  const buttonHeight = height * 0.12 * buttonScale;
  const buttonX = width * 0.5 - buttonWidth / 2;
  const buttonY = height * y - buttonHeight / 2;

  return {
    x: buttonX,
    y: buttonY,
    width: buttonWidth,
    height: buttonHeight,
  };
}

function drawDismissButton(ctx, width, height, {
  hovered = false,
  disabled = false,
}) {
  const size = (hovered && !disabled ? 74 : 66);
  const x = width - 92;
  const y = 92;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - size / 2, y - size / 2, size, size, 24);
  ctx.fillStyle = "rgba(18, 10, 34, 0.86)";
  ctx.strokeStyle = hovered && !disabled ? "#7cf7ff" : "rgba(255, 240, 210, 0.7)";
  ctx.lineWidth = 4;
  ctx.shadowColor = hovered && !disabled
    ? "rgba(124, 247, 255, 0.45)"
    : "rgba(255, 141, 179, 0.24)";
  ctx.shadowBlur = hovered && !disabled ? 24 : 14;
  ctx.fill();
  ctx.stroke();

  ctx.globalAlpha = 0.42;
  ctx.beginPath();
  ctx.roundRect(x - size / 2 + 8, y - size / 2 + 8, size - 16, size * 0.28, 12);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 14, y - 14);
  ctx.lineTo(x + 14, y + 14);
  ctx.moveTo(x + 14, y - 14);
  ctx.lineTo(x - 14, y + 14);
  ctx.stroke();
  ctx.restore();
}

function getDismissButtonBounds(width) {
  const size = 66;
  return {
    x: width - 92 - size / 2,
    y: 92 - size / 2,
    width: size,
    height: size,
  };
}

function isPointInBounds(x, y, bounds) {
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

export function getTvScreenActionAtPoint(
  x,
  y,
  width,
  height,
  {
    disabled = false,
    showDismissButton = false,
  } = {},
) {
  if (disabled) return null;

  if (showDismissButton) {
    const dismissBounds = getDismissButtonBounds(width);
    if (isPointInBounds(x, y, dismissBounds)) {
      return "dismiss";
    }
  }

  const actionBounds = getActionButtonBounds(width, height, {
    disabled,
    hovered: false,
    y: 0.82,
  });
  if (isPointInBounds(x, y, actionBounds)) {
    return "start";
  }

  return null;
}

function drawTitleScreen(ctx, width, height, { hovered, disabled }) {
  const hoverMix = hovered && !disabled ? 1 : 0;

  drawHudPill(ctx, width * 0.16, height * 0.09, 160, 56, "1UP", {
    fill: "rgba(54, 15, 64, 0.94)",
    stroke: "#7cf7ff",
    text: "#dbfdff",
    glow: "rgba(124, 247, 255, 0.5)",
  });
  drawHudPill(ctx, width * 0.5, height * 0.09, 320, 56, "HI-SCORE 90210", {
    fill: "rgba(66, 18, 48, 0.92)",
    stroke: "#ffd166",
    text: "#fff5d5",
    glow: "rgba(255, 209, 102, 0.45)",
  });
  drawHudPill(ctx, width * 0.84, height * 0.09, 170, 56, "STAGE 01", {
    fill: "rgba(42, 22, 79, 0.94)",
    stroke: "#ff81b5",
    text: "#ffe3ef",
    glow: "rgba(255, 129, 181, 0.45)",
  });

  const titleGradient = ctx.createLinearGradient(
    width * 0.25,
    height * 0.22,
    width * 0.75,
    height * 0.56,
  );
  titleGradient.addColorStop(0, "#fff2a8");
  titleGradient.addColorStop(0.45, "#ffba5f");
  titleGradient.addColorStop(0.78, "#ff6f91");
  titleGradient.addColorStop(1, "#73f7ff");

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = 18;
  ctx.strokeStyle = "#481752";
  ctx.shadowColor = "rgba(255, 160, 92, 0.6)";
  ctx.shadowBlur = 28 + hoverMix * 10;
  ctx.font = '118px "Knewave", cursive';
  ctx.strokeText("SKATE", width * 0.5, height * 0.33);
  ctx.fillStyle = titleGradient;
  ctx.fillText("SKATE", width * 0.5, height * 0.33);
  ctx.strokeText("CAT", width * 0.5, height * 0.48);
  ctx.fillText("CAT", width * 0.5, height * 0.48);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(width * 0.27, height * 0.51, width * 0.46, 58, 28);
  ctx.fillStyle = "rgba(19, 13, 42, 0.84)";
  ctx.strokeStyle = "#7cf7ff";
  ctx.lineWidth = 4;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e5fdff";
  ctx.font = '900 28px "Nunito", sans-serif';
  ctx.fillText("MEOW TO THE BEAT", width * 0.5, height * 0.55);
  ctx.restore();

  drawHudPill(ctx, width * 0.22, height * 0.63, 170, 52, "JUMP", {
    fill: "rgba(37, 23, 64, 0.92)",
    stroke: "#7cf7ff",
    text: "#dbfdff",
    glow: "rgba(124, 247, 255, 0.38)",
    font: '36px "Knewave", cursive',
  });
  drawHudPill(ctx, width * 0.78, height * 0.63, 170, 52, "GRIND", {
    fill: "rgba(63, 22, 52, 0.92)",
    stroke: "#ff81b5",
    text: "#ffe8f3",
    glow: "rgba(255, 129, 181, 0.38)",
    font: '34px "Knewave", cursive',
  });

  drawPawPrint(ctx, width * 0.12, height * 0.79, 0.72, "#ffd166", 0.38, -0.28);
  drawPawPrint(ctx, width * 0.17, height * 0.86, 0.58, "#ff8db3", 0.34, -0.12);
  drawPawPrint(ctx, width * 0.88, height * 0.79, 0.72, "#7cf7ff", 0.36, 0.22);
  drawSparkle(ctx, width * 0.18, height * 0.24, 13, "#fff2a8", 0.28, 0.9);
  drawSparkle(ctx, width * 0.82, height * 0.28, 13, "#73f7ff", -0.34, 0.9);
}

// Easing helpers for summary animations
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function easeOutElastic(t) {
  if (t === 0 || t === 1) return t;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

// Returns 0-1 progress for an animation starting at `start` over `duration` seconds
function animProgress(elapsed, start, duration) {
  return clamp01((elapsed - start) / duration);
}

function drawSummaryScreen(ctx, width, height, summary, { showDismissButton = false, dismissHovered = false, elapsed = 99 } = {}) {
  const title = getSummaryTitle(summary);
  const subhead = getSummarySubhead(summary);
  const isComplete = summary?.outcome === "complete";
  const accent = isComplete ? "#ffd166" : "#ff8db3";
  const accentAlt = isComplete ? "#7cf7ff" : "#7cf7ff";
  const accuracyStats = summary?.accuracyStats || {};

  // Animation timeline (seconds after CRT power-on)
  const titleP = easeOutBack(animProgress(elapsed, 0.15, 0.5));
  const subheadP = easeOutCubic(animProgress(elapsed, 0.5, 0.4));
  const scoreLabelP = easeOutCubic(animProgress(elapsed, 0.7, 0.3));
  const scoreCountP = animProgress(elapsed, 0.8, 1.2); // raw 0-1 for count-up
  const scoreScaleP = easeOutElastic(animProgress(elapsed, 0.8, 0.6));
  const failPillP = easeOutBack(animProgress(elapsed, 1.6, 0.4));
  const cardStaggerBase = 1.8;
  const cardStagger = 0.12;
  const sparkleP = animProgress(elapsed, 0.3, 0.5);

  // Title — drops in with overshoot
  if (titleP > 0) {
    const titleScale = titleP;
    const titleY = height * 0.19 + (1 - titleScale) * -60;
    ctx.save();
    ctx.globalAlpha = clamp01(titleP * 1.5);
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 14;
    ctx.strokeStyle = "rgba(47, 14, 58, 0.95)";
    ctx.shadowColor = `${accent}88`;
    ctx.shadowBlur = 24 + (1 - titleP) * 20;
    ctx.font = '82px "Knewave", cursive';
    ctx.strokeText(title, width * 0.5, titleY);
    const titleGradient = ctx.createLinearGradient(width * 0.28, 0, width * 0.72, 0);
    titleGradient.addColorStop(0, accent);
    titleGradient.addColorStop(0.5, "#fff4c8");
    titleGradient.addColorStop(1, accentAlt);
    ctx.fillStyle = titleGradient;
    ctx.fillText(title, width * 0.5, titleY);
    ctx.restore();
  }

  // Subhead — fades in and slides up
  if (subheadP > 0) {
    const subY = height * 0.273 + (1 - subheadP) * 20;
    ctx.save();
    ctx.globalAlpha = subheadP;
    ctx.beginPath();
    ctx.roundRect(width * 0.14, height * 0.23 + (1 - subheadP) * 20, width * 0.72, 64, 28);
    ctx.fillStyle = "rgba(14, 10, 32, 0.82)";
    ctx.strokeStyle = `${accentAlt}88`;
    ctx.lineWidth = 4;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f9f2e1";
    ctx.font = '900 24px "Nunito", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(subhead, width * 0.5, subY);
    ctx.restore();
  }

  // Score label
  if (scoreLabelP > 0) {
    ctx.save();
    ctx.globalAlpha = scoreLabelP;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 245, 216, 0.68)";
    ctx.font = '900 22px "Nunito", sans-serif';
    ctx.fillText("TOTAL SCORE", width * 0.5, height * 0.37);
    ctx.restore();
  }

  // Score count-up with elastic pop
  if (scoreCountP > 0) {
    const totalScore = summary?.totalScore || 0;
    // Ease the count-up so it slows down at the end
    const countEased = easeOutCubic(scoreCountP);
    const displayScore = Math.round(countEased * totalScore);
    // Scale punch on first appearance
    const scaleFactor = scoreScaleP > 0 ? 0.6 + 0.4 * scoreScaleP : 1;
    const fontSize = Math.round(120 * scaleFactor);
    ctx.save();
    ctx.globalAlpha = clamp01(scoreCountP * 3);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = `${accent}99`;
    ctx.shadowBlur = 30 + (1 - scoreScaleP) * 20;
    ctx.font = `${fontSize}px "Knewave", cursive`;
    ctx.fillText(`${displayScore}`, width * 0.5, height * 0.485);
    ctx.restore();
  }

  // Fail reason pill — pops in
  if (!isComplete && summary?.failReason && failPillP > 0) {
    ctx.save();
    ctx.globalAlpha = failPillP;
    const pillScale = 0.7 + 0.3 * failPillP;
    ctx.translate(width * 0.5, height * 0.55);
    ctx.scale(pillScale, pillScale);
    ctx.translate(-width * 0.5, -height * 0.55);
    drawHudPill(ctx, width * 0.5, height * 0.55, 300, 52, `MISS: ${summary.failReason.toUpperCase()}`, {
      fill: "rgba(58, 17, 42, 0.92)",
      stroke: "#ff8db3",
      text: "#ffe8f3",
      glow: "rgba(255, 141, 179, 0.4)",
      font: '900 20px "Nunito", sans-serif',
    });
    ctx.restore();
  }

  // Stat cards — stagger in from below with bounce
  const cardsY = isComplete || !summary?.failReason ? height * 0.65 : height * 0.67;
  const cardData = [
    { x: 0.2, label: "PERFECT", value: accuracyStats.Perfect || 0, color: "#ffd166" },
    { x: 0.4, label: "GOOD", value: accuracyStats.Good || 0, color: "#7cf7ff" },
    { x: 0.6, label: "SLOPPY", value: accuracyStats.Sloppy || 0, color: "#ff8db3" },
    { x: 0.8, label: "BEST STREAK", value: summary?.bestStreak || 0, color: accent },
  ];
  cardData.forEach((card, i) => {
    const cardP = easeOutBack(animProgress(elapsed, cardStaggerBase + i * cardStagger, 0.45));
    if (cardP <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp01(cardP * 2);
    const offsetY = (1 - cardP) * 80;
    drawSummaryCard(ctx, width * card.x, cardsY + offsetY, 180, 118, card.label, card.value, card.color);
    ctx.restore();
  });

  // Animated sparkles — rotate and pulse continuously
  if (sparkleP > 0) {
    const sparkleAlpha = Math.min(sparkleP * 2, 0.85);
    const sparkleRot = elapsed * 0.8;
    const sparkleSize = 14 + Math.sin(elapsed * 3) * 3;
    drawSparkle(ctx, width * 0.18, height * 0.16, sparkleSize, accent, sparkleRot, sparkleAlpha);
    drawSparkle(ctx, width * 0.82, height * 0.16, sparkleSize, accentAlt, -sparkleRot, sparkleAlpha);
    // Extra sparkles that appear as score counts
    if (scoreCountP > 0 && scoreCountP < 1) {
      const burstAlpha = 0.5 + Math.sin(elapsed * 8) * 0.3;
      drawSparkle(ctx, width * 0.35, height * 0.42, 10, accent, elapsed * 2, burstAlpha);
      drawSparkle(ctx, width * 0.65, height * 0.42, 10, accentAlt, -elapsed * 2, burstAlpha);
    }
  }

  // Paw prints fade in with cards
  const pawP = easeOutCubic(animProgress(elapsed, cardStaggerBase + 0.2, 0.5));
  if (pawP > 0) {
    drawPawPrint(ctx, width * 0.11, height * 0.78, 0.68 * pawP, accent, 0.34 * pawP, -0.2);
    drawPawPrint(ctx, width * 0.88, height * 0.78, 0.68 * pawP, accentAlt, 0.34 * pawP, 0.2);
  }

  if (showDismissButton) {
    drawDismissButton(ctx, width, height, {
      hovered: dismissHovered,
      disabled: false,
    });
  }
}

export function drawTvScreen(
  ctx,
  canvas,
  time,
  {
    hovered = false,
    disabled = false,
    buttonLabel = "PRESS START",
    screenMode = "title",
    summary = null,
    showDismissButton = false,
    dismissHovered = false,
    summaryElapsed = 99,
  } = {},
) {
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  drawScreenBackground(ctx, width, height);
  drawScreenFrame(ctx, width, height);

  if (screenMode === "summary") {
    drawSummaryScreen(ctx, width, height, summary, {
      showDismissButton,
      dismissHovered,
      elapsed: summaryElapsed,
    });
  } else {
    drawTitleScreen(ctx, width, height, { hovered, disabled });
  }

  // In summary mode, animate the button appearing after the cards
  const buttonAlpha = screenMode === "summary"
    ? clamp01((summaryElapsed - 2.5) / 0.5)
    : 1;
  if (buttonAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = buttonAlpha;
    const buttonSlide = screenMode === "summary" ? (1 - easeOutCubic(clamp01((summaryElapsed - 2.5) / 0.5))) * 40 : 0;
    drawActionButton(ctx, width, height, {
      hovered,
      disabled,
      buttonLabel,
      instructionLabel: screenMode === "summary" ? "SPACE / ENTER TO PLAY AGAIN" : "SPACE / ENTER TO SHRED",
      instructionFont:
        screenMode === "summary" ? '900 18px "Nunito", sans-serif' : '900 22px "Nunito", sans-serif',
      y: 0.82 + buttonSlide / height,
    });
    ctx.restore();
  }

  if (disabled) {
    ctx.save();
    ctx.fillStyle = "rgba(10, 8, 20, 0.28)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}
