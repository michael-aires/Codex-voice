const nodeStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
if (nodeStorageDescriptor?.get && nodeStorageDescriptor.configurable) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: undefined
  });
}

const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  TextRun,
  convertInchesToTwip
} = await import("docx");
import { markdownPdfBlocks } from "./pdfArtifact.js";

const COLORS = {
  ink: "2D2C2D",
  muted: "74747B",
  line: "DADCD4",
  paper: "F3F3EF",
  volt: "F0DE4A",
  heading: "2E74B5",
  headingDark: "1F4D78"
};

const TWIP = {
  bodyAfter: 120,
  listAfter: 160,
  line110: 264,
  line1167: 280,
  marker: 360,
  text: 720,
  hanging: 360
};

const NUMBERING = {
  bullet: "cooper-bullet",
  decimal: "cooper-decimal",
  unchecked: "cooper-unchecked",
  checked: "cooper-checked"
};

export async function renderArtifactDocx({
  title = "Cooper brief",
  content = "",
  createdAt = new Date().toISOString()
} = {}) {
  const safeTitle = cleanText(title) || "Cooper brief";
  const blocks = markdownPdfBlocks(content).filter((block, index) => !(
    index === 0
      && block.type === "heading1"
      && cleanText(block.text).toLowerCase() === safeTitle.toLowerCase()
  ));
  const children = [
    titleBlock(safeTitle),
    metadataBlock(createdAt),
    ...(blocks.length ? blocks.flatMap(docxBlock) : [bodyParagraph("No source content was available for this brief.")])
  ];

  const document = new Document({
    title: safeTitle,
    subject: "Generated session artifact",
    creator: "Cooper by AIRES",
    lastModifiedBy: "Cooper artifact worker",
    description: "An editable Word brief generated from bounded Cooper session evidence.",
    compatibilityModeVersion: 15,
    features: { updateFields: true },
    styles: documentStyles(),
    numbering: numberingDefinitions(),
    sections: [{
      properties: {
        page: {
          size: {
            width: convertInchesToTwip(8.5),
            height: convertInchesToTwip(11)
          },
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
            header: 708,
            footer: 708
          },
          pageNumbers: { start: 1 }
        }
      },
      headers: { default: runningHeader() },
      footers: { default: runningFooter() },
      children
    }]
  });

  return Packer.toBuffer(document);
}

function documentStyles() {
  return {
    default: {
      document: {
        run: { font: "Calibri", size: 22, color: COLORS.ink },
        paragraph: {
          spacing: { before: 0, after: TWIP.bodyAfter, line: TWIP.line110, lineRule: LineRuleType.AUTO }
        }
      },
      heading1: {
        run: { font: "Calibri", size: 32, bold: true, color: COLORS.heading },
        paragraph: { spacing: { before: 320, after: 160 }, keepNext: true, outlineLevel: 0 }
      },
      heading2: {
        run: { font: "Calibri", size: 26, bold: true, color: COLORS.heading },
        paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 }
      },
      heading3: {
        run: { font: "Calibri", size: 24, bold: true, color: COLORS.headingDark },
        paragraph: { spacing: { before: 160, after: 80 }, keepNext: true, outlineLevel: 2 }
      },
      listParagraph: {
        run: { font: "Calibri", size: 22, color: COLORS.ink },
        paragraph: {
          spacing: { before: 0, after: TWIP.listAfter, line: TWIP.line1167, lineRule: LineRuleType.AUTO }
        }
      }
    },
    paragraphStyles: [
      {
        id: "CooperTitle",
        name: "Cooper Title",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: "Arial", size: 48, bold: true, color: COLORS.ink },
        paragraph: { spacing: { before: 0, after: 80 }, keepNext: true }
      },
      {
        id: "CooperKicker",
        name: "Cooper Kicker",
        basedOn: "Normal",
        next: "CooperTitle",
        run: { font: "Arial", size: 18, bold: true, allCaps: true, color: COLORS.muted, characterSpacing: 18 },
        paragraph: { spacing: { before: 0, after: 80 }, keepNext: true }
      },
      {
        id: "CooperMetadata",
        name: "Cooper Metadata",
        basedOn: "Normal",
        next: "Normal",
        run: { font: "Arial", size: 18, color: COLORS.muted, allCaps: true, characterSpacing: 10 },
        paragraph: { spacing: { before: 0, after: 240 }, keepNext: true }
      }
    ]
  };
}

