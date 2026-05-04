"use client";

import * as React from "react";
import { Slider as MantineSlider, type SliderProps as MantineSliderProps } from "@mantine/core";

const Slider = React.forwardRef<HTMLDivElement, any>(
  ({ value, onValueChange, onValueCommit, defaultValue, ...props }, ref) => {
    return (
      <MantineSlider
        ref={ref}
        value={Array.isArray(value) ? value[0] : value}
        defaultValue={Array.isArray(defaultValue) ? defaultValue[0] : defaultValue}
        onChange={(val) => {
          onValueChange?.([val]);
        }}
        onChangeEnd={(val) => {
          onValueCommit?.([val]);
        }}
        color="brand"
        radius="xl"
        size="md"
        {...props}
      />
    );
  }
);

Slider.displayName = "Slider";

export { Slider };
