"use client";

import * as React from "react";
import { Button as MantineButton, type ButtonProps as MantineButtonProps } from "@mantine/core";

export interface ButtonProps extends MantineButtonProps, Omit<React.ComponentPropsWithoutRef<"button">, "style" | "color"> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "filled", size = "sm", ...props }, ref) => {
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
