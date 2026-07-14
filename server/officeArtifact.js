import ExcelJS from "exceljs";
import pptxgen from "pptxgenjs";
import { markdownPdfBlocks } from "./pdfArtifact.js";

const COLORS = {
  ink: "252425",
  muted: "6F716B",
  line: "DADCD4",
  paper: "F6F6F1",
  volt: "F0DE4A",
  white: "FFFFFF",
  green: "DFF5E5",
  amber: "FFF3C4"
};

const PPT = {
  width: 13.333,
  height: 7.5,
  margin: 0.72
};

export async function renderArtifactPptx({
  title = "Cooper decision deck",
  content = "",
  createdAt = new Date().toISOString()
} = {}) {
  const safeTitle = cleanText(title) || "Cooper decision deck";
  const model = officeContentModel(safeTitle, content);
  const presentation = new pptxgen();
  presentation.layout = "LAYOUT_WIDE";
  presentation.author = "Cooper by AIRES";
  presentation.company = "AIRES";
  presentation.subject = "Generated session artifact";
  presentation.title = safeTitle;
  presentation.lang = "en-CA";
  presentation.theme = {
    headFontFace: "Arial",
    bodyFontFace: "Arial",
    lang: "en-CA"
  };
  presentation.defineSlideMaster({
    title: "COOPER",
    background: { color: COLORS.paper },
    objects: [
      { rect: { x: 0, y: 0, w: PPT.width, h: 0.08, fill: { color: COLORS.volt }, line: { color: COLORS.volt } } },
      { text: { text: "AIRES / COOPER", options: { x: PPT.margin, y: 0.26, w: 2.2, h: 0.28, fontFace: "Arial", fontSize: 10, bold: true, color: COLORS.muted, charSpacing: 1.4, margin: 0 } } },
      { text: { text: "SESSION ARTIFACT", options: { x: 10.55, y: 0.26, w: 2.05, h: 0.28, fontFace: "Arial", fontSize: 9, bold: true, color: COLORS.muted, charSpacing: 1.1, align: "right", margin: 0 } } },
      { line: { x: PPT.margin, y: 7.12, w: PPT.width - (PPT.margin * 2), h: 0, line: { color: COLORS.line, width: 0.8 } } },
      { text: { text: "COOPER BY AIRES", options: { x: PPT.margin, y: 7.19, w: 2.5, h: 0.18, fontFace: "Arial", fontSize: 7.5, color: COLORS.muted, charSpacing: 1, margin: 0 } } }
    ],
    slideNumber: { x: 12.12, y: 7.18, w: 0.48, h: 0.18, fontFace: "Arial", fontSize: 8, color: COLORS.muted, align: "right", margin: 0 }
  });

  addCoverSlide(presentation, safeTitle, model, createdAt);
  addEvidenceSlide(presentation, model);
  addReadinessSlide(presentation, model);
  addClosingSlide(presentation, model);

  const bytes = await presentation.write({ outputType: "nodebuffer", compression: true });
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

export async function renderArtifactXlsx({
  title = "Cooper action register",
  content = "",
  createdAt = new Date().toISOString()
} = {}) {
  const safeTitle = cleanText(title) || "Cooper action register";
  const model = officeContentModel(safeTitle, content);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Cooper by AIRES";
  workbook.lastModifiedBy = "Cooper artifact worker";
  workbook.created = validDate(createdAt);
  workbook.modified = validDate(createdAt);
  workbook.subject = "Generated session action register";
  workbook.title = safeTitle;
  workbook.company = "AIRES";
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;

  const summary = workbook.addWorksheet("Session Summary", {
    views: [{ state: "frozen", ySplit: 3, activeCell: "A4" }],
    properties: { defaultRowHeight: 22, tabColor: { argb: `FF${COLORS.ink}` } },
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 }
  });
  const register = workbook.addWorksheet("Action Register", {
    views: [{ state: "frozen", ySplit: 4, activeCell: "A5" }],
    properties: { defaultRowHeight: 22, tabColor: { argb: `FF${COLORS.volt}` } },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  });
  const actions = actionRows(model);
  buildActionRegister(register, safeTitle, actions, createdAt);
  buildSessionSummary(summary, safeTitle, model, actions, createdAt);

  workbook.worksheets.forEach((sheet) => {
    sheet.headerFooter.oddHeader = "&L&BAIRES / COOPER&B&RSession artifact";
    sheet.headerFooter.oddFooter = "&LCooper by AIRES&C&P / &N&R&F";
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function officeContentModel(title, content) {
  const blocks = markdownPdfBlocks(content).filter((block, index) => !(
    index === 0
      && block.type === "heading1"
      && cleanText(block.text).toLowerCase() === cleanText(title).toLowerCase()
  ));
  const sections = [];
  let current = { title: "Session signal", blocks: [] };
  for (const block of blocks) {
    if (["heading1", "heading2", "heading3"].includes(block.type)) {
      if (current.blocks.length) sections.push(current);
      current = { title: cleanText(block.text) || "Session signal", blocks: [] };
    } else if (block.type !== "divider") {
      current.blocks.push(block);
    }
  }
  if (current.blocks.length || !sections.length) sections.push(current);
  const lists = blocks.filter((block) => block.type === "list");
  const paragraphs = blocks.filter((block) => ["paragraph", "quote"].includes(block.type));
  return {
    title: cleanText(title),
    blocks,
    sections,
    lists,
    paragraphs,
    summary: truncate(paragraphs[0]?.text || sectionSummary(sections[0]) || "Bounded Cooper session evidence prepared for review.", 260),
    nextMove: truncate(lists.at(-1)?.text || paragraphs.at(-1)?.text || "Open the source session and confirm the next accountable move.", 220)
  };
}

function addCoverSlide(presentation, title, model, createdAt) {
  const slide = presentation.addSlide("COOPER");
  slide.background = { color: COLORS.ink };
  slide.addShape(presentation.ShapeType.rect, { x: 0, y: 0, w: PPT.width, h: 0.1, fill: { color: COLORS.volt }, line: { color: COLORS.volt } });
  slide.addText("AIRES / COOPER", { x: 0.82, y: 0.62, w: 2.4, h: 0.3, fontFace: "Arial", fontSize: 11, bold: true, color: COLORS.volt, charSpacing: 1.8, margin: 0 });
  slide.addText(title, { x: 0.82, y: 1.48, w: 10.6, h: 1.5, fontFace: "Arial", fontSize: 42, bold: true, color: COLORS.white, breakLine: false, fit: "shrink", valign: "mid", margin: 0 });
  slide.addText(model.summary, { x: 0.86, y: 3.28, w: 8.7, h: 1.25, fontFace: "Arial", fontSize: 20, color: "E2E3DD", breakLine: false, fit: "shrink", valign: "top", margin: 0 });
  slide.addShape(presentation.ShapeType.line, { x: 0.84, y: 5.54, w: 11.66, h: 0, line: { color: "555653", width: 1 } });
  slide.addText(`SESSION ARTIFACT  /  ${formatDate(createdAt)}`, { x: 0.84, y: 5.75, w: 5.2, h: 0.28, fontFace: "Arial", fontSize: 10, bold: true, color: "B7BAB1", charSpacing: 1.3, margin: 0 });
  slide.addText("Evidence → action", { x: 9.5, y: 5.72, w: 3, h: 0.32, fontFace: "Arial", fontSize: 14, bold: true, color: COLORS.volt, align: "right", margin: 0 });
}

function addEvidenceSlide(presentation, model) {
  const slide = presentation.addSlide("COOPER");
  addSlideTitle(slide, "Evidence stays attached to action");
  const fallback = [
    { title: "Evidence", summary: "Bound the source session, decisions, constraints, and unresolved questions." },
    { title: "Shared worker", summary: "Generate one durable Office Open XML package on the authenticated host." },
    { title: "Every client", summary: "Deliver the exact bytes to the browser and native iPhone reader." }
  ];
  const cards = fallback.map((item, index) => {
    const section = model.sections[index];
    if (!section) return item;
    return { title: section.title, summary: cardSummary(section) || item.summary };
  });
  cards.forEach((card, index) => {
    const x = 0.72 + (index * 4.14);
    slide.addShape(presentation.ShapeType.roundRect, { x, y: 1.65, w: 3.73, h: 3.92, rectRadius: 0.08, fill: { color: COLORS.white }, line: { color: COLORS.line, width: 1 } });
    slide.addText(`0${index + 1}`, { x: x + 0.26, y: 1.92, w: 0.62, h: 0.45, fontFace: "Arial", fontSize: 15, bold: true, color: COLORS.ink, align: "center", valign: "mid", margin: 0, fill: { color: COLORS.volt } });
    slide.addText(card.title, { x: x + 0.28, y: 2.66, w: 3.12, h: 0.74, fontFace: "Arial", fontSize: 24, bold: true, color: COLORS.ink, fit: "shrink", margin: 0 });
    slide.addText(card.summary, { x: x + 0.28, y: 3.62, w: 3.12, h: 1.22, fontFace: "Arial", fontSize: 16, color: COLORS.muted, breakLine: false, fit: "shrink", valign: "top", margin: 0 });
    if (index < 2) slide.addShape(presentation.ShapeType.chevron, { x: x + 3.79, y: 3.22, w: 0.28, h: 0.58, fill: { color: COLORS.ink }, line: { color: COLORS.ink } });
  });
}

function addReadinessSlide(presentation, model) {
  const slide = presentation.addSlide("COOPER");
  addSlideTitle(slide, "The delivery contract is observable");
  const checks = (model.lists.length ? model.lists : [
    { text: "Session evidence is bounded before generation.", checked: true },
    { text: "The host persists a real Office Open XML package.", checked: true },
    { text: "Web delivery preserves authenticated binary bytes.", checked: true },
    { text: "iPhone uses native Quick Look, export, and sharing.", checked: true },
    { text: "Physical-device handoff remains the final release gate.", checked: false }
  ]).slice(0, 6);
  checks.forEach((item, index) => {
    const y = 1.55 + (index * 0.82);
    const checked = item.checked !== false;
    slide.addShape(presentation.ShapeType.roundRect, { x: 0.84, y, w: 0.48, h: 0.48, rectRadius: 0.05, fill: { color: checked ? COLORS.green : COLORS.amber }, line: { color: checked ? "9ACAA6" : "D7BC5C", width: 1 } });
    slide.addText(checked ? "✓" : "→", { x: 0.84, y: y - 0.01, w: 0.48, h: 0.48, fontFace: "Arial", fontSize: 18, bold: true, color: COLORS.ink, align: "center", valign: "mid", margin: 0 });
    slide.addText(truncate(item.text, 150), { x: 1.58, y: y - 0.02, w: 8.9, h: 0.53, fontFace: "Arial", fontSize: 18, color: COLORS.ink, fit: "shrink", valign: "mid", margin: 0 });
    slide.addText(checked ? "READY" : "NEXT GATE", { x: 10.7, y: y + 0.08, w: 1.72, h: 0.25, fontFace: "Arial", fontSize: 9, bold: true, color: COLORS.muted, charSpacing: 1.2, align: "right", margin: 0 });
  });
}

function addClosingSlide(presentation, model) {
  const slide = presentation.addSlide("COOPER");
  slide.addShape(presentation.ShapeType.rect, { x: 0.72, y: 1.4, w: 0.12, h: 4.9, fill: { color: COLORS.volt }, line: { color: COLORS.volt } });
  slide.addText("NEXT MOVE", { x: 1.18, y: 1.55, w: 2.2, h: 0.3, fontFace: "Arial", fontSize: 11, bold: true, color: COLORS.muted, charSpacing: 1.8, margin: 0 });
  slide.addText("Open the source session before the next move", { x: 1.18, y: 2.08, w: 9.8, h: 1.32, fontFace: "Arial", fontSize: 40, bold: true, color: COLORS.ink, fit: "shrink", valign: "mid", margin: 0 });
  slide.addText(model.nextMove, { x: 1.2, y: 3.78, w: 8.9, h: 1.05, fontFace: "Arial", fontSize: 20, color: COLORS.muted, fit: "shrink", margin: 0 });
  slide.addShape(presentation.ShapeType.roundRect, { x: 9.98, y: 4.82, w: 2.18, h: 0.68, rectRadius: 0.06, fill: { color: COLORS.ink }, line: { color: COLORS.ink } });
  slide.addText("REVIEW IN COOPER", { x: 10.06, y: 5.01, w: 2.02, h: 0.25, fontFace: "Arial", fontSize: 10, bold: true, color: COLORS.white, charSpacing: 0.8, align: "center", margin: 0 });
}

function addSlideTitle(slide, title) {
  slide.addText(title, { x: PPT.margin, y: 0.72, w: 11.85, h: 0.72, fontFace: "Arial", fontSize: 36, bold: true, color: COLORS.ink, margin: 0 });
}

function buildActionRegister(sheet, title, actions, createdAt) {
  sheet.columns = [
    { key: "id", width: 10 },
    { key: "action", width: 52 },
    { key: "owner", width: 18 },
    { key: "status", width: 16 },
    { key: "priority", width: 14 },
    { key: "dueDate", width: 16 },
    { key: "source", width: 24 }
  ];
  sheet.mergeCells("A1:G1");
  sheet.getCell("A1").value = title;
  applyTitleCell(sheet.getCell("A1"));
  sheet.mergeCells("A2:G2");
  sheet.getCell("A2").value = `Editable action register generated ${formatDate(createdAt)} from bounded Cooper session evidence.`;
  applySubtitleCell(sheet.getCell("A2"));
  sheet.addTable({
    name: "CooperActionRegister",
    ref: "A4",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: [
      { name: "ID" }, { name: "Action" }, { name: "Owner" }, { name: "Status" },
      { name: "Priority" }, { name: "Due Date" }, { name: "Source" }
    ],
    rows: actions.map((action) => [action.id, action.action, action.owner, action.status, action.priority, action.dueDate, action.source])
  });
  const endRow = Math.max(5, 4 + actions.length);
  for (let row = 5; row <= Math.max(endRow, 104); row += 1) {
    sheet.getCell(`D${row}`).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"Open,In progress,Blocked,Complete"']
    };
    sheet.getCell(`E${row}`).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"Critical,High,Medium,Low"']
    };
    sheet.getCell(`F${row}`).numFmt = "mmm d, yyyy";
  }
  sheet.addConditionalFormatting({
    ref: `D5:D${endRow}`,
    rules: [
      { type: "containsText", operator: "containsText", text: "Complete", formulae: ['NOT(ISERROR(SEARCH("Complete",D5)))'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: `FF${COLORS.green}` }, fgColor: { argb: `FF${COLORS.green}` } } } },
      { type: "containsText", operator: "containsText", text: "Blocked", formulae: ['NOT(ISERROR(SEARCH("Blocked",D5)))'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFD9D6" }, fgColor: { argb: "FFFFD9D6" } } } }
    ]
  });
  sheet.getRow(1).height = 38;
  sheet.getRow(2).height = 30;
  sheet.getRow(4).height = 26;
  sheet.getColumn("B").alignment = { wrapText: true, vertical: "top" };
  sheet.getColumn("G").alignment = { wrapText: true, vertical: "top" };
  for (let row = 5; row <= endRow; row += 1) sheet.getRow(row).height = 36;
  sheet.autoFilter = `A4:G${endRow}`;
}

function buildSessionSummary(sheet, title, model, actions, createdAt) {
  sheet.columns = [
    { key: "label", width: 24 }, { key: "value", width: 18 }, { key: "spacer", width: 4 },
    { key: "detail", width: 46 }, { key: "status", width: 18 }
  ];
  sheet.mergeCells("A1:E1");
  sheet.getCell("A1").value = title;
  applyTitleCell(sheet.getCell("A1"));
  sheet.mergeCells("A2:E2");
  sheet.getCell("A2").value = `Session summary · ${formatDate(createdAt)} · formulas update from the Action Register`;
  applySubtitleCell(sheet.getCell("A2"));

  const completeCount = actions.filter((item) => item.status === "Complete").length;
  const openCount = actions.length - completeCount;
  const kpis = [
    ["Total actions", { formula: "COUNTA('Action Register'!A5:A104)", result: actions.length }],
    ["Complete", { formula: 'COUNTIF(\'Action Register\'!D5:D104,"Complete")', result: completeCount }],
    ["Open / active", { formula: 'COUNTA(\'Action Register\'!A5:A104)-COUNTIF(\'Action Register\'!D5:D104,"Complete")', result: openCount }]
  ];
  kpis.forEach(([label, value], index) => {
    const row = 4 + index;
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`A${row}`).font = { name: "Arial", size: 10, bold: true, color: { argb: `FF${COLORS.muted}` } };
    sheet.getCell(`B${row}`).value = value;
    sheet.getCell(`B${row}`).font = { name: "Arial", size: 24, bold: true, color: { argb: `FF${COLORS.ink}` } };
    sheet.getCell(`A${row}`).fill = solidFill(COLORS.paper);
    sheet.getCell(`B${row}`).fill = solidFill(index === 1 ? COLORS.green : COLORS.paper);
  });

  sheet.mergeCells("A8:E8");
  sheet.getCell("A8").value = "EXECUTIVE SIGNAL";
  applySectionCell(sheet.getCell("A8"));
  sheet.mergeCells("A9:E11");
  sheet.getCell("A9").value = model.summary;
  sheet.getCell("A9").alignment = { wrapText: true, vertical: "top" };
  sheet.getCell("A9").font = { name: "Arial", size: 12, color: { argb: `FF${COLORS.ink}` } };
  sheet.getCell("A9").fill = solidFill("FFFFFF");

  sheet.getCell("A13").value = "Source section";
  sheet.getCell("D13").value = "Working signal";
  ["A13", "D13"].forEach((address) => applySectionCell(sheet.getCell(address)));
  const sections = model.sections.slice(0, 5);
  sections.forEach((section, index) => {
    const row = 14 + index;
    sheet.getCell(`A${row}`).value = section.title;
    sheet.getCell(`D${row}`).value = cardSummary(section) || truncate(sectionSummary(section), 125);
    sheet.getCell(`E${row}`).value = index === 0 ? "Primary" : "Context";
    sheet.getCell(`D${row}`).alignment = { wrapText: true, vertical: "top" };
    sheet.getRow(row).height = 42;
  });
  sheet.mergeCells("A21:E21");
  sheet.getCell("A21").value = "NEXT MOVE";
  applySectionCell(sheet.getCell("A21"));
  sheet.mergeCells("A22:E23");
  sheet.getCell("A22").value = model.nextMove;
  sheet.getCell("A22").alignment = { wrapText: true, vertical: "top" };
  sheet.getCell("A22").font = { name: "Arial", size: 12, bold: true, color: { argb: `FF${COLORS.ink}` } };
  sheet.getCell("A22").fill = solidFill(COLORS.amber);
  sheet.getRow(1).height = 38;
  sheet.getRow(2).height = 28;
}

