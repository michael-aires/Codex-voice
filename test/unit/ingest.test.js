import { describe, it, expect } from "vitest";
import { deriveTitleFromPlan, isLoopbackAddress } from "../../src/lib/ingest.js";

describe("deriveTitleFromPlan", () => {
  it("uses the first markdown heading, stripping leading #'s", () => {
    const plan = "# Build the widget\n\nSome body text here.";
    expect(deriveTitleFromPlan(plan)).toBe("Build the widget");
  });

  it("strips multiple leading #'s and surrounding whitespace from a heading", () => {
    const plan = "###   Phase 2 plan   \n\nDetails follow.";
    expect(deriveTitleFromPlan(plan)).toBe("Phase 2 plan");
  });

  it("falls back to the first non-empty line for a plain-text plan", () => {
    const plan = "\n\nShip the login flow\nThen do the rest";
    expect(deriveTitleFromPlan(plan)).toBe("Ship the login flow");
  });

  it("collapses internal whitespace in the derived title", () => {
    const plan = "Refactor    the\t\tauth   module";
    expect(deriveTitleFromPlan(plan)).toBe("Refactor the auth module");
  });

  it("caps the title at roughly 80 characters", () => {
    const long = "A".repeat(200);
    const plan = `# ${long}`;
    const title = deriveTitleFromPlan(plan);
    expect(title.length).toBeLessThanOrEqual(80);
  });

  it("returns '' for an empty string", () => {
    expect(deriveTitleFromPlan("")).toBe("");
  });

  it("returns '' for whitespace-only input", () => {
    expect(deriveTitleFromPlan("   \n\t  \n  ")).toBe("");
  });

  it("returns '' for a heading that is only #'s with no text", () => {
    expect(deriveTitleFromPlan("###")).toBe("");
  });
});

describe("isLoopbackAddress", () => {
  it("returns true for 127.0.0.1", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
  });

  it("returns true for ::1", () => {
    expect(isLoopbackAddress("::1")).toBe(true);
  });

  it("returns true for ::ffff:127.0.0.1", () => {
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("returns true for localhost", () => {
    expect(isLoopbackAddress("localhost")).toBe(true);
  });

  it("returns true for an empty string (unknown local in dev)", () => {
    expect(isLoopbackAddress("")).toBe(true);
  });

  it("returns true for undefined (unknown local in dev)", () => {
    expect(isLoopbackAddress(undefined)).toBe(true);
  });

  it("returns false for a public IP", () => {
    expect(isLoopbackAddress("8.8.8.8")).toBe(false);
  });

  it("returns false for a private LAN IP", () => {
    expect(isLoopbackAddress("192.168.1.10")).toBe(false);
  });
});