function numberingDefinitions() {
  const paragraph = {
    indent: { left: TWIP.text, hanging: TWIP.hanging },
    spacing: { before: 0, after: TWIP.listAfter, line: TWIP.line1167, lineRule: LineRuleType.AUTO }
  };
  const run = { font: "Calibri", size: 22, color: COLORS.ink };
  return {
    config: [
      {
        reference: NUMBERING.bullet,
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph, run } }]
      },
      {
        reference: NUMBERING.decimal,
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph, run } }]
      },
      {
        reference: NUMBERING.unchecked,
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "☐", alignment: AlignmentType.LEFT, style: { paragraph, run } }]
      },
      {
        reference: NUMBERING.checked,
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "☒", alignment: AlignmentType.LEFT, style: { paragraph, run: { ...run, color: COLORS.muted } } }]
      }
    ]
  };
}

function runningHeader() {
  return new Header({
    children: [new Paragraph({
      children: [new TextRun({ text: "AIRES / COOPER  |  SESSION ARTIFACT", font: "Arial", size: 16, bold: true, color: COLORS.muted, characterSpacing: 12 })],
      spacing: { after: 0 }
    })]
  });
}

function runningFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { top: { style: BorderStyle.SINGLE, color: COLORS.line, size: 4, space: 6 } },
      spacing: { before: 80, after: 0 },
      children: [new TextRun({
        font: "Arial",
        size: 15,
        color: COLORS.muted,
        children: ["COOPER BY AIRES  |  ", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES]
      })]
    })]
  });
}

function titleBlock(title) {
  return new Paragraph({
    style: "CooperTitle",
    children: [new TextRun({ text: title, font: "Arial", size: 48, bold: true, color: COLORS.ink })]
  });
}

function metadataBlock(createdAt) {
  return new Paragraph({
    style: "CooperMetadata",
    children: [new TextRun({
      text: `GENERATED ${formatDocxDate(createdAt)}  |  EDITABLE WORD BRIEF`,
      font: "Arial",
      size: 18,
      color: COLORS.muted,
      allCaps: true,
      characterSpacing: 10
    })]
  });
}

function docxBlock(block) {
  switch (block.type) {
  case "heading1": return [headingParagraph(block.text, HeadingLevel.HEADING_1)];
  case "heading2": return [headingParagraph(block.text, HeadingLevel.HEADING_2)];
  case "heading3": return [headingParagraph(block.text, HeadingLevel.HEADING_3)];
  case "list": return [listParagraph(block)];
  case "quote": return [quoteParagraph(block.text)];
  case "code": return [codeParagraph(block.text)];
  case "divider": return [dividerParagraph()];
  default: return [bodyParagraph(block.text)];
  }
}

function headingParagraph(text, heading) {
  return new Paragraph({
    heading,
    children: [new TextRun(cleanText(text))],
    keepNext: true
  });
}

function bodyParagraph(text) {
  return new Paragraph({
    children: [new TextRun({ text: cleanText(text), font: "Calibri", size: 22, color: COLORS.ink })],
    spacing: { before: 0, after: TWIP.bodyAfter, line: TWIP.line110, lineRule: LineRuleType.AUTO },
    widowControl: true
  });
}

function listParagraph(block) {
  const reference = block.checked === true
    ? NUMBERING.checked
    : block.checked === false
      ? NUMBERING.unchecked
      : block.ordered
        ? NUMBERING.decimal
        : NUMBERING.bullet;
  return new Paragraph({
    style: "ListParagraph",
    numbering: { reference, level: 0 },
    children: [new TextRun({
      text: cleanText(block.text),
      font: "Calibri",
      size: 22,
      color: block.checked === true ? COLORS.muted : COLORS.ink
    })],
    spacing: { before: 0, after: TWIP.listAfter, line: TWIP.line1167, lineRule: LineRuleType.AUTO }
  });
}

function quoteParagraph(text) {
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: COLORS.paper, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, color: COLORS.volt, size: 24, space: 8 } },
    indent: { left: 240, right: 180 },
    spacing: { before: 80, after: 200, line: TWIP.line110, lineRule: LineRuleType.AUTO },
    children: [new TextRun({ text: cleanText(text), font: "Calibri", size: 21, italics: true, color: COLORS.ink })]
  });
}

function codeParagraph(text) {
  const lines = String(text || "").split("\n").slice(0, 180);
  const children = lines.map((line, index) => new TextRun({
    text: line.slice(0, 240),
    font: "Courier New",
    size: 18,
    color: COLORS.ink,
    ...(index > 0 ? { break: 1 } : {})
  }));
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: COLORS.paper, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, color: COLORS.line, size: 12, space: 8 } },
    indent: { left: 240, right: 180 },
    spacing: { before: 80, after: 200, line: 240, lineRule: LineRuleType.AUTO },
    children
  });
}

function dividerParagraph() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, color: COLORS.line, size: 5, space: 8 } },
    spacing: { before: 80, after: 160 },
    children: [new TextRun("")]
  });
}

function cleanText(value) {
  return String(value || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2011]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDocxDate(value) {
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
