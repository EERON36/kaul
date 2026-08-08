import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./src/test/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    env: {
      DATABASE_URL:
        "postgresql://kaul:local-development-only@127.0.0.1:5432/kaul",
      DEPLOYMENT_ENV: "test",
      BETTER_AUTH_SECRET: "fictional-vitest-secret-at-least-32-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
    exclude: ["src/**/*.integration.test.ts"],
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
