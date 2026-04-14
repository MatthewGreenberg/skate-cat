/**
 * 2D canvas drawing for the attract-mode TV UI (title, HUD pills, start button). Fed into a texture each frame.
 */

const REFERENCE_SIZE = 1024;

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
    // eslint-disable-next-line no-unused-vars
    glow = "rgba(255, 209, 102, 0.45)",
    font = '900 28px "Nunito", sans-serif',
  } = {},
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = stroke;
  ctx.stroke();
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
  ctx.fill();
  ctx.stroke();
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
  disabledInstructionLabel = instructionLabel,
  instructionFont = '900 22px "Nunito", sans-serif',
  y = 0.82,
  hideInstruction = false,
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

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = '52px "Knewave", cursive';
  ctx.fillText(buttonLabel, width * 0.5, buttonY + buttonHeight * 0.69);

  if (!hideInstruction) {
    ctx.fillStyle = "#201130";
    ctx.font = instructionFont;
    ctx.fillText(
      disabled ? disabledInstructionLabel : instructionLabel,
      width * 0.5,
      height * 0.94,
    );
    ctx.fillStyle = "#fff8d8";
    ctx.fillText(
      disabled ? disabledInstructionLabel : instructionLabel,
      width * 0.5,
      height * 0.937,
    );
  }
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

function drawDismissButton(ctx, width, _height, {
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
  rawX,
  rawY,
  rawWidth,
  rawHeight,
  {
    screenMode = "title",
    disabled = false,
    showDismissButton = false,
  } = {},
) {
  if (disabled || screenMode === "boot") return null;

  // Convert raw canvas coords to reference coordinate space
  const scale = rawWidth / REFERENCE_SIZE;
  const x = rawX / scale;
  const y = rawY / scale;
  const width = REFERENCE_SIZE;
  const height = Math.round(rawHeight / scale);

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

  if (screenMode === "title") {
    if (isPointInBounds(x, y, actionBounds)) {
      return "start";
    }
    const hsBounds = getHighScoresButtonBounds(width, height);
    if (isPointInBounds(x, y, hsBounds)) {
      return "highscores";
    }
    return null;
  }

  if (screenMode === "leaderboard") {
    const tabs = getLeaderboardTabBounds(width, height);
    for (const tab of tabs) {
      if (isPointInBounds(x, y, tab)) {
        return `tab_${tab.id}`;
      }
    }
    if (isPointInBounds(x, y, actionBounds)) {
      return "back";
    }
    return null;
  }

  if (screenMode === "initials") {
    if (isPointInBounds(x, y, actionBounds)) {
      return "confirmInitials";
    }
    // Check letter slot clicks
    const slots = getInitialsSlotBounds(width, height);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (isPointInBounds(x, y, slot)) {
        const midY = slot.y + slot.height / 2;
        if (y < midY) return `slotUp_${i}`;
        return `slotDown_${i}`;
      }
    }
    return null;
  }

  // summary and other modes
  if (isPointInBounds(x, y, actionBounds)) {
    return "start";
  }
  const hsBoundsSummary = getHighScoresButtonBounds(width, height);
  if (isPointInBounds(x, y, hsBoundsSummary)) {
    return "highscores";
  }

  return null;
}

