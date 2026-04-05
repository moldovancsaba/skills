"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// UNIFIED INPUT - Always use this instead of <input> or old .input class
interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ className, type, label, error, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "text-foreground placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    );
  }
);
FormInput.displayName = "FormInput";

// UNIFIED TEXTAREA - Always use this instead of <textarea>
interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const FormTextarea = React.forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const textareaId = id || props.name;
    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "text-foreground placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "resize-none",
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    );
  }
);
FormTextarea.displayName = "FormTextarea";

// UNIFIED SELECT - Always use this instead of <select>
interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const FormSelect = React.forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ className, label, error, id, options, ...props }, ref) => {
    const selectId = id || props.name;
    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <select
          id={selectId}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "text-foreground placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          ref={ref}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    );
  }
);
FormSelect.displayName = "FormSelect";

// UNIFIED CHECKBOX - Always use this for checkboxes
interface FormCheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const FormCheckbox = React.forwardRef<HTMLInputElement, FormCheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    const checkboxId = id || props.name;
    return (
      <div className="flex items-center gap-2">
        <input
          id={checkboxId}
          type="checkbox"
          className={cn(
            "h-4 w-4 rounded border border-input",
            "text-foreground bg-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          ref={ref}
          {...props}
        />
        {label && (
          <label
            htmlFor={checkboxId}
            className="text-sm text-foreground cursor-pointer"
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);
FormCheckbox.displayName = "FormCheckbox";