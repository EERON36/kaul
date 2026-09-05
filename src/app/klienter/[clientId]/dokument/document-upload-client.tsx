"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { useNavigationGuard } from "@/components/navigation-guard";

const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
]);

function encodeMetadata(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function DocumentUpload({
  clientId,
  documentId,
  initialTitle = "",
  initialDescription = "",
}: Readonly<{
  clientId: string;
  documentId?: string;
  initialTitle?: string;
  initialDescription?: string;
}>) {
  const router = useRouter();
  const statusId = useId();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const setNavigationBlocked = useNavigationGuard();
  const dirtyRef = useRef(false);
  const isVersion = documentId !== undefined;

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  function markDirty() {
    dirtyRef.current = true;
    setNavigationBlocked(true);
  }

  function showError(value: string) {
    setMessageIsError(true);
    setMessage(value);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get("file");
    const title = String(values.get("title") ?? "").trim();
    const description = String(values.get("description") ?? "").trim();
    if (!(file instanceof File) || file.size === 0) {
      showError("Välj en fil som innehåller data.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      showError("Filen är större än 25 MiB.");
      return;
    }
    if (!ACCEPTED_TYPES.has(file.type)) {
      showError("Filformatet stöds inte.");
      return;
    }
    if (title.length < 1 || title.length > 200 || description.length > 2000) {
      showError("Kontrollera titel och beskrivning.");
      return;
    }
    setPending(true);
    setMessageIsError(false);
    setMessage("Filen kontrolleras och laddas upp.");
    try {
      const metadata = encodeMetadata({
        operationId: crypto.randomUUID(),
        title,
        description: description || null,
        originalFilename: file.name,
        declaredMediaType: file.type,
      });
      const endpoint = documentId
        ? `/api/kaul/clients/${clientId}/documents/${documentId}/versions`
        : `/api/kaul/clients/${clientId}/documents`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": file.type,
          "x-kaul-document-metadata": metadata,
        },
        body: file,
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        showError(
          result?.code === "FILE_TOO_LARGE"
            ? "Filen är större än 25 MiB."
            : result?.code === "MALWARE_REJECTED"
              ? "Filen avvisades av säkerhetskontrollen."
              : result?.code === "DOCUMENT_SERVICE_UNAVAILABLE"
                ? "Dokumenttjänsten är tillfälligt otillgänglig. Försök senare."
                : "Filen kunde inte laddas upp. Kontrollera filformatet och försök igen.",
        );
        return;
      }
      const result = (await response.json()) as { documentId: string };
      dirtyRef.current = false;
      setNavigationBlocked(false);
      router.push(
        `/klienter/${clientId}/dokument/${result.documentId}?uppladdad=klar`,
      );
      router.refresh();
    } catch {
      showError("Filen kunde inte laddas upp. Försök igen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      aria-describedby={statusId}
      aria-busy={pending}
      className="document-upload-form"
      onChange={markDirty}
      onSubmit={submit}
    >
      <div className="form-field">
        <label htmlFor="document-title">Titel</label>
        <input
          defaultValue={initialTitle}
          disabled={pending}
          id="document-title"
          maxLength={200}
          name="title"
          required
          readOnly={isVersion}
          type="text"
        />
      </div>
      <div className="form-field">
        <label htmlFor="document-description">Beskrivning (valfri)</label>
        <textarea
          defaultValue={initialDescription}
          disabled={pending}
          id="document-description"
          maxLength={2000}
          name="description"
          readOnly={isVersion}
          rows={4}
        />
      </div>
      <div className="form-field">
        <label htmlFor="document-file">Fil</label>
        <input
          accept=".pdf,.jpg,.jpeg,.png,.txt"
          aria-describedby="document-file-guidance"
          disabled={pending}
          id="document-file"
          name="file"
          required
          type="file"
        />
        <p className="field-guidance" id="document-file-guidance">
          PDF, JPEG, PNG eller giltig UTF-8-text. Högst 25 MiB. En fil åt
          gången.
        </p>
      </div>
      <p
        aria-live={messageIsError ? "assertive" : "polite"}
        className={messageIsError ? "form-error" : "form-status"}
        id={statusId}
        role={messageIsError ? "alert" : "status"}
      >
        {message}
      </p>
      <div className="form-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending
            ? "Kontrollerar filen…"
            : isVersion
              ? "Ladda upp ny version"
              : "Ladda upp dokument"}
        </button>
      </div>
    </form>
  );
}
