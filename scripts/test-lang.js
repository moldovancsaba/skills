const { isLanguageAccepted } = require("./lib/language-validator");

const testCases = [
  { text: "This is a valid english sentence.", allowed: ["english"], expected: true },
  { text: "Ez egy érvényes magyar mondat.", allowed: ["english"], expected: false },
  { text: "Ez egy érvényes magyar mondat.", allowed: ["english", "hungarian"], expected: true },
  { text: "Technical documentation for API endpoint /v1/users.", allowed: ["english"], expected: true },
  { text: "Short text.", allowed: ["english"], expected: true }, // Low confidence should be true
];

async function runTests() {
  console.log("Running Language Validator Tests...");
  let passed = 0;
  for (const tc of testCases) {
    const result = isLanguageAccepted(tc.text, tc.allowed);
    if (result === tc.expected) {
      console.log(`✅ PASS: "${tc.text.substring(0, 30)}..." -> ${result}`);
      passed++;
    } else {
      console.error(`❌ FAIL: "${tc.text.substring(0, 30)}..." -> Expected ${tc.expected}, got ${result}`);
    }
  }
  console.log(`\nTests complete: ${passed}/${testCases.length} passed.`);
}

runTests();
