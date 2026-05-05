"use client";

import * as React from "react";
import { TextInput, Textarea, Select, Checkbox, Stack, rem } from "@mantine/core";

// UNIFIED INPUT
interface FormInputProps extends React.ComponentPropsWithoutRef<typeof TextInput> {}

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ style, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        radius="md"
        styles={(theme) => ({
          input: { 
            backgroundColor: 'light-dark(rgba(0, 0, 0, 0.02), rgba(255, 255, 255, 0.03))',
            border: `1px solid light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1))`,
            '&:focus': {
              borderColor: 'var(--mantine-color-orange-6)'
            }
          },
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
        })}
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
        styles={(theme) => ({
          input: { 
            backgroundColor: 'light-dark(rgba(0, 0, 0, 0.02), rgba(255, 255, 255, 0.03))',
            border: `1px solid light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1))`,
            '&:focus': {
              borderColor: 'var(--mantine-color-orange-6)'
            }
          },
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
        })}
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
        styles={(theme) => ({
          input: { 
            backgroundColor: 'light-dark(rgba(0, 0, 0, 0.02), rgba(255, 255, 255, 0.03))',
            border: `1px solid light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1))`
          },
          label: { 
            fontWeight: 700, 
            marginBottom: rem(4),
            fontSize: theme.fontSizes.sm,
            color: 'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-2))'
          }
        })}
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
        styles={(theme) => ({
          label: { 
            fontWeight: 700, 
            cursor: "pointer",
            color: 'light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-1))'
          }
        })}
        {...props}
      />
    );
  }
);
FormCheckbox.displayName = "FormCheckbox";