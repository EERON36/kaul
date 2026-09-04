import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NavigationGuardProvider } from "@/components/navigation-guard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { DocumentUpload } from "./document-upload-client";

function renderUpload(props: Parameters<typeof DocumentUpload>[0]) {
  const TestNavigationGuardProvider = NavigationGuardProvider as ComponentType<{
    children?: ReactNode;
    confirmationMessage: string;
  }>;
  return renderToStaticMarkup(
    createElement(
      TestNavigationGuardProvider,
      { confirmationMessage: "Fiktiv bekräftelse" },
      createElement(DocumentUpload, props),
    ),
  );
}

describe("Document upload form", () => {
  it("provides a labelled standard picker and explicit format and size guidance", () => {
    const html = renderUpload({
      clientId: "123e4567-e89b-42d3-a456-426614174001",
    });
    expect(html).toContain('for="document-title"');
    expect(html).toContain('for="document-description"');
    expect(html).toContain('for="document-file"');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".pdf,.jpg,.jpeg,.png,.txt"');
    expect(html).toContain("PDF, JPEG, PNG eller giltig UTF-8-text");
    expect(html).toContain("Högst 25 MiB");
    expect(html).toContain("En fil åt gången");
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("drop");
  });

  it("keeps title and description read-only when creating a new version", () => {
    const html = renderUpload({
      clientId: "123e4567-e89b-42d3-a456-426614174001",
      documentId: "123e4567-e89b-42d3-a456-426614174002",
      initialTitle: "Fiktiv plan",
      initialDescription: "Oförändrad beskrivning",
    });
    const title = html.match(/<input[^>]*id="document-title"[^>]*>/)?.[0];
    const description = html.match(
      /<textarea[^>]*id="document-description"[^>]*>/,
    )?.[0];
    expect(title).toContain("readOnly");
    expect(title).not.toContain("disabled");
    expect(description).toContain("readOnly");
    expect(description).not.toContain("disabled");
    expect(html).toContain("Ladda upp ny version");
  });
});
