import { describe, expect, it } from "vitest";

import {
  buildAttachmentContentDisposition,
  normalizeDisplayFilename,
  parseUploadMetadataHeader,
  requireApprovedDeclaredType,
} from "./document-input";

function metadataHeader(filename: string) {
  return Buffer.from(
    JSON.stringify({
      operationId: "123e4567-e89b-42d3-a456-426614174000",
      title: "Fiktivt dokument",
      description: null,
      originalFilename: filename,
      declaredMediaType: "application/pdf",
    }),
  ).toString("base64url");
}

describe("document input", () => {
  it("accepts only the approved extension and declared MIME combinations", () => {
    expect(requireApprovedDeclaredType("fil.pdf", "application/pdf")).toEqual({
      extension: "pdf",
      mediaType: "application/pdf",
    });
    expect(requireApprovedDeclaredType("bild.JPEG", "image/jpeg")).toEqual({
      extension: "jpeg",
      mediaType: "image/jpeg",
    });
    expect(() =>
      requireApprovedDeclaredType("fil.pdf", "text/plain"),
    ).toThrow();
    for (const filename of [
      "fil.docx",
      "fil.xlsx",
      "fil.pptx",
      "fil.zip",
      "fil.html",
      "fil.svg",
      "fil.exe",
      "fil.js",
      "fil.iso",
      "fil",
    ]) {
      expect(() =>
        requireApprovedDeclaredType(filename, "application/octet-stream"),
      ).toThrow();
    }
  });

  it("keeps original metadata separate while normalising unsafe display names", () => {
    expect(normalizeDisplayFilename("../mapp\\farlig\r\nfil.pdf")).toBe(
      ".._mapp_farlig__fil.pdf",
    );
    expect(normalizeDisplayFilename("CON.txt")).toBe("_CON.txt");
    expect(normalizeDisplayFilename("rapport: höst?.pdf")).toBe(
      "rapport_ höst_.pdf",
    );
    expect(normalizeDisplayFilename("rapport-📄.pdf")).toBe("rapport-📄.pdf");
    expect(() =>
      buildAttachmentContentDisposition("rapport-\ud800.pdf"),
    ).not.toThrow();
    expect(normalizeDisplayFilename("a".repeat(300) + ".pdf")).toHaveLength(
      180,
    );
  });

  it("parses strict bounded metadata without accepting arbitrary fields", () => {
    expect(
      parseUploadMetadataHeader(metadataHeader("rapport.pdf")),
    ).toMatchObject({
      originalFilename: "rapport.pdf",
      description: null,
    });
    expect(() => parseUploadMetadataHeader(null)).toThrow();
    expect(() =>
      parseUploadMetadataHeader(
        Buffer.from(
          JSON.stringify({
            ...JSON.parse(
              Buffer.from(
                metadataHeader("rapport.pdf"),
                "base64url",
              ).toString(),
            ),
            storageKey: "browser-controlled",
          }),
        ).toString("base64url"),
      ),
    ).toThrow();
  });

  it("creates an attachment header without CR/LF injection", () => {
    const value = buildAttachmentContentDisposition("rädd\r\nX-Test: ja.pdf");
    expect(value).toContain("attachment;");
    expect(value).toContain("filename*=UTF-8''");
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    expect(value).not.toContain("X-Test:");
  });
});
