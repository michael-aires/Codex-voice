import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const gstackSkillRegistry = {
  ceo_review: {
    label: "CEO Review",
    file: join(__dirname, "ceo-review.md"),
    source: "plan-ceo-review/SKILL.md"
  },
  engineering_review: {
    label: "Engineering Review",
    file: join(__dirname, "engineering-review.md"),
    source: "plan-eng-review/SKILL.md"
  },
  code_review: {
    label: "Code Review",
    file: join(__dirname, "code-review.md"),
    source: "review/SKILL.md"
  },
  qa_review: {
    label: "QA Review",
    file: join(__dirname, "qa-review.md"),
    source: "qa-only/SKILL.md"
  },
  spec: {
    label: "Spec",
    file: join(__dirname, "spec.md"),
    source: "spec/SKILL.md"
  },
  office_hours: {
    label: "Office Hours",
    file: join(__dirname, "office-hours.md"),
    source: "office-hours/SKILL.md"
  },
  design_review: {
    label: "Design Review",
    file: join(__dirname, "design-review.md"),
    source: "design-review/SKILL.md"
  }
};

export const gstackSkillIds = new Set(Object.keys(gstackSkillRegistry));
