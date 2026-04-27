/**
 * PROFILE VALIDATION UTILITIES
 * Logic to ensure accuracy and completeness of company profile inputs.
 */

import { BUSINESS_MODELS, INDUSTRIES, PRODUCT_CATEGORIES } from "./profile-constants";

/**
 * Validates a website URL format.
 * Must be HTTPS and have a valid domain structure.
 */
export function validateWebsite(url: string | null | undefined): { valid: boolean; error?: string } {
  if (!url) return { valid: true }; // Optional field
  
  const httpsRegex = /^https:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/.*)?$/;
  if (!httpsRegex.test(url)) {
    return { valid: false, error: "Website must be a valid HTTPS URL (e.g., https://www.example.com)" };
  }
  
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL structure" };
  }
}

/**
 * Validates business model type.
 */
export function validateBusinessModel(model: string | null | undefined): { valid: boolean; error?: string } {
  if (!model) return { valid: true };
  
  if (!BUSINESS_MODELS.includes(model as any)) {
    return { valid: false, error: `Invalid business model. Allowed: ${BUSINESS_MODELS.join(", ")}` };
  }
  
  return { valid: true };
}

/**
 * Validates industry classification.
 */
export function validateIndustry(industry: string | null | undefined): { valid: boolean; error?: string } {
  if (!industry) return { valid: true };
  
  if (!INDUSTRIES.includes(industry as any)) {
    return { valid: false, error: `Invalid industry. Please select from the predefined list.` };
  }
  
  return { valid: true };
}

/**
 * Validates product categories.
 */
export function validateProductCategories(categories: string[] | null | undefined): { valid: boolean; error?: string } {
  if (!categories || categories.length === 0) return { valid: true };
  
  const invalid = categories.filter(c => !PRODUCT_CATEGORIES.includes(c as any));
  if (invalid.length > 0) {
    return { valid: false, error: `Invalid product categories: ${invalid.join(", ")}` };
  }
  
  return { valid: true };
}

/**
 * Validates target customer demographics.
 */
export function validateDemographics(data: any): { valid: boolean; error?: string } {
  if (!data || Object.keys(data).length === 0) return { valid: true };
  
  // Basic integrity check for the demographics object
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: "Demographics must be a structured object" };
  }
  
  // Check for common keys if present
  if (data.ageRange && typeof data.ageRange !== 'string') return { valid: false, error: "Invalid ageRange format" };
  if (data.location && typeof data.location !== 'string') return { valid: false, error: "Invalid location format" };
  
  return { valid: true };
}

/**
 * Validates competitor data integrity.
 */
export function validateCompetitors(competitors: any[] | null | undefined): { valid: boolean; error?: string } {
  if (!competitors || !Array.isArray(competitors) || competitors.length === 0) return { valid: true };
  
  for (const comp of competitors) {
    if (!comp.name || typeof comp.name !== 'string') {
      return { valid: false, error: "Each competitor must have a valid name" };
    }
    if (comp.website) {
      const v = validateWebsite(comp.website);
      if (!v.valid) return { valid: false, error: `Competitor ${comp.name}: ${v.error}` };
    }
  }
  
  return { valid: true };
}

/**
 * Comprehensive profile validation runner.
 */
export function validateCompanyProfile(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const websiteV = validateWebsite(data.website);
  if (!websiteV.valid) errors.push(websiteV.error!);
  
  const modelV = validateBusinessModel(data.businessModel);
  if (!modelV.valid) errors.push(modelV.error!);
  
  const industryV = validateIndustry(data.industry);
  if (!industryV.valid) errors.push(industryV.error!);
  
  const categoryV = validateProductCategories(data.productCategories);
  if (!categoryV.valid) errors.push(categoryV.error!);
  
  const demoV = validateDemographics(data.demographics);
  if (!demoV.valid) errors.push(demoV.error!);
  
  const compV = validateCompetitors(data.competitors);
  if (!compV.valid) errors.push(compV.error!);
  
  return {
    valid: errors.length === 0,
    errors
  };
}
