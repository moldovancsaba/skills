'use client';

import { MantineProvider, createTheme, localStorageColorSchemeManager, rem, MantineTheme } from "@mantine/core";
import { ThemeProvider } from "@/lib/theme-provider";
import { UiLanguageProvider } from "@/lib/ui-i18n";
import React from "react";
import { getModuleTheme, resolveModuleTone } from "@/lib/semantic-theme";

const colorSchemeManager = localStorageColorSchemeManager({
  key: "checklist-color-scheme",
});

export const theme = createTheme({
  primaryColor: "ingress",
  primaryShade: { light: 6, dark: 4 },
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontFamilyMonospace: "Monaco, Courier, monospace",
  defaultRadius: "md",
  colors: {
    dark: ["#C9D1D9", "#B0BAC5", "#8B949E", "#6E7681", "#484F58", "#30363D", "#21262D", "#161C24", "#0F141B", "#0B0F14"],
    ingress: ["#DBEAFE", "#BFDBFE", "#93C5FD", "#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF", "#10243F", "#0B1727"],
    synthesis: ["#E0E7FF", "#C7D2FE", "#A5B4FC", "#818CF8", "#6366F1", "#4F46E5", "#4338CA", "#3730A3", "#1A1D4A", "#11142F"],
    knowmore: ["#D1FAE5", "#A7F3D0", "#6EE7B7", "#34D399", "#10B981", "#059669", "#047857", "#065F46", "#0F2D27", "#081C18"],
    strategy: ["#EDE9FE", "#DDD6FE", "#C4B5FD", "#A78BFA", "#8B5CF6", "#7C3AED", "#6D28D9", "#5B21B6", "#24163F", "#140D24"],
    checklist: ["#E0F2FE", "#BAE6FD", "#7DD3FC", "#38BDF8", "#0EA5E9", "#0284C7", "#0369A1", "#075985", "#102838", "#091822"],
    tactical: ["#CCFBF1", "#99F6E4", "#5EEAD4", "#2DD4BF", "#14B8A6", "#0D9488", "#0F766E", "#115E59", "#102D2A", "#091A18"],
    review: ["#FEF3C7", "#FDE68A", "#FCD34D", "#FBBF24", "#F59E0B", "#D97706", "#B45309", "#92400E", "#3B2A12", "#24190B"],
  },
  fontSizes: {
    xs: rem(12),
    sm: rem(14),
    md: rem(16),
    lg: rem(18),
    xl: rem(20),
  },
  headings: {
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontWeight: "700",
    sizes: {
      h1: { fontSize: rem(32), lineHeight: "1.1" },
      h2: { fontSize: rem(24), lineHeight: "1.2" },
      h3: { fontSize: rem(20), lineHeight: "1.25" },
      h4: { fontSize: rem(18), lineHeight: "1.4" },
    },
  },
  other: {
    appBg: "var(--app-bg)",
    sidebarBg: "var(--sidebar-bg)",
    surfaceBase: "var(--surface-base)",
    surfaceElevated: "var(--surface-elevated)",
    borderPrimary: "var(--border-primary)",
    textPrimary: "var(--text-primary)",
    textSecondary: "var(--text-secondary)",
    textMuted: "var(--text-muted)",
  },
  components: {
    Container: {
      defaultProps: {
        size: "xl",
      },
    },
    AppShell: {
      styles: {
        main: {
          backgroundColor: "var(--app-bg)",
          color: "var(--text-primary)",
        },
      },
    },
    NavLink: {
      styles: {
        root: {
          borderRadius: rem(10),
          color: "var(--text-primary)",
        },
        label: {
          fontWeight: 600,
          letterSpacing: 0,
        },
        description: {
          color: "var(--text-secondary)",
        },
      },
    },
    Button: {
      defaultProps: {
        radius: "md",
        fw: 700,
      },
      styles: (_theme: MantineTheme, props: Record<string, any>) => ({
        root: {
          ...(function () {
            const tone = resolveModuleTone(props.color);
            const toneTheme = getModuleTheme(tone);
            if (props.variant === "filled") {
              return {
                background: `linear-gradient(135deg, ${toneTheme.color}, ${toneTheme.color})`,
              };
            }
            if (props.variant === "light") {
              return {
                background: toneTheme.surface,
                border: `1px solid ${toneTheme.border}`,
              };
            }
            if (props.variant === "outline") {
              return {
                borderColor: toneTheme.border,
                color: toneTheme.color,
              };
            }
            return {};
          })(),
          color: "var(--text-primary)",
          boxShadow: "var(--surface-shadow-elevated)",
        },
      }),
    },
    Badge: {
      defaultProps: {
        radius: "sm",
        variant: "light",
        fw: 600,
      },
      styles: {
        root: {
          letterSpacing: 0,
          borderWidth: rem(1),
          boxShadow: "var(--surface-icon-shadow)",
        },
      },
    },
    Card: {
      defaultProps: {
        radius: "md",
        withBorder: true,
        padding: "xl",
      },
      styles: {
        root: {
          backgroundColor: "var(--surface-base)",
          borderColor: "var(--border-primary)",
          boxShadow: "var(--surface-shadow-elevated)",
          color: "var(--text-primary)",
        },
      },
    },
    ThemeIcon: {
      defaultProps: {
        variant: "light",
        radius: "sm",
      },
      styles: {
        root: {
          border: "1px solid var(--surface-icon-border)",
          boxShadow: "var(--surface-icon-shadow)",
        },
      },
    },
    Text: {
      defaultProps: {
        size: "sm",
      },
      styles: {
        root: {
          color: "var(--text-primary)",
        },
      },
    },
    Title: {
      defaultProps: {
        fw: 700,
      },
      styles: {
        root: {
          color: "var(--text-primary)",
          letterSpacing: 0,
        },
      },
    },
    InputWrapper: {
      styles: (theme: MantineTheme) => ({
        label: {
          fontWeight: 500,
          marginBottom: rem(4),
          fontSize: theme.fontSizes.sm,
          color: "var(--text-secondary)",
        },
        description: {
          marginBottom: rem(4),
          fontStyle: "italic",
          color: "var(--text-muted)",
        },
      }),
    },
    Input: {
      styles: {
        input: {
          backgroundColor: "var(--surface-elevated)",
          border: "1px solid var(--border-primary)",
          color: "var(--text-primary)",
        },
      },
    },
    Modal: {
      styles: {
        content: {
          backgroundColor: "var(--surface-elevated)",
          border: "1px solid var(--border-primary)",
          boxShadow: "var(--surface-shadow-elevated)",
        },
        header: {
          backgroundColor: "var(--surface-elevated)",
        },
      },
    },
    Divider: {
      styles: {
        root: {
          borderColor: "var(--border-primary)",
        },
        label: {
          color: "var(--text-muted)",
          fontWeight: 500,
        },
      },
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      colorSchemeManager={colorSchemeManager}
      defaultColorScheme="auto"
    >
      <ThemeProvider>
        <UiLanguageProvider>
          {children}
          <style jsx global>{`
            *,
            *::before,
            *::after {
              animation: none !important;
              transition: none !important;
              scroll-behavior: auto !important;
            }
          `}</style>
        </UiLanguageProvider>
      </ThemeProvider>
    </MantineProvider>
  );
}