function drawBootScreen(ctx, width, height, {
  bootStatusLabel = "SYNCING STAGE",
  bootProgress = 0,
  bootReady = false,
}) {
  const progressRatio = clamp01(bootProgress / 100);
  const diagnostics = [
    ["CARTRIDGE", progressRatio >= 0.72 ? "LOCKED" : "READING"],
    ["TRACK BUS", bootProgress >= 90 ? (bootReady ? "LOCKED" : "FAULT") : "WAIT"],
    ["CRT LINK", progressRatio >= 0.92 ? "STABLE" : "SYNC"],
  ];

  ctx.save();
  ctx.fillStyle = "rgba(5, 10, 19, 0.92)";
  ctx.fillRect(58, 58, width - 116, height - 116);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(124, 247, 255, 0.42)";
  ctx.lineWidth = 3;
  ctx.strokeRect(78, 78, width - 156, height - 156);
  ctx.restore();

  ctx.save();
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(124, 247, 255, 0.78)";
  ctx.font = '900 18px "Nunito", sans-serif';
  ctx.fillText("ARCADE SYSTEM DIAGNOSTICS", 102, 126);
  ctx.fillStyle = "#fff4c8";
  ctx.font = '72px "Knewave", cursive';
  ctx.fillText("SKATE CAT", 98, 218);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(100, 246, width - 200, 74, 24);
  ctx.fillStyle = "rgba(10, 21, 34, 0.92)";
  ctx.strokeStyle = bootReady ? "#ffd166" : "#7cf7ff";
  ctx.lineWidth = 4;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = '900 28px "Nunito", sans-serif';
  ctx.fillText(bootStatusLabel, 128, 292);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(100, 354, width - 200, 26, 12);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(100, 354, (width - 200) * progressRatio, 26, 12);
  const progressGradient = ctx.createLinearGradient(100, 0, width - 100, 0);
  progressGradient.addColorStop(0, "#7cf7ff");
  progressGradient.addColorStop(0.55, "#ffd166");
  progressGradient.addColorStop(1, "#ff8db3");
  ctx.fillStyle = progressGradient;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = '900 19px "Nunito", sans-serif';
  ctx.fillText(`${Math.round(bootProgress)}%`, 100, 415);
  ctx.fillStyle = bootReady ? "#fff1c6" : "rgba(255,255,255,0.82)";
  ctx.fillText(bootReady ? "START BUS READY" : "AWAITING FINAL LOCK", width - 346, 415);
  ctx.restore();

  diagnostics.forEach(([label, value], index) => {
    const x = 156 + index * 232;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x - 74, 474, 148, 94, 20);
    ctx.fillStyle = "rgba(20, 12, 34, 0.88)";
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.48)";
    ctx.font = '900 16px "Nunito", sans-serif';
    ctx.fillText(label, x, 510);
    ctx.fillStyle = value === "FAULT" ? "#ff8db3" : value === "LOCKED" || value === "READY" ? "#ffd166" : "#7cf7ff";
    ctx.font = '900 24px "Nunito", sans-serif';
    ctx.fillText(value, x, 552);
    ctx.restore();
  });

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = '900 18px "Nunito", sans-serif';
  ctx.fillText("TITLE UNLOCKS WHEN BOOT COMPLETES", width * 0.5, height * 0.9);
  ctx.restore();
}

