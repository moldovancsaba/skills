"use client";

import * as React from "react";
import { TextInput, Textarea, Select, Checkbox, Stack } from "@mantine/core";

// UNIFIED INPUT
interface FormInputProps extends React.ComponentPropsWithoutRef<typeof TextInput> {}

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ style, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        radius="md"
        styles={{
          input: { backgroundColor: "rgba(0,0,0,0.2)" },
          label: { fontWeight: 600, marginBottom: 4 }
        }}
        {...props}
      />
    );
  }
);
FormInput.displayName = "FormInput";

// UNIFIED TEXTAREA
interface FormTextareaProps extends React.ComponentPropsWithoutRef<typeof Textarea> {}

export const FormTextarea = React.forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ ...props }, ref) => {
    return (
      <Textarea
        ref={ref}
        radius="md"
        styles={{
          input: { backgroundColor: "rgba(0,0,0,0.2)" },
          label: { fontWeight: 600, marginBottom: 4 }
        }}
        {...props}
      />
    );
  }
);
FormTextarea.displayName = "FormTextarea";

// UNIFIED SELECT
interface FormSelectProps extends React.ComponentPropsWithoutRef<typeof Select> {}

export const FormSelect = React.forwardRef<HTMLInputElement, FormSelectProps>(
  ({ ...props }, ref) => {
    return (
      <Select
        ref={ref}
        radius="md"
        styles={{
          input: { backgroundColor: "rgba(0,0,0,0.2)" },
          label: { fontWeight: 600, marginBottom: 4 }
        }}
        {...props}
      />
    );
  }
);
FormSelect.displayName = "FormSelect";

// UNIFIED CHECKBOX
interface FormCheckboxProps extends React.ComponentPropsWithoutRef<typeof Checkbox> {}

export const FormCheckbox = React.forwardRef<HTMLInputElement, FormCheckboxProps>(
  ({ ...props }, ref) => {
    return (
      <Checkbox
        ref={ref}
        radius="sm"
        styles={{
          label: { fontWeight: 600, cursor: "pointer" }
        }}
        {...props}
      />
    );
  }
);
FormCheckbox.displayName = "FormCheckbox";