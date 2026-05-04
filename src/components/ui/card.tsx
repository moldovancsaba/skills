"use client";

import * as React from "react";
import { Card as MantineCard, Title, Text, Stack, Box } from "@mantine/core";

const Card = React.forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => (
  <MantineCard ref={ref} shadow="sm" radius="md" withBorder bg="var(--mantine-color-dark-8)" p={0} {...props}>
    {children}
  </MantineCard>
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => (
  <Box ref={ref} p="xl" {...props}>
    <Stack gap={4}>
      {children}
    </Stack>
  </Box>
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, any>(({ children, ...props }, ref) => (
  <Title ref={ref} order={3} size="h4" fw={900} lts={-0.5} {...props}>
    {children}
  </Title>
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, any>(({ children, ...props }, ref) => (
  <Text ref={ref} size="sm" c="dimmed" {...props}>
    {children}
  </Text>
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => (
  <Box ref={ref} px="xl" pb="xl" pt={0} {...props}>
    {children}
  </Box>
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => (
  <Box ref={ref} p="xl" pt={0} {...props}>
    {children}
  </Box>
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