function actionRows(model) {
  const candidates = model.lists.length
    ? model.lists.slice(0, 100)
    : model.sections.slice(0, 12).map((section) => ({ text: sectionSummary(section), checked: null, source: section.title }));
  return candidates.map((block, index) => {
    const text = cleanText(block.text) || "Review the bounded session evidence.";
    const source = block.source || sourceForBlock(model, block) || "Session evidence";
    return {
      id: `A-${String(index + 1).padStart(3, "0")}`,
      action: text,
      owner: ownerFromText(text),
      status: block.checked === true ? "Complete" : block.checked === false ? "Open" : "Open",
      priority: priorityFromText(text),
      dueDate: dueDateFromText(text),
      source
    };
  });
}

function sourceForBlock(model, target) {
  return model.sections.find((section) => section.blocks.includes(target))?.title;
}

function sectionSummary(section) {
  return section?.blocks
    ?.filter((block) => ["paragraph", "quote", "list"].includes(block.type))
    .map((block) => block.text)
    .join(" ")
    .trim() || "";
}

function cardSummary(section) {
  const narrative = section?.blocks?.find((block) => ["paragraph", "quote"].includes(block.type));
  if (narrative?.text) {
    const sentence = narrative.text.match(/^.*?[.!?](?:\s|$)/)?.[0] || narrative.text;
    return truncate(sentence, 125);
  }
  const item = section?.blocks?.find((block) => block.type === "list");
  return truncate(item?.text || "", 125);
}

