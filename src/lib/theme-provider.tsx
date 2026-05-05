'use client';

import { createContext, useContext, useEffect } from "react";
import { useMantineColorScheme } from "@mantine/core";

type ThemeContextType = {
  isDark: boolean;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", isDark);
    
    // Also update data-mantine-color-scheme just in case (Mantine usually handles this)
    document.documentElement.setAttribute('data-mantine-color-scheme', colorScheme);
  }, [isDark, colorScheme]);

  return (
    <ThemeContext.Provider value={{ isDark, toggle: toggleColorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
