"use client";

import * as React from "react";
import { Switch as MantineSwitch, type SwitchProps as MantineSwitchProps } from "@mantine/core";

const Switch = React.forwardRef<HTMLInputElement, MantineSwitchProps>(
  ({ checked, onCheckedChange, onChange, ...props }, ref) => {
    return (
      <MantineSwitch
        ref={ref}
        checked={checked}
        onChange={(event) => {
          onChange?.(event);
          onCheckedChange?.(event.currentTarget.checked);
        }}
        radius="xl"
        size="md"
        color="brand"
        styles={{
          track: { cursor: "pointer" },
          thumb: { cursor: "pointer" }
        }}
        {...props}
      />
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
