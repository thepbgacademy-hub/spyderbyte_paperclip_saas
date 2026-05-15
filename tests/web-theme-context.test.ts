import { describe, expect, it } from "vitest";

import { THEME_PRESETS, type ThemePreset } from "../apps/web/src/shell/theme-presets.js";

describe("theme presets", () => {
  it("defines global CSS variables for every Wealth Factory preset", () => {
    for (const preset of Object.keys(THEME_PRESETS) as ThemePreset[]) {
      expect(THEME_PRESETS[preset]["--background-base"]).toBeTruthy();
      expect(THEME_PRESETS[preset]["--midground-base"]).toBeTruthy();
      expect(THEME_PRESETS[preset]["--theme-font-sans"]).toBeTruthy();
    }
  });
});
