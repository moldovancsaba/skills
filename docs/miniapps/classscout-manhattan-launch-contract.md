# ClassScout Manhattan Launch Contract

This is the Checklist-side runtime contract for the ClassScout Manhattan MVP launch.

## Scope

- Miniapp contract: `classscout.visitor.sovereign@v1`
- Visitor taxonomy version: `classscout-manhattan-launch@v1`
- Launch geography: Manhattan
- Public content categories: Classes, Camps, Birthday Parties, Drop-In Activities, Family Events, Meetup Groups, Arts, STEM, Music, Sports, Dance, Theater, Martial Arts, Swimming, Tutoring, Language, and Provider Profiles.

## Runtime Flow

1. Research planning resolves the ClassScout sovereign contract from `src/lib/miniapp-intelligence-contracts.ts`.
2. Visitor candidate extraction resolves the active ClassScout visitor blueprint and taxonomy from destination config.
3. If destination config has no ClassScout visitor taxonomy, `src/lib/visitor-blueprints.ts` supplies the default Manhattan launch taxonomy.
4. `evaluateVisitorQualityGate` validates the candidate content type, forbidden mappings, required public profile evidence, public scope, uploaded public image, and public copy quality.
5. ClassScout launch candidates with missing profile evidence are blocked with `missing_launch_profile_evidence` and remain review-visible through `missing_required_evidence`.

## Provider Profile Contract

Every launch-eligible public profile must provide:

- `name`
- `category`
- `borough`
- `neighborhood`
- `ageRanges`
- `programType`
- `shortDescription`
- `website`
- `image`
- `sourceUrl`

The gate accepts these fields from extracted facts, metadata, or `publicDraftPayload`. Public images must use an uploaded HTTPS ImgBB URL.

## Operational Behavior

- Source-only records are never public eligible.
- Adult-only, admissions-only, daycare-only, travel-guide, and source-only signals block candidates.
- Official provider pages remain preferred through the sovereign research policy.
- Missing launch evidence blocks publication instead of silently creating thin cards.
- Operators can override the default taxonomy by saving a destination-scoped visitor taxonomy through the visitor taxonomy API.

## Rollback

Rollback is configuration-first:

1. Save a destination-scoped ClassScout taxonomy with the previous content type and required evidence policy.
2. If code rollback is required, revert the ClassScout block in `src/lib/miniapp-intelligence-contracts.ts`, remove the ClassScout default helpers in `src/lib/visitor-blueprints.ts`, and restore the prior missing-evidence behavior in `src/lib/visitor-quality-gate.ts`.
3. Re-run the launch contract and miniapp contract tests before enabling promotion.

## Verification

Run:

```bash
npm run test:classscout-manhattan-launch
npm run test:sovereign-miniapp-contract
npm run test:miniapp-health
```