function drawTitleScreen(ctx, width, height, { highScore = 0, highScoresHovered = false }) {


  drawHudPill(ctx, width * 0.16, height * 0.09, 160, 56, "1UP", {
    fill: "rgba(54, 15, 64, 0.94)",
    stroke: "#7cf7ff",
    text: "#dbfdff",
    glow: "rgba(124, 247, 255, 0.5)",
  });
  const hiScoreLabel = highScore > 0 ? `HI-SCORE ${highScore}` : "HI-SCORE ---";
  drawHudPill(ctx, width * 0.5, height * 0.09, 320, 56, hiScoreLabel, {
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

  // "HIGH SCORES" button — styled like a smaller version of the main action button
  const hsHov = highScoresHovered;
  const hsScale = hsHov ? 1.06 : 1;
  const hsW = 260 * hsScale;
  const hsH = 54 * hsScale;
  const hsX = width * 0.5;
  const hsY = height * 0.965;
  const hsBtnX = hsX - hsW / 2;
  const hsBtnY = hsY - hsH / 2;

  ctx.save();
  // Outer frame glow
  ctx.beginPath();
  ctx.roundRect(hsBtnX - 10, hsBtnY - 8, hsW + 20, hsH + 16, 30);
  ctx.fillStyle = "rgba(17, 10, 30, 0.72)";
  ctx.strokeStyle = hsHov ? "rgba(124, 247, 255, 0.6)" : "rgba(124, 247, 255, 0.28)";
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();

  // Inner gradient fill
  ctx.beginPath();
  ctx.roundRect(hsBtnX, hsBtnY, hsW, hsH, 22);
  const hsGrad = ctx.createLinearGradient(0, hsBtnY, 0, hsBtnY + hsH);
  hsGrad.addColorStop(0, hsHov ? "#9bfcff" : "#7cf7ff");
  hsGrad.addColorStop(0.5, hsHov ? "#5fd4f7" : "#4db8d8");
  hsGrad.addColorStop(1, hsHov ? "#6fa0ff" : "#5580cc");
  ctx.fillStyle = hsGrad;
  ctx.fill();

  // Specular highlight bar
  ctx.beginPath();
  ctx.roundRect(hsBtnX + 8, hsBtnY + 5, hsW - 16, hsH * 0.32, 14);
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  ctx.fill();

  // Border
  ctx.beginPath();
  ctx.roundRect(hsBtnX, hsBtnY, hsW, hsH, 22);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.stroke();

  // Text
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0a1428";
  ctx.font = '900 22px "Nunito", sans-serif';
  ctx.fillText("\u2605 HIGH SCORES \u2605", hsX, hsY + 1);
  ctx.restore();
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

function drawSummaryScreen(ctx, width, height, summary, { showDismissButton = false, dismissHovered = false, elapsed = 99, highScoresHovered = false } = {}) {
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
  const clearsLabel = summary?.obstacleOpportunities
    ? `${summary.obstaclesCleared || 0}/${summary.obstacleOpportunities}`
    : "0/0";
  const cardData = [
    { x: 0.2, label: "CORE %", value: `${summary?.timingPercent || 0}%`, color: "#ffd166" },
    { x: 0.4, label: "CLEARS", value: clearsLabel, color: "#7cf7ff" },
    { x: 0.6, label: "PERFECT", value: accuracyStats.Perfect || 0, color: "#ff8db3" },
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

  // HIGH SCORES button
  const hsButtonP = easeOutCubic(animProgress(elapsed, cardStaggerBase + 0.5, 0.4));
  if (hsButtonP > 0) {
    const hsHov = highScoresHovered;
    const hsScale = hsHov ? 1.06 : 1;
    const hsW = 260 * hsScale;
    const hsH = 54 * hsScale;
    const hsX = width * 0.5;
    const hsY = height * 0.965;
    const hsBtnX = hsX - hsW / 2;
    const hsBtnY = hsY - hsH / 2;

    ctx.save();
    ctx.globalAlpha = hsButtonP;
    ctx.beginPath();
    ctx.roundRect(hsBtnX - 10, hsBtnY - 8, hsW + 20, hsH + 16, 30);
    ctx.fillStyle = "rgba(17, 10, 30, 0.72)";
    ctx.strokeStyle = hsHov ? "rgba(124, 247, 255, 0.6)" : "rgba(124, 247, 255, 0.28)";
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(hsBtnX, hsBtnY, hsW, hsH, 22);
    const hsGrad = ctx.createLinearGradient(0, hsBtnY, 0, hsBtnY + hsH);
    hsGrad.addColorStop(0, hsHov ? "#9bfcff" : "#7cf7ff");
    hsGrad.addColorStop(0.5, hsHov ? "#5fd4f7" : "#4db8d8");
    hsGrad.addColorStop(1, hsHov ? "#6fa0ff" : "#5580cc");
    ctx.fillStyle = hsGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(hsBtnX + 8, hsBtnY + 5, hsW - 16, hsH * 0.32, 14);
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(hsBtnX, hsBtnY, hsW, hsH, 22);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0a1428";
    ctx.font = '900 22px "Nunito", sans-serif';
    ctx.fillText("\u2605 HIGH SCORES \u2605", hsX, hsY + 1);
    ctx.restore();
  }

  if (showDismissButton) {
    drawDismissButton(ctx, width, height, {
      hovered: dismissHovered,
      disabled: false,
    });
  }
}

function getHighScoresButtonBounds(width, height) {
  const hsWidth = 260;
  const hsHeight = 54;
  return {
    x: width * 0.5 - hsWidth / 2 - 10,
    y: height * 0.965 - hsHeight / 2 - 8,
    width: hsWidth + 20,
    height: hsHeight + 16,
  };
}

const RANK_COLORS = {
  S: "#ffd166",
  A: "#7cf7ff",
  B: "#ff81b5",
  C: "#ffffff",
  D: "#9e9e9e",
  F: "#6e6e6e",
};

const LEADERBOARD_TABS = [
  { id: "daily", label: "DAILY" },
  { id: "weekly", label: "WEEKLY" },
  { id: "alltime", label: "ALL-TIME" },
];

export function getLeaderboardTabBounds(width, height) {
  const tabW = 170;
  const tabH = 44;
  const gap = 22;
  const totalW = tabW * 3 + gap * 2;
  const startX = Math.round(width / 2 - totalW / 2);
  const y = Math.round(height * 0.175 - tabH / 2);
  return LEADERBOARD_TABS.map((t, i) => ({
    id: t.id,
    label: t.label,
    x: startX + i * (tabW + gap),
    y,
    width: tabW,
    height: tabH,
  }));
}

function drawLeaderboardTabs(ctx, width, height, { selectedTab, elapsed }) {
  const appear = easeOutBack(animProgress(elapsed, 0.12, 0.35));
  if (appear <= 0) return;
  for (const tab of getLeaderboardTabBounds(width, height)) {
    const active = tab.id === selectedTab;
    ctx.save();
    ctx.globalAlpha = clamp01(appear);
    const cx = tab.x + tab.width / 2;
    const cy = tab.y + tab.height / 2;
    if (active) {
      const pulse = 1 + 0.04 * Math.sin(elapsed * 4);
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.translate(-cx, -cy);
    }
    drawHudPill(ctx, cx, cy, tab.width, tab.height, tab.label, {
      fill: active ? "rgba(122, 240, 255, 0.22)" : "rgba(30, 20, 50, 0.72)",
      stroke: active ? "#7cf7ff" : "rgba(255,255,255,0.28)",
      text: active ? "#e9fbff" : "rgba(255,245,216,0.6)",
      font: '800 18px "Nunito", sans-serif',
    });
    ctx.restore();
  }
}

function drawLeaderboardScreen(
  ctx,
  width,
  height,
  { leaderboards = { daily: [], weekly: [], alltime: [] }, selectedTab = "alltime", elapsed = 0 },
) {
  const entries = Array.isArray(leaderboards?.[selectedTab])
    ? leaderboards[selectedTab]
    : [];

  // Title
  const titleP = easeOutBack(animProgress(elapsed, 0.1, 0.5));
  if (titleP > 0) {
    const titleY = height * 0.12 + (1 - titleP) * -40;
    ctx.save();
    ctx.globalAlpha = clamp01(titleP * 1.5);
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 14;
    ctx.strokeStyle = "rgba(47, 14, 58, 0.95)";
    ctx.font = '82px "Knewave", cursive';
    ctx.strokeText("HIGH SCORES", width * 0.5, titleY);
    const grad = ctx.createLinearGradient(width * 0.2, 0, width * 0.8, 0);
    grad.addColorStop(0, "#fff2a8");
    grad.addColorStop(0.5, "#ffba5f");
    grad.addColorStop(1, "#ff6f91");
    ctx.fillStyle = grad;
    ctx.fillText("HIGH SCORES", width * 0.5, titleY);
    ctx.restore();
  }

  // Tab bar (between title and headers)
  drawLeaderboardTabs(ctx, width, height, { selectedTab, elapsed });

  // Column headers
  const headerP = easeOutCubic(animProgress(elapsed, 0.15, 0.3));
  if (headerP > 0) {
    ctx.save();
    ctx.globalAlpha = headerP;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255, 245, 216, 0.62)";
    ctx.font = '900 18px "Nunito", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("#", width * 0.1, height * 0.21);
    ctx.fillText("RANK", width * 0.22, height * 0.21);
    ctx.fillText("NAME", width * 0.48, height * 0.21);
    ctx.fillText("SCORE", width * 0.78, height * 0.21);
    ctx.restore();
  }

  // Rows
  for (let i = 0; i < 10; i++) {
    const rowP = easeOutBack(animProgress(elapsed, 0.2 + i * 0.06, 0.4));
    if (rowP <= 0) continue;
    const entry = entries[i];
    const rowY = height * 0.25 + i * (height * 0.05);
    const rowHeight = height * 0.044;

    ctx.save();
    ctx.globalAlpha = clamp01(rowP * 2);
    const offsetX = (1 - rowP) * 60;

    // Row background
    ctx.beginPath();
    ctx.roundRect(width * 0.05 + offsetX, rowY - rowHeight / 2, width * 0.9, rowHeight, 14);
    ctx.fillStyle = i % 2 === 0 ? "rgba(18, 10, 34, 0.72)" : "rgba(28, 16, 48, 0.72)";
    ctx.fill();

    ctx.textBaseline = "middle";

    // Rank number
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 245, 216, 0.82)";
    ctx.font = '900 22px "Nunito", sans-serif';
    ctx.fillText(`${i + 1}`, width * 0.1 + offsetX, rowY + 1);

    if (entry) {
      // Rank letter badge
      const rankColor = RANK_COLORS[entry.rank] || "#9e9e9e";
      ctx.beginPath();
      ctx.roundRect(width * 0.185 + offsetX, rowY - 16, 64, 32, 12);
      ctx.fillStyle = "rgba(10, 6, 20, 0.82)";
      ctx.strokeStyle = rankColor;
      ctx.lineWidth = 2.5;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rankColor;
      ctx.font = '900 20px "Nunito", sans-serif';
      ctx.fillText(entry.rank || "?", width * 0.22 + offsetX, rowY + 1);

      // Initials
      ctx.fillStyle = "#ffffff";
      ctx.font = '32px "Knewave", cursive';
      ctx.fillText(entry.initials, width * 0.48 + offsetX, rowY + 2);

      // Score
      ctx.fillStyle = "#fff5d5";
      ctx.font = '32px "Knewave", cursive';
      ctx.fillText(`${entry.score}`, width * 0.78 + offsetX, rowY + 2);
    } else {
      // Empty slot
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.font = '28px "Knewave", cursive';
      ctx.fillText("---", width * 0.48 + offsetX, rowY + 2);
      ctx.fillText("---", width * 0.78 + offsetX, rowY + 2);
    }

    ctx.restore();
  }

  // Paw prints
  const pawP = easeOutCubic(animProgress(elapsed, 0.5, 0.4));
  if (pawP > 0) {
    drawPawPrint(ctx, width * 0.06, height * 0.14, 0.52 * pawP, "#ffd166", 0.3 * pawP, -0.3);
    drawPawPrint(ctx, width * 0.94, height * 0.14, 0.52 * pawP, "#7cf7ff", 0.3 * pawP, 0.3);
  }

  // Sparkles
  if (elapsed > 0.3) {
    const sparkA = Math.min((elapsed - 0.3) * 2, 0.8);
    drawSparkle(ctx, width * 0.15, height * 0.08, 12, "#fff2a8", elapsed * 0.6, sparkA);
    drawSparkle(ctx, width * 0.85, height * 0.08, 12, "#73f7ff", -elapsed * 0.6, sparkA);
  }
}

function drawInitialsScreen(ctx, width, height, { initials = ["A", "A", "A"], cursorPos = 0, elapsed = 0, score = 0, rank = "F" }) {
  // Title
  const titleP = easeOutBack(animProgress(elapsed, 0.1, 0.5));
  if (titleP > 0) {
    const titleY = height * 0.13 + (1 - titleP) * -40;
    ctx.save();
    ctx.globalAlpha = clamp01(titleP * 1.5);
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 12;
    ctx.strokeStyle = "rgba(47, 14, 58, 0.95)";
    ctx.font = '68px "Knewave", cursive';
    ctx.strokeText("NEW HIGH SCORE!", width * 0.5, titleY);
    const grad = ctx.createLinearGradient(width * 0.2, 0, width * 0.8, 0);
    grad.addColorStop(0, "#fff2a8");
    grad.addColorStop(0.5, "#ffd166");
    grad.addColorStop(1, "#ff6f91");
    ctx.fillStyle = grad;
    ctx.fillText("NEW HIGH SCORE!", width * 0.5, titleY);
    ctx.restore();
  }

  // Score display
  const scoreP = easeOutElastic(animProgress(elapsed, 0.3, 0.6));
  if (scoreP > 0) {
    const fontSize = Math.round(100 * (0.6 + 0.4 * scoreP));
    ctx.save();
    ctx.globalAlpha = clamp01(scoreP * 2);
    ctx.textAlign = "center";
    ctx.font = `${fontSize}px "Knewave", cursive`;
    ctx.lineJoin = "round";
    ctx.lineWidth = 16;
    ctx.strokeStyle = "rgba(20, 8, 40, 0.9)";
    ctx.strokeText(`${score}`, width * 0.5, height * 0.3);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${score}`, width * 0.5, height * 0.3);
    ctx.restore();
  }

  // Rank badge
  const badgeP = easeOutBack(animProgress(elapsed, 0.5, 0.4));
  if (badgeP > 0) {
    const rankColor = RANK_COLORS[rank] || "#9e9e9e";
    const badgeWidth = 156;
    const badgeHeight = 52;
    const badgeX = width * 0.5 - badgeWidth / 2;
    const badgeY = height * 0.34;
    ctx.save();
    ctx.globalAlpha = badgeP;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 18);
    ctx.fillStyle = "rgba(10, 6, 20, 0.85)";
    ctx.strokeStyle = rankColor;
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rankColor;
    ctx.font = '900 28px "Nunito", sans-serif';
    ctx.fillText(`RANK ${rank}`, width * 0.5, badgeY + badgeHeight / 2 + 1);
    ctx.restore();
  }

  // Letter slots
  const slotsP = easeOutBack(animProgress(elapsed, 0.6, 0.5));
  if (slotsP > 0) {
    const slotWidth = 110;
    const slotHeight = 130;
    const gap = 30;
    const totalW = slotWidth * 3 + gap * 2;
    const startX = (width - totalW) / 2;
    const slotY = height * 0.47;
    const pulse = 0.5 + Math.sin(elapsed * 4) * 0.5;

    ctx.save();
    ctx.globalAlpha = clamp01(slotsP * 2);

    for (let i = 0; i < 3; i++) {
      const sx = startX + i * (slotWidth + gap);
      const isActive = i === cursorPos;

      // Slot background
      ctx.beginPath();
      ctx.roundRect(sx, slotY, slotWidth, slotHeight, 20);
      ctx.fillStyle = "rgba(18, 10, 34, 0.85)";
      ctx.strokeStyle = isActive
        ? `rgba(124, 247, 255, ${0.6 + pulse * 0.4})`
        : "rgba(255, 240, 210, 0.3)";
      ctx.lineWidth = isActive ? 4 : 2.5;
      ctx.fill();
      ctx.stroke();

      // Letter
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isActive ? "#ffffff" : "rgba(255, 255, 255, 0.82)";
      ctx.font = '72px "Knewave", cursive';
      ctx.fillText(initials[i] || "A", sx + slotWidth / 2, slotY + slotHeight / 2 + 4);

      // Up/down arrows for active slot
      if (isActive) {
        const arrowX = sx + slotWidth / 2;
        ctx.fillStyle = `rgba(124, 247, 255, ${0.6 + pulse * 0.3})`;
        // Up arrow
        ctx.beginPath();
        ctx.moveTo(arrowX, slotY - 18);
        ctx.lineTo(arrowX - 14, slotY - 4);
        ctx.lineTo(arrowX + 14, slotY - 4);
        ctx.closePath();
        ctx.fill();
        // Down arrow
        ctx.beginPath();
        ctx.moveTo(arrowX, slotY + slotHeight + 18);
        ctx.lineTo(arrowX - 14, slotY + slotHeight + 4);
        ctx.lineTo(arrowX + 14, slotY + slotHeight + 4);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // Instructions
  const instrP = easeOutCubic(animProgress(elapsed, 0.8, 0.3));
  if (instrP > 0) {
    ctx.save();
    ctx.globalAlpha = instrP * 0.72;
    ctx.textAlign = "center";
    ctx.fillStyle = "#e5fdff";
    ctx.font = '900 18px "Nunito", sans-serif';
    ctx.fillText("\u2191\u2193 CHANGE    \u2190\u2192 MOVE    ENTER CONFIRM", width * 0.5, height * 0.72);
    ctx.restore();
  }

  // Sparkles
  if (elapsed > 0.3) {
    const sparkA = Math.min((elapsed - 0.3) * 2, 0.85);
    drawSparkle(ctx, width * 0.2, height * 0.1, 14, "#ffd166", elapsed * 0.8, sparkA);
    drawSparkle(ctx, width * 0.8, height * 0.1, 14, "#73f7ff", -elapsed * 0.8, sparkA);
  }
}

function getInitialsSlotBounds(width, height) {
  const slotWidth = 110;
  const slotHeight = 130;
  const gap = 30;
  const totalW = slotWidth * 3 + gap * 2;
  const startX = (width - totalW) / 2;
  const slotY = height * 0.47;
  const slots = [];
  for (let i = 0; i < 3; i++) {
    slots.push({
      x: startX + i * (slotWidth + gap),
      y: slotY,
      width: slotWidth,
      height: slotHeight,
    });
  }
  return slots;
}

export function drawTvScreen(
  ctx,
  canvas,
  _time,
  {
    hovered = false,
    disabled = false,
    buttonLabel = "PRESS START",
    instructionLabel = "SPACE / ENTER TO SHRED",
    screenMode = "title",
    summary = null,
    showDismissButton = false,
    dismissHovered = false,
    summaryElapsed = 99,
    // eslint-disable-next-line no-unused-vars
    bootElapsed = 0,
    bootStatusLabel = "SYNCING STAGE",
    bootProgress = 0,
    bootReady = false,
    highScore = 0,
    highScoresHovered = false,
    leaderboards = { daily: [], weekly: [], alltime: [] },
    leaderboardTab = 'alltime',
    leaderboardElapsed = 0,
    initials = null,
    cursorPos = 0,
    initialsScore = 0,
    initialsRank = "F",
    initialsElapsed = 0,
  } = {},
) {
  const { width: rawWidth, height: rawHeight } = canvas;
  ctx.clearRect(0, 0, rawWidth, rawHeight);

  // Scale so all hardcoded px values (fonts, positions) work at any canvas size
  const scale = rawWidth / REFERENCE_SIZE;
  ctx.save();
  ctx.scale(scale, scale);
  const width = REFERENCE_SIZE;
  const height = Math.round(rawHeight / scale);

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
      highScoresHovered,
    });
  } else if (screenMode === "boot") {
    drawBootScreen(ctx, width, height, {
      bootStatusLabel,
      bootProgress,
      bootReady,
    });
  } else if (screenMode === "leaderboard") {
    drawLeaderboardScreen(ctx, width, height, {
      leaderboards,
      selectedTab: leaderboardTab,
      elapsed: leaderboardElapsed,
    });
  } else if (screenMode === "initials") {
    drawInitialsScreen(ctx, width, height, {
      initials: initials || ["A", "A", "A"],
      cursorPos,
      elapsed: initialsElapsed,
      score: initialsScore,
      rank: initialsRank,
    });
  } else {
    drawTitleScreen(ctx, width, height, { highScore, highScoresHovered });
  }

  // Button logic per screen mode
  const showButton = screenMode === "title" || screenMode === "summary" || screenMode === "leaderboard" || screenMode === "initials";
  let buttonAlpha = 0;
  let buttonSlide = 0;
  let effectiveButtonLabel = buttonLabel;
  let effectiveInstructionLabel = instructionLabel;
  let effectiveInstructionFont = '900 22px "Nunito", sans-serif';

  if (screenMode === "summary") {
    buttonAlpha = clamp01((summaryElapsed - 2.5) / 0.5);
    buttonSlide = (1 - easeOutCubic(clamp01((summaryElapsed - 2.5) / 0.5))) * 40;
    effectiveInstructionFont = '900 18px "Nunito", sans-serif';
  } else if (screenMode === "leaderboard") {
    buttonAlpha = clamp01(leaderboardElapsed / 0.3);
    effectiveButtonLabel = "BACK";
    effectiveInstructionLabel = "\u2190 \u2192 SWITCH  \u00B7  ESC BACK";
  } else if (screenMode === "initials") {
    buttonAlpha = clamp01((initialsElapsed - 0.8) / 0.4);
    effectiveButtonLabel = "OK";
    effectiveInstructionLabel = "ENTER TO CONFIRM";
  } else if (screenMode === "title") {
    buttonAlpha = 1;
  }

  if (showButton && buttonAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = buttonAlpha;
    drawActionButton(ctx, width, height, {
      hovered,
      disabled,
      buttonLabel: effectiveButtonLabel,
      instructionLabel: effectiveInstructionLabel,
      disabledInstructionLabel: effectiveInstructionLabel,
      instructionFont: effectiveInstructionFont,
      y: 0.82 + buttonSlide / height,
      hideInstruction: screenMode === "title" || screenMode === "summary",
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
  ctx.restore(); // undo scale transform
}
