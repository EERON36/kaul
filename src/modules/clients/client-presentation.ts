export function getClientStatusLabel(
  status: "INACTIVE" | "ACTIVE" | "ARCHIVED",
): "Ej aktiv" | "Aktiv" | "Arkiverad" {
  if (status === "ACTIVE") return "Aktiv";
  if (status === "ARCHIVED") return "Arkiverad";
  return "Ej aktiv";
}

export function getAssignmentResponsibilityLabel(
  responsibility: "PRIMARY" | "SECONDARY",
): "Primär" | "Sekundär" {
  return responsibility === "PRIMARY" ? "Primär" : "Sekundär";
}
