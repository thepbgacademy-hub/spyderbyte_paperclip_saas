import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        exclude: ["apps/**", "coverage/**", "dist/**", "node_modules/**"],
        include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
    }
});
