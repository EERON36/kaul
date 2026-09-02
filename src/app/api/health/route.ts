import { prisma } from "@/lib/prisma";
import { assertStoredPersonalIdentityNumberKeysAvailable } from "@/modules/clients/personal-identity-number";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await assertStoredPersonalIdentityNumberKeysAvailable();

    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
