import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderArtifactPptx, renderArtifactXlsx } from "../../../server/officeArtifact.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(process.argv[2] || resolve(scriptDirectory, "../CooperMobile/PreviewAssets"));

const content = `# Cooper Office delivery

## Outcome

One bounded Cooper session becomes a decision-ready Office artifact. The shared worker generates the package once, the browser preserves the authenticated bytes, and iPhone opens the exact same file with native Quick Look.

## Evidence

1. Gather the source session, decisions, constraints, and unresolved questions.
2. Generate a durable Office Open XML package on the authenticated host.
3. Preserve the artifact record, MIME type, filename, and bytes across every client.

## Delivery contract

- [x] Shared PowerPoint and Excel generators
- [x] Authenticated browser download readers
- [x] Native Quick Look preview, export, and sharing
- [x] Formula-backed Excel session summary
- [ ] Physical-device handoff validation

## Ownership

- Owner: Cooper artifact worker; High priority; create and persist the Office bytes.
- Owner: Web application; Medium priority; offer the authenticated original download.
- Owner: iOS client; Medium priority; preview and share the exact package.
- Owner: Release owner; High priority; validate physical-device handoff.

## Next move

Open the source session, confirm the accountable owner, and validate the final device handoff before release.
`;

const createdAt = "2026-07-14T20:00:00.000Z";
const [pptx, xlsx] = await Promise.all([
  renderArtifactPptx({ title: "Cooper PowerPoint decision deck", content, createdAt }),
  renderArtifactXlsx({ title: "Cooper Excel action register", content, createdAt })
]);

await mkdir(outputDirectory, { recursive: true });
const presentationPath = resolve(outputDirectory, "Cooper-PowerPoint-Decision-Deck.pptx");
const workbookPath = resolve(outputDirectory, "Cooper-Excel-Action-Register.xlsx");
await Promise.all([
  writeFile(presentationPath, pptx),
  writeFile(workbookPath, xlsx)
]);
console.log(presentationPath);
console.log(workbookPath);
