export function formatDocumentDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "long",
    timeZone: "Europe/Stockholm",
  }).format(date);
}

export function formatDocumentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} byte`;
  if (sizeBytes < 1024 * 1024) {
    return `${new Intl.NumberFormat("sv-SE", {
      maximumFractionDigits: 1,
    }).format(sizeBytes / 1024)} kB`;
  }
  return `${new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 1,
  }).format(sizeBytes / (1024 * 1024))} MB`;
}

export function getDocumentStatusLabel(status: "ACTIVE" | "ARCHIVED") {
  return status === "ACTIVE" ? "Aktivt" : "Arkiverat";
}

export function getDocumentFormatLabel(mediaType: string) {
  switch (mediaType) {
    case "application/pdf":
      return "PDF";
    case "image/jpeg":
      return "JPEG";
    case "image/png":
      return "PNG";
    case "text/plain":
      return "Text";
    default:
      return "Fil";
  }
}
