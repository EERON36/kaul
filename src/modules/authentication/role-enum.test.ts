import { UserRole as PrismaUserRole } from "../../generated/prisma/client";
import { describe, expect, it } from "vitest";

import { USER_ROLES } from "./permissions";

describe("authentication role enum", () => {
  it("matches the generated Prisma UserRole enum exactly", () => {
    expect([...USER_ROLES].sort()).toEqual(
      Object.values(PrismaUserRole).sort(),
    );
  });
});
