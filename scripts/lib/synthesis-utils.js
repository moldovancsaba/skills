/**
 * SOVEREIGN SYNTHESIS UTILITIES
 * v0.11.4-STABLE
 * 
 * Provides robust JSON normalization for AI-generated payloads.
 * Handles cases where models wrap arrays or objects in named keys (e.g., { "cards": [...] }).
 */

/**
 * Ensures the returned data is a flat array of objects.
 * If the input is an object containing an array, it extracts it.
 * 
 * @param {any} data - Raw parsed JSON from AI
 * @returns {object[]} Normalized array
 */
function unifyArray(data) {
  if (Array.isArray(data)) return data;
  if (typeof data !== "object" || data === null) return [];

  // Look for common wrapper names used by different languages/models
  const commonKeys = ["cards", "items", "flashcards", "tasks", "nba", "item", "kartyak", "feladatok"];
  for (const key of commonKeys) {
    if (Array.isArray(data[key])) return data[key];
  }

  // Fallback: Find the first property that is an array
  const firstArray = Object.values(data).find(v => Array.isArray(v));
  if (firstArray) return firstArray;

  // Final fallback: wrap the object itself if it looks like a card
  if (data.title || data.body || data.description) return [data];

  return [];
}

/**
 * Ensures the returned data is a single object.
 * If the input is an array, it takes the first element.
 * 
 * @param {any} data - Raw parsed JSON from AI
 * @returns {object|null} Normalized object
 */
function unifyObject(data) {
  if (Array.isArray(data)) return data[0] || null;
  if (typeof data !== "object" || data === null) return null;

  // If it's a wrapped object (e.g., { "card": { ... } })
  const commonKeys = ["card", "item", "flashcard", "task", "nba"];
  for (const key of commonKeys) {
    if (data[key] && typeof data[key] === "object" && !Array.isArray(data[key])) {
      return data[key];
    }
  }

  // If the object itself has card properties, return it
  if (data.title || data.body || data.description || data.decision) return data;

  // Fallback: take the first non-array object
  const firstObj = Object.values(data).find(v => typeof v === "object" && v !== null && !Array.isArray(v));
  if (firstObj) return firstObj;

  return data;
}

module.exports = {
  unifyArray,
  unifyObject
};
