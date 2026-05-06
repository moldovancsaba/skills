'use client';

import { MantineProvider, createTheme, rem, MantineTheme } from "@mantine/core";
import { ThemeProvider } from "@/lib/theme-provider";
import React from "react";

export const theme = createTheme({
  primaryColor: "orange",
  fontFamily: "var(--font-body), sans-serif",
  fontFamilyMonospace: "Monaco, Courier, monospace",
  fontSizes: {
    xs: rem(12),
    sm: rem(14),
    md: rem(16),
    lg: rem(18),
    xl: rem(20),
  },
  headings: {
    fontFamily: "var(--font-display), var(--font-body), sans-serif",
    fontWeight: "900",
    sizes: {
      h1: { fontSize: rem(34), lineHeight: "1.1", fontWeight: "900" },
      h2: { fontSize: rem(26), lineHeight: "1.2", fontWeight: "900" },
      h3: { fontSize: rem(20), lineHeight: "1.3", fontWeight: "900" },
      h4: { fontSize: rem(18), lineHeight: "1.4", fontWeight: "900" },
    },
  },
  components: {
    Container: {
      defaultProps: {
        size: "xl",
      },
    },
    Button: {
      defaultProps: {
        radius: "md",
        fw: 900,
        tt: "uppercase",
        lts: rem(1),
      },
    },
    Badge: {
      defaultProps: {
        radius: "sm",
        variant: "light",
        fw: 700,
      },
    },
    Card: {
      defaultProps: {
        radius: "lg",
        withBorder: true,
        padding: "xl",
      },
    },
    ThemeIcon: {
      defaultProps: {
        variant: "light",
        radius: "md",
      },
    },
    InputWrapper: {
      styles: (theme: MantineTheme) => ({
        label: {
          fontWeight: 700,
          marginBottom: rem(4),
          fontSize: theme.fontSizes.sm,
          color: 'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-2))'
        },
        description: {
          marginBottom: rem(4),
          fontStyle: 'italic'
        }
      })
    },
    Input: {
      styles: {
        input: {
          backgroundColor: 'light-dark(rgba(0, 0, 0, 0.02), rgba(255, 255, 255, 0.03))',
          border: '1px solid light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1))',
        }
      }
    }
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </MantineProvider>
  );
}
