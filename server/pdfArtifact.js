import PDFDocument from "pdfkit";

const COLORS = {
  ink: "#242520",
  muted: "#6F716B",
  line: "#DADCD4",
  paper: "#F6F6F1",
  volt: "#F6E53B",
  white: "#FFFFFF"
};

export function markdownPdfBlocks(value = "") {
  const lines = normalizePdfText(value)
    .replace(/<!--[^]*?-->/g, "")
    .split("\n");
  const blocks = [];
  let paragraph = [];
  let code = [];
  let inCode = false;

  const flushParagraph = () => {
    const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };
  const flushCode = () => {
    const text = code.join("\n").trimEnd();
    if (text) blocks.push({ type: "code", text });
    code = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^\s*```/.test(line)) {
      flushParagraph();
      if (inCode) flushCode();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^\s*(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: `heading${Math.min(3, heading[1].length)}`, text: inlineText(heading[2]) });
      continue;
    }

    const checklist = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (checklist) {
      flushParagraph();
      blocks.push({ type: "list", text: inlineText(checklist[2]), checked: checklist[1].toLowerCase() === "x" });
      continue;
    }

    const orderedList = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (orderedList) {
      flushParagraph();
      blocks.push({
        type: "list",
        text: inlineText(orderedList[2]),
        checked: null,
        ordered: true,
        number: Number(orderedList[1])
      });
      continue;
    }

    const list = line.match(/^\s*[-*+]\s+(.+)$/);
    if (list) {
      flushParagraph();
      blocks.push({ type: "list", text: inlineText(list[1]), checked: null, ordered: false });
      continue;
    }

    const quote = line.match(/^\s*>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      blocks.push({ type: "quote", text: inlineText(quote[1]) });
      continue;
    }

    const divider = /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line);
    if (divider) {
      flushParagraph();
      blocks.push({ type: "divider", text: "" });
      continue;
    }

    paragraph.push(inlineText(line));
  }

  flushParagraph();
  flushCode();
  return blocks;
}

export async function renderArtifactPdf({ title = "Cooper brief", content = "", createdAt = new Date().toISOString() } = {}) {
  const safeTitle = inlineText(title) || "Cooper brief";
  const blocks = markdownPdfBlocks(content);
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 54, right: 54, bottom: 58, left: 54 },
    bufferPages: true,
    info: {
      Title: safeTitle,
      Author: "Cooper by AIRES",
      Subject: "Generated session artifact",
      Creator: "Cooper artifact worker"
    }
  });
  const chunks = [];
  const completion = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  renderHeader(doc, safeTitle, createdAt);
  if (!blocks.length) {
    renderParagraph(doc, "No source content was available for this brief.");
  } else {
    blocks.forEach((block) => renderBlock(doc, block));
  }
  renderFooters(doc);
  doc.end();
  return completion;
}

function renderHeader(doc, title, createdAt) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.save();
  doc.roundedRect(doc.page.margins.left, doc.page.margins.top, width, 118, 8).fill(COLORS.ink);
  doc.rect(doc.page.margins.left, doc.page.margins.top + 114, width, 4).fill(COLORS.volt);
  doc.fillColor(COLORS.volt).font("Helvetica-Bold").fontSize(9).text(
    "AIRES / COOPER",
    doc.page.margins.left + 22,
    doc.page.margins.top + 18,
    { characterSpacing: 1.2, lineBreak: false }
  );
  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(23).text(
    title,
    doc.page.margins.left + 22,
    doc.page.margins.top + 42,
    { width: width - 44, height: 52, ellipsis: true }
  );
  doc.restore();
  doc.y = doc.page.margins.top + 138;
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text(
    `GENERATED ${formatPdfDate(createdAt)}  |  SESSION ARTIFACT`,
    { characterSpacing: 0.65 }
  );
  doc.moveDown(1.8);
}

function renderBlock(doc, block) {
  ensureSpace(doc, block.type === "heading1" ? 72 : block.type === "code" ? 90 : 48);
  switch (block.type) {
  case "heading1":
    doc.moveDown(0.45).fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(18).text(block.text, { lineGap: 3 });
    doc.moveDown(0.35);
    break;
  case "heading2":
    doc.moveDown(0.4).fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(14).text(block.text, { lineGap: 2 });
    doc.moveDown(0.3);
    break;
  case "heading3":
    doc.moveDown(0.25).fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(10).text(block.text.toUpperCase(), { characterSpacing: 0.55 });
    doc.moveDown(0.25);
    break;
  case "list":
    renderList(doc, block);
    break;
  case "quote":
    renderQuote(doc, block.text);
    break;
  case "code":
    renderCode(doc, block.text);
    break;
  case "divider":
    doc.moveDown(0.45).strokeColor(COLORS.line).lineWidth(0.75)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(0.7);
    break;
  default:
    renderParagraph(doc, block.text);
  }
}

function renderParagraph(doc, text) {
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(10.5).text(text, {
    align: "left",
    lineGap: 3.2
  });
  doc.moveDown(0.75);
}

function renderList(doc, block) {
  const x = doc.page.margins.left;
  const y = doc.y;
  const marker = block.checked === true
    ? "[x]"
    : block.checked === false
      ? "[ ]"
      : block.ordered
        ? `${block.number || 1}.`
        : "-";
  doc.fillColor(block.checked === true ? COLORS.muted : COLORS.ink).font("Helvetica-Bold").fontSize(9.5).text(marker, x, y + 1, {
    width: 26,
    lineBreak: false
  });
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(10.5).text(block.text, x + 28, y, {
    width: doc.page.width - doc.page.margins.right - x - 28,
    lineGap: 2.8
  });
  doc.moveDown(0.45);
}

function renderQuote(doc, text) {
  const x = doc.page.margins.left;
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const height = doc.heightOfString(text, { width: width - 28, lineGap: 3 }) + 20;
  doc.roundedRect(x, y, width, height, 6).fill(COLORS.paper);
  doc.rect(x, y, 4, height).fill(COLORS.volt);
  doc.fillColor(COLORS.ink).font("Helvetica-Oblique").fontSize(10).text(text, x + 16, y + 10, {
    width: width - 28,
    lineGap: 3
  });
  doc.y = y + height + 9;
}

function renderCode(doc, text) {
  const x = doc.page.margins.left;
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const safe = text.length > 6000 ? `${text.slice(0, 5997)}...` : text;
  const height = Math.min(300, doc.heightOfString(safe, { width: width - 24, lineGap: 2 }) + 20);
  doc.roundedRect(x, y, width, height, 6).fill(COLORS.paper);
  doc.fillColor(COLORS.ink).font("Courier").fontSize(8).text(safe, x + 12, y + 10, {
    width: width - 24,
    height: height - 20,
    ellipsis: true,
    lineGap: 2
  });
  doc.y = y + height + 10;
}

function renderFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const previousBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const y = doc.page.height - 38;
    doc.strokeColor(COLORS.line).lineWidth(0.6)
      .moveTo(doc.page.margins.left, y - 7)
      .lineTo(doc.page.width - doc.page.margins.right, y - 7)
      .stroke();
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5).text(
      "COOPER BY AIRES",
      doc.page.margins.left,
      y,
      { width: width / 2, lineBreak: false }
    );
    doc.text(
      `${index - range.start + 1} / ${range.count}`,
      doc.page.margins.left + width / 2,
      y,
      { width: width / 2, align: "right", lineBreak: false }
    );
    doc.page.margins.bottom = previousBottomMargin;
  }
}

function ensureSpace(doc, height) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) doc.addPage();
}

function inlineText(value) {
  return normalizePdfText(value)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/[*_~`]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePdfText(value) {
  return String(value || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2011]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

function formatPdfDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "UNKNOWN DATE";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(date).toUpperCase();
}
