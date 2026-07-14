import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { renderArtifactPptx, renderArtifactXlsx } from "../server/officeArtifact.js";

const source = `# Cooper Office delivery

## Outcome

One bounded session becomes a decision-ready Office artifact that every Cooper client can deliver.

## Delivery contract

1. Gather the source session evidence.
2. Generate one durable package on the authenticated host.
3. Preserve the exact bytes across the web and iPhone clients.

## Readiness checklist

- [x] Shared host generator
- [x] Authenticated browser download
- [x] Native Quick Look reader
- [ ] Physical-device handoff validation

## Ownership

- Owner: Cooper artifact worker; High priority; create the package.
- Owner: iOS client; Medium priority; open and share the package.
`;

test("PowerPoint generation returns a valid four-slide Office Open XML package", async () => {
  const bytes = await renderArtifactPptx({
    title: "Cooper Office delivery",
    content: source,
    createdAt: "2026-07-14T20:00:00.000Z"
  });
  assert.equal(bytes.subarray(0, 2).toString(), "PK");

  const zip = await JSZip.loadAsync(bytes);
  const slideNames = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  assert.equal(slideNames.length, 4);
  assert.ok(zip.file("ppt/presentation.xml"));
  assert.ok(zip.file("docProps/core.xml"));
  const slideText = (await Promise.all(slideNames.map((name) => zip.file(name).async("string")))).join("\n");
  assert.match(slideText, /Evidence stays attached to action/);
  assert.match(slideText, /The delivery contract is observable/);
  assert.match(slideText, /Open the source session before the next move/);
  assert.doesNotMatch(slideText, /<a:t>Thank you<\/a:t>/i);
});

test("Excel generation returns formulas, validation, tables, and editable source rows", async () => {
  const bytes = await renderArtifactXlsx({
    title: "Cooper action register",
    content: source,
    createdAt: "2026-07-14T20:00:00.000Z"
  });
  assert.equal(bytes.subarray(0, 2).toString(), "PK");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Session Summary", "Action Register"]);
  const register = workbook.getWorksheet("Action Register");
  const summary = workbook.getWorksheet("Session Summary");
  assert.equal(register.getCell("A5").value, "A-001");
  assert.match(String(register.getCell("B5").value), /Gather the source session evidence/);
  assert.equal(register.getCell("D5").dataValidation.type, "list");
  assert.equal(register.getCell("E5").dataValidation.type, "list");
  assert.equal(register.getTables()[0].name, "CooperActionRegister");
  assert.equal(summary.getCell("B4").value.formula, "COUNTA('Action Register'!A5:A104)");
  assert.match(summary.getCell("B5").value.formula, /COUNTIF/);
  assert.doesNotMatch(JSON.stringify(summary.model), /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/);
});