function ownerFromText(text) {
  const match = text.match(/(?:owner|owned by)\s*[:\-]\s*([^,.;]+)/i);
  return truncate(match?.[1] || "Unassigned", 40);
}

function priorityFromText(text) {
  const match = text.match(/\b(critical|high|medium|low)\b/i);
  if (!match) return "Medium";
  return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
}

function dueDateFromText(text) {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (!iso) return null;
  const date = new Date(`${iso[1]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function applyTitleCell(cell) {
  cell.font = { name: "Arial", size: 22, bold: true, color: { argb: `FF${COLORS.white}` } };
  cell.fill = solidFill(COLORS.ink);
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function applySubtitleCell(cell) {
  cell.font = { name: "Arial", size: 10, color: { argb: `FF${COLORS.muted}` } };
  cell.fill = solidFill(COLORS.paper);
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function applySectionCell(cell) {
  cell.font = { name: "Arial", size: 9, bold: true, color: { argb: `FF${COLORS.muted}` } };
  cell.fill = solidFill(COLORS.paper);
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function solidFill(color) {
  return { type: "pattern", pattern: "solid", fgColor: { argb: `FF${color}` } };
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncate(value, limit) {
  const text = cleanText(value);
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatDate(value) {
  const date = validDate(value);
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" }).format(date).toUpperCase();
}
