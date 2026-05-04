"use client";

import * as React from "react";
import { Button as MantineButton, type ButtonProps as MantineButtonProps } from "@mantine/core";

export interface ButtonProps extends MantineButtonProps, Omit<React.ComponentPropsWithoutRef<"button">, "style" | "color"> {
  asChild?: boolean;
  component?: any;
  href?: string;
}

const Button = React.forwardRef<any, ButtonProps>(
  ({ variant = "filled", size = "sm", component, ...props }, ref) => {
    // Map Shadcn variants to Mantine variants
    const variantMap: Record<string, string> = {
      default: "filled",
      destructive: "filled",
      outline: "outline",
      secondary: "light",
      ghost: "subtle",
      link: "subtle",
    };

    const colorMap: Record<string, string> = {
      destructive: "red",
      default: "brand",
    };

    return (
      <MantineButton
        ref={ref}
        component={component}
        variant={(variantMap[variant as string] || variant) as any}
        color={(colorMap[variant as string] || "brand") as any}
        size={size === "default" ? "sm" : (size as any)}
        radius="md"
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
