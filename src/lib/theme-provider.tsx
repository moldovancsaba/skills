'use client';

import { createContext, useContext } from "react";
import { useComputedColorScheme, useMantineColorScheme } from "@/components/gds/primitives";

type ThemeContextType = {
  isDark: boolean;
  scheme: "light" | "dark";
  colorScheme: "auto" | "light" | "dark";
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  scheme: "dark",
  colorScheme: "auto",
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("dark");
  const isDark = scheme === "dark";

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        scheme,
        colorScheme,
        toggle: () => setColorScheme(isDark ? "light" : "dark"),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
