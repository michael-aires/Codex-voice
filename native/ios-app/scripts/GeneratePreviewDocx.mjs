import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderArtifactDocx } from "../../../server/docxArtifact.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultOutput = resolve(scriptDirectory, "../CooperMobile/PreviewAssets/Cooper-Word-Brief.docx");
const output = resolve(process.argv[2] || defaultOutput);

const content = `# Cooper Word delivery brief

## Outcome

Cooper can turn bounded session evidence into an editable Word brief. The same artifact is generated once by the shared worker, downloaded on the web, and opened with native Quick Look on iPhone.

## Delivery contract

1. Gather evidence from the active Cooper session.
2. Generate a real Office Open XML document on the authenticated host.
3. Preserve the artifact record, MIME type, and filename across every client.
4. Open the exact bytes in Word-compatible readers without text-decoding the file.

## Readiness checklist

- [x] Shared Word generator
- [x] Editable headings and numbered lists
- [x] Web download surface
- [x] Native Quick Look reader
- [ ] Physical-device handoff validation

> Generated artifacts stay attached to the Cooper session that supplied their evidence.

## Session notes

The first Word milestone deliberately favors a clean, editable executive brief. Richer source citations, table layouts, and document templates can build on the same artifact contract.

---

## Ownership

- Artifact worker: creates and persists the Word bytes.
- Web application: identifies Word artifacts and offers an authenticated download.
- iOS application: downloads the same bytes and previews them natively.
`;

const bytes = await renderArtifactDocx({
  title: "Cooper Word delivery brief",
  content,
  createdAt: "2026-07-14T18:30:00.000Z"
});

await mkdir(dirname(output), { recursive: true });
await writeFile(output, bytes);
console.log(output);
