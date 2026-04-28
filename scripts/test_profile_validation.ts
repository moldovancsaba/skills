/**
 * VERIFICATION SCRIPT: Company Profile Validation
 * Tests the validation logic against various edge cases.
 */

const { validateCompanyProfile } = require('../src/lib/profile-validation');

const testCases = [
  {
    name: "Valid Profile",
    data: {
      website: "https://www.checklistsquad.ai",
      businessModel: "SaaS",
      industry: "Technology",
      productCategories: ["Software"],
      demographics: { ageRange: "25-34", location: "Global" },
      competitors: [{ name: "Competitor A", website: "https://competitor.com" }]
    },
    expected: true
  },
  {
    name: "Invalid Website (HTTP)",
    data: { website: "http://example.com" },
    expected: false
  },
  {
    name: "Invalid Business Model",
    data: { businessModel: "NonExistentModel" },
    expected: false
  },
  {
    name: "Invalid Industry",
    data: { industry: "Magic" },
    expected: false
  },
  {
    name: "Invalid Competitor URL",
    data: { 
      competitors: [{ name: "Bad URL Corp", website: "not-a-url" }] 
    },
    expected: false
  }
];

console.log("Starting Profile Validation Tests...\n");

testCases.forEach((tc, i) => {
  const result = validateCompanyProfile(tc.data);
  const passed = result.valid === tc.expected;
  
  console.log(`Test #${i + 1}: ${tc.name}`);
  console.log(`  Result: ${result.valid ? "VALID" : "INVALID"}`);
  if (!result.valid) console.log(`  Errors: ${result.errors.join(", ")}`);
  console.log(`  Status: ${passed ? "✅ PASSED" : "❌ FAILED"}\n`);
});

if (testCases.every(tc => validateCompanyProfile(tc.data).valid === tc.expected)) {
  console.log("All validation tests passed!");
} else {
  console.log("Some tests failed.");
  process.exit(1);
}
