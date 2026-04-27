/**
 * COMPANY PROFILE CONSTANTS
 * Defines master lists for industries, business models, and product categories.
 */

export const BUSINESS_MODELS = [
  "B2B",
  "B2C",
  "SaaS",
  "Marketplace",
  "E-commerce",
  "D2C",
  "Enterprise",
  "SMB",
] as const;

export type BusinessModel = (typeof BUSINESS_MODELS)[number];

export const INDUSTRIES = [
  "Technology",
  "Healthcare",
  "Finance",
  "Education",
  "Retail",
  "Manufacturing",
  "Energy",
  "Transportation",
  "Real Estate",
  "Entertainment",
  "Agriculture",
  "Construction",
  "Hospitality",
  "Legal",
  "Marketing",
  "Cybersecurity",
  "AI/Robotics",
  "E-commerce",
  "Web3/Crypto",
  "Consumer Electronics",
  "Sustainability/CleanTech",
] as const;

export const PRODUCT_CATEGORIES = [
  "Software",
  "Hardware",
  "Professional Services",
  "Consumer Goods",
  "Industrial Equipment",
  "Financial Products",
  "Digital Content",
  "Subscription",
  "Physical Product",
  "SaaS Platform",
  "Mobile App",
  "Marketplace Service",
] as const;

export const DEMOGRAPHIC_CRITERIA = {
  AGE_RANGES: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
  LOCATIONS: ["Global", "North America", "Europe", "Asia", "South America", "Africa", "Oceania", "Local"],
  INCOME_BRACKETS: ["Entry", "Mid-Level", "High-Net-Worth", "Ultra-High-Net-Worth", "Mass-Market"],
} as const;
