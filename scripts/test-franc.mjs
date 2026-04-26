import { francAll } from 'franc-min';

const samples = [
  "This is a pure English sentence about marketing strategy.",
  "Ez egy teljesen tiszta magyar mondat a marketing stratégiáról.",
  "This is a mixed English sentence, de a fele magyarul van írva hogy teszteljük.",
  "La casa es muy grande y bonita."
];

for (const text of samples) {
  console.log(`\nText: "${text}"`);
  console.log("Detected:", francAll(text).slice(0, 3));
}
