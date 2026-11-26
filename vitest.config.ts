import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/engine/**/*.ts"],
      exclude: ["src/engine/index.ts", "src/engine/types.ts"],
      thresholds: { lines: 90 },
    },
  },
});
