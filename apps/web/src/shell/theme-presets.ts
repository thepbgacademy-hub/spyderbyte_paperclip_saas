export type ThemePreset = "Foundry" | "Midnight" | "Ledger" | "Ember";

export const THEME_PRESETS: Record<ThemePreset, Record<string, string>> = {
  Foundry: {
    "--foreground-base": "#ffffff",
    "--midground-base": "#f4e6c6",
    "--background-base": "#071311",
    "--theme-font-sans": "\"Azeret Mono\", \"Segoe UI\", sans-serif",
    "--theme-font-mono": "\"JetBrains Mono\", monospace",
    "--theme-radius": "0.5rem"
  },
  Midnight: {
    "--foreground-base": "#ffffff",
    "--midground-base": "#d7e6ff",
    "--background-base": "#09111f",
    "--theme-font-sans": "\"Azeret Mono\", \"Segoe UI\", sans-serif",
    "--theme-font-mono": "\"JetBrains Mono\", monospace",
    "--theme-radius": "0.5rem"
  },
  Ledger: {
    "--foreground-base": "#ffffff",
    "--midground-base": "#ece6d8",
    "--background-base": "#11120f",
    "--theme-font-sans": "\"Azeret Mono\", \"Segoe UI\", sans-serif",
    "--theme-font-mono": "\"JetBrains Mono\", monospace",
    "--theme-radius": "0.4rem"
  },
  Ember: {
    "--foreground-base": "#ffffff",
    "--midground-base": "#ffd8b0",
    "--background-base": "#1a0d09",
    "--theme-font-sans": "\"Azeret Mono\", \"Segoe UI\", sans-serif",
    "--theme-font-mono": "\"JetBrains Mono\", monospace",
    "--theme-radius": "0.5rem"
  }
};
