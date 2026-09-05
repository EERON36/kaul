import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);

  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hexadecimal colour, received ${hex}`);
  }

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);

  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

describe("global keyboard focus treatment", () => {
  it("uses a visible two-colour ring with sufficient contrast on Kaul surfaces", () => {
    const stylesheet = readFileSync(
      new URL("./globals.css", import.meta.url),
      "utf8",
    );

    expect(stylesheet).toContain("--focus: #005a9c;");
    expect(stylesheet).toContain("--focus-inner: #ffffff;");
    expect(stylesheet).toContain("outline: 3px solid var(--focus);");
    expect(stylesheet).toContain("outline-offset: 3px;");
    expect(stylesheet).toContain("box-shadow: 0 0 0 2px var(--focus-inner);");

    expect(contrastRatio("#005a9c", "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#005a9c", "#f4f1eb")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#ffffff", "#23445b")).toBeGreaterThanOrEqual(3);
  });
});

describe("Documents responsive layout", () => {
  it("allows long metadata to wrap and stacks primary actions on narrow screens", () => {
    const stylesheet = readFileSync(
      new URL("./globals.css", import.meta.url),
      "utf8",
    );
    expect(stylesheet).toContain(".document-metadata dd");
    expect(stylesheet).toContain("overflow-wrap: anywhere;");
    expect(stylesheet).toContain(".document-upload-form .primary-button");
    expect(stylesheet).toContain(".document-actions a");
    expect(stylesheet).toContain(".document-metadata {");
    expect(stylesheet).toContain("minmax(0, 1fr)");
  });
});
