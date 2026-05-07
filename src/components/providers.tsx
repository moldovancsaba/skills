'use client';

import { MantineProvider, createTheme, rem, MantineTheme } from "@mantine/core";
import { ThemeProvider } from "@/lib/theme-provider";
import React from "react";

export const theme = createTheme({
  primaryColor: "ingress",
  primaryShade: 4,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontFamilyMonospace: "Monaco, Courier, monospace",
  black: "#0B0F14",
  white: "#E6EDF3",
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
    brand: ["#DBEAFE", "#BFDBFE", "#93C5FD", "#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF", "#10243F", "#0B1727"],
    knowledge: ["#D1FAE5", "#A7F3D0", "#6EE7B7", "#34D399", "#10B981", "#059669", "#047857", "#065F46", "#0F2D27", "#081C18"],
    execution: ["#E0F2FE", "#BAE6FD", "#7DD3FC", "#38BDF8", "#0EA5E9", "#0284C7", "#0369A1", "#075985", "#102838", "#091822"],
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
    appBg: "#0B0F14",
    sidebarBg: "#0F141B",
    surfaceBase: "#161C24",
    surfaceElevated: "#1B2430",
    borderPrimary: "#2A3441",
    textPrimary: "#E6EDF3",
    textSecondary: "#9AA4B2",
    textMuted: "#6B7280",
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
          backgroundColor: "#0B0F14",
          color: "#E6EDF3",
        },
      },
    },
    NavLink: {
      styles: {
        root: {
          borderRadius: rem(10),
          color: "#E6EDF3",
          transition: "background-color 160ms ease-out, border-color 160ms ease-out, transform 160ms ease-out",
        },
        label: {
          fontWeight: 600,
          letterSpacing: "-0.01em",
        },
        description: {
          color: "#9AA4B2",
        },
      },
    },
    Button: {
      defaultProps: {
        radius: "md",
        fw: 700,
        tt: "uppercase",
        lts: rem(0.6),
      },
      styles: (_theme: MantineTheme, props: Record<string, any>) => ({
        root: {
          borderColor: props.variant === "outline" ? "#334155" : undefined,
          background:
            props.variant === "filled" && (props.color === "ingress" || props.color === "brand" || !props.color)
              ? "linear-gradient(135deg, #2563EB, #3B82F6)"
              : props.variant === "filled" && props.color === "green"
                ? "linear-gradient(135deg, #16A34A, #22C55E)"
                : props.variant === "light"
                  ? "#243041"
                  : undefined,
          color: "#E6EDF3",
          boxShadow: "0 8px 18px rgba(0, 0, 0, 0.22)",
          transition: "transform 160ms ease-out, box-shadow 160ms ease-out, border-color 160ms ease-out, background-color 160ms ease-out",
        },
      }),
    },
    Badge: {
      defaultProps: {
        radius: "sm",
        variant: "light",
        fw: 600,
        tt: "uppercase",
      },
      styles: {
        root: {
          letterSpacing: "-0.01em",
          borderWidth: rem(1),
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
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
          backgroundColor: "#161C24",
          borderColor: "#2A3441",
          boxShadow: "0 10px 24px rgba(0,0,0,0.24)",
          color: "#E6EDF3",
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
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        },
      },
    },
    Text: {
      defaultProps: {
        size: "sm",
      },
      styles: {
        root: {
          color: "#E6EDF3",
        },
      },
    },
    Title: {
      defaultProps: {
        fw: 700,
      },
      styles: {
        root: {
          color: "#E6EDF3",
          letterSpacing: "-0.03em",
        },
      },
    },
    InputWrapper: {
      styles: (theme: MantineTheme) => ({
        label: {
          fontWeight: 500,
          marginBottom: rem(4),
          fontSize: theme.fontSizes.sm,
          color: "#9AA4B2",
        },
        description: {
          marginBottom: rem(4),
          fontStyle: "italic",
          color: "#6B7280",
        },
      }),
    },
    Input: {
      styles: {
        input: {
          backgroundColor: "#1B2430",
          border: "1px solid #2A3441",
          color: "#E6EDF3",
        },
      },
    },
    Modal: {
      styles: {
        content: {
          backgroundColor: "#1B2430",
          border: "1px solid #2A3441",
          boxShadow: "0 24px 60px rgba(0,0,0,0.42)",
        },
        header: {
          backgroundColor: "#1B2430",
        },
      },
    },
    Divider: {
      styles: {
        root: {
          borderColor: "#2A3441",
        },
        label: {
          color: "#6B7280",
          fontWeight: 500,
        },
      },
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <ThemeProvider>{children}</ThemeProvider>
    </MantineProvider>
  );
}
