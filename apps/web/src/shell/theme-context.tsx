import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { THEME_PRESETS, type ThemePreset } from "./theme-presets.js";

interface ThemeContextValue {
  theme: ThemePreset;
  setTheme: (theme: ThemePreset) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreset>("Foundry");

  useEffect(() => {
    const preset = THEME_PRESETS[theme];

    for (const [token, value] of Object.entries(preset)) {
      document.documentElement.style.setProperty(token, value);
    }

    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
