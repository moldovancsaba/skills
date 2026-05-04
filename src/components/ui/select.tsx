"use client";

import * as React from "react";
import { Select as MantineSelect, type SelectProps as MantineSelectProps } from "@mantine/core";

// Simple context to collect SelectItem data if used in compound pattern
const SelectContext = React.createContext<{
  value?: string;
  onValueChange?: (val: string) => void;
  items: { value: string; label: string }[];
  addItem: (item: { value: string; label: string }) => void;
} | null>(null);

export function Select({ 
  children, 
  value, 
  onValueChange,
  defaultValue,
  ...props 
}: any) {
  const [items, setItems] = React.useState<{ value: string; label: string }[]>([]);
  const addItem = React.useCallback((item: { value: string; label: string }) => {
    setItems(prev => prev.some(i => i.value === item.value) ? prev : [...prev, item]);
  }, []);

  // If this is used as a single component (Mantine style)
  if (props.data) {
    return (
      <MantineSelect
        value={value}
        onChange={onValueChange}
        defaultValue={defaultValue}
        radius="md"
        styles={{
          input: { backgroundColor: "rgba(0,0,0,0.2)" },
          dropdown: { backgroundColor: "var(--mantine-color-dark-7)", border: "1px solid var(--mantine-color-dark-4)" }
        }}
        {...props}
      />
    );
  }

  // If used as compound component (Shadcn style)
  return (
    <SelectContext.Provider value={{ value, onValueChange, items, addItem }}>
      {children}
      <MantineSelect
        style={{ display: "none" }} // Hidden Mantine select to satisfy logic if needed
        data={items}
        value={value}
        onChange={onValueChange}
      />
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ children, className, ...props }: any) {
  const context = React.useContext(SelectContext);
  // In compound mode, we'd need a more complex implementation to render the Mantine select here.
  // For now, we'll render a Mantine Select and ignore the children if they are just placeholders.
  return (
    <MantineSelect
      value={context?.value}
      onChange={context?.onValueChange}
      data={context?.items || []}
      placeholder="Select option..."
      radius="md"
      styles={{
        input: { backgroundColor: "rgba(0,0,0,0.2)" },
        dropdown: { backgroundColor: "var(--mantine-color-dark-7)", border: "1px solid var(--mantine-color-dark-4)" }
      }}
      {...props}
    />
  );
}

export function SelectValue({ placeholder }: any) {
  return null; // Handled by MantineSelect
}

export function SelectContent({ children }: any) {
  return children; // Items will register themselves
}

export function SelectItem({ value, children }: any) {
  const context = React.useContext(SelectContext);
  React.useEffect(() => {
    if (context) {
      context.addItem({ value, label: typeof children === "string" ? children : value });
    }
  }, [value, children, context]);
  return null;
}

export function SelectGroup({ children }: any) { return children; }
export function SelectLabel({ children }: any) { return null; }
export function SelectSeparator() { return null; }
export function SelectScrollUpButton() { return null; }
export function SelectScrollDownButton() { return null; }
