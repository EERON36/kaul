import { getEnvironment } from "@/lib/environment";

const environmentNotices = {
  development:
    "Utvecklingsmiljö – använd inte verkliga personuppgifter eller känslig information.",
  test: "Testmiljö – använd endast fiktiva uppgifter.",
  pilot:
    "Pilotmiljö – använd inte verkliga personuppgifter eller känslig information.",
} as const;

export function EnvironmentNotice() {
  const { DEPLOYMENT_ENV } = getEnvironment();

  if (DEPLOYMENT_ENV === "production") {
    return null;
  }

  return (
    <div className="environment-notice" role="status">
      {environmentNotices[DEPLOYMENT_ENV]}
    </div>
  );
}
