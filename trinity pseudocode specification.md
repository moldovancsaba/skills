trinity pseudocode specification
vNext — executable logic blueprint

## 1. purpose

this document defines the pseudocode-level behavior of the candidate processing system.

it is not implementation syntax for a specific language.
it is the operational contract the implementation MUST satisfy.

the objective is to make the Trinity:
- implementable
- testable
- auditable
- non-delusional

---

## 2. top-level control loop

```text
LOOP forever:

  companies = select_companies_for_cycle()

  FOR company IN companies:

    IF NOT acquire_company_lock(company):
      CONTINUE

    TRY:
      run_company_cycle(company)
    FINALLY:
      release_company_lock(company)

  sleep(global_poll_interval)
```

### 2.1 required properties
- company execution MUST be mutually exclusive
- company cycles MUST be idempotent where possible
- all writes MUST be tenant-bound
- all writes SHOULD carry `cycleRunId`

---

## 3. company cycle

```text
FUNCTION run_company_cycle(company):

  cycleRunId = new_uuid()
  context = build_company_context(company)
  memory = load_feedback_memory(company)

  ingest_new_evidence(company, cycleRunId)
  process_knowledge_pipeline(company, context, memory, cycleRunId)
  process_action_pipeline(company, context, memory, cycleRunId)
  run_maintenance(company, context, memory, cycleRunId)
  recompute_frontier(company, cycleRunId)
```

### 3.1 company context
`build_company_context(company)` MUST load:
- strategic priorities
- topic inventory
- active knowledge items
- active action items
- recent feedback summaries
- language and policy constraints
- time/freshness settings

---

## 4. evidence ingestion pseudocode

```text
FUNCTION ingest_new_evidence(company, cycleRunId):

  incoming = collect_evidence(company)

  FOR rawEvidence IN incoming:

    canonical = canonicalize(rawEvidence.content)
    hash = hash_canonical(canonical)

    IF evidence_exists(company.id, hash):
      CONTINUE

    evidence = EvidenceUnit(
      evidenceId = new_uuid(),
      companyId = company.id,
      sourceType = rawEvidence.sourceType,
      sourceRef = rawEvidence.sourceRef,
      contentRaw = rawEvidence.content,
      contentCanonical = canonical,
      contentHash = hash,
      metadata = rawEvidence.metadata,
      topicHints = infer_topic_hints(rawEvidence),
      createdAt = now(),
      updatedAt = now(),
      freshnessWindow = compute_freshness_window(rawEvidence),
      provenance = rawEvidence.provenance
    )

    save_evidence(evidence, cycleRunId)
```

### 4.1 canonicalization rules
`canonicalize()` MUST:
- strip markup/noise
- normalize whitespace
- preserve meaningful text order
- produce stable output for hashing and evidence comparison

---

## 5. knowledge pipeline

```text
FUNCTION process_knowledge_pipeline(company, context, memory, cycleRunId):

  evidenceBatch = select_evidence_for_generation(company)

  generatedSet = run_generator_for_knowledge(
    company,
    evidenceBatch,
    context,
    memory
  )

  refinedSet = run_refiner_for_knowledge(
    company,
    generatedSet,
    context,
    memory
  )

  evaluatedSet = run_evaluator_for_knowledge(
    company,
    refinedSet,
    context,
    memory
  )

  persist_knowledge_evaluation_results(
    company,
    generatedSet,
    refinedSet,
    evaluatedSet,
    cycleRunId
  )
```

---

## 6. action pipeline

```text
FUNCTION process_action_pipeline(company, context, memory, cycleRunId):

  sourceKnowledge = select_knowledge_for_action_generation(company)

  generatedSet = run_generator_for_actions(
    company,
    sourceKnowledge,
    context,
    memory
  )

  refinedSet = run_refiner_for_actions(
    company,
    generatedSet,
    context,
    memory
  )

  evaluatedSet = run_evaluator_for_actions(
    company,
    refinedSet,
    context,
    memory
  )

  persist_action_evaluation_results(
    company,
    generatedSet,
    refinedSet,
    evaluatedSet,
    cycleRunId
  )
```

---

## 7. generator pseudocode

## 7.1 knowledge generator

```text
FUNCTION run_generator_for_knowledge(company, evidenceBatch, context, memory):

  candidateSet = empty_set()

  evidenceGroups = build_generation_groups(evidenceBatch, context)

  FOR group IN evidenceGroups:

    generationInput = {
      companyContext: context,
      memoryConstraints: memory,
      evidenceGroup: group,
      activeKnowledgeNeighborhood: load_active_knowledge_neighborhood(company, group),
      activeActionNeighborhood: load_active_action_neighborhood(company, group)
    }

    rawCandidates = model_generate_knowledge_candidates(generationInput)

    normalizedCandidates = normalize_generated_knowledge_candidates(rawCandidates, group)

    FOR candidate IN normalizedCandidates:
      candidate.state = GENERATED
      candidate.iceScore = candidate.impact * candidate.confidence * candidate.ease
      candidateSet.add(candidate)

  RETURN candidateSet
```

## 7.2 action generator

```text
FUNCTION run_generator_for_actions(company, sourceKnowledge, context, memory):

  candidateSet = empty_set()

  knowledgeGroups = build_action_generation_groups(sourceKnowledge, context)

  FOR group IN knowledgeGroups:

    generationMode = determine_action_cardinality_mode(group)

    generationInput = {
      companyContext: context,
      memoryConstraints: memory,
      sourceKnowledgeGroup: group,
      generationMode: generationMode,
      activeActionNeighborhood: load_active_action_neighborhood(company, group)
    }

    rawCandidates = model_generate_action_candidates(generationInput)

    normalizedCandidates = normalize_generated_action_candidates(rawCandidates, group)

    FOR candidate IN normalizedCandidates:
      candidate.state = GENERATED
      candidate.iceScore = candidate.impact * candidate.confidence * candidate.ease
      candidateSet.add(candidate)

  RETURN candidateSet
```

---

## 8. grouping logic

## 8.1 evidence grouping

```text
FUNCTION build_generation_groups(evidenceBatch, context):

  groups = []

  singletons = make_single_evidence_groups(evidenceBatch)
  clusters = cluster_related_evidence(evidenceBatch, context)

  groups.add_all(singletons)
  groups.add_all(clusters)

  groups = deduplicate_equivalent_groups(groups)

  RETURN groups
```

## 8.2 action grouping

```text
FUNCTION build_action_generation_groups(sourceKnowledge, context):

  groups = []

  singletons = make_single_knowledge_groups(sourceKnowledge)
  clusters = cluster_related_knowledge(sourceKnowledge, context)

  groups.add_all(singletons)
  groups.add_all(clusters)

  groups = deduplicate_equivalent_groups(groups)

  RETURN groups
```

## 8.3 cardinality mode determination

```text
FUNCTION determine_action_cardinality_mode(group):

  IF size(group) == 1 AND expected_action_count(group) == 1:
    RETURN "ONE_FROM_ONE"

  IF size(group) == 1 AND expected_action_count(group) > 1:
    RETURN "MANY_FROM_ONE"

  IF size(group) > 1 AND expected_action_count(group) == 1:
    RETURN "ONE_FROM_MANY"

  RETURN "MANY_FROM_MANY"
```

---

## 9. normalization pseudocode

## 9.1 knowledge candidate normalization

```text
FUNCTION normalize_generated_knowledge_candidates(rawCandidates, evidenceGroup):

  normalized = []

  FOR raw IN rawCandidates:

    IF is_empty(raw.title) OR is_empty(raw.body):
      CONTINUE

    candidate = KnowledgeItem(
      knowledgeItemId = new_uuid(),
      companyId = evidenceGroup.companyId,
      title = normalize_title(raw.title),
      body = normalize_body(raw.body),
      sourceRefs = collect_source_refs(evidenceGroup),
      state = GENERATED,
      impact = clamp_int(raw.impact, 1, 10),
      confidence = clamp_int(raw.confidence, 1, 10),
      ease = clamp_int(raw.ease, 1, 10),
      qualityScore = null,
      urgencyScore = initial_urgency_estimate(raw, evidenceGroup),
      freshnessScore = initial_freshness_estimate(evidenceGroup),
      feedbackScore = 0,
      semanticTags = normalize_tags(raw.tags),
      versionFamilyId = new_uuid(),
      duplicateClusterId = null,
      createdAt = now(),
      updatedAt = now(),
      lastPresentedAt = null,
      lastFeedbackAt = null,
      lastReworkedAt = null,
      rottenAt = estimate_rotten_at(raw, evidenceGroup)
    )

    normalized.add(candidate)

  RETURN normalized
```

## 9.2 action candidate normalization

```text
FUNCTION normalize_generated_action_candidates(rawCandidates, knowledgeGroup):

  normalized = []

  FOR raw IN rawCandidates:

    IF is_empty(raw.title) OR is_empty(raw.description):
      CONTINUE

    candidate = ActionItem(
      actionItemId = new_uuid(),
      companyId = knowledgeGroup.companyId,
      title = normalize_title(raw.title),
      description = normalize_body(raw.description),
      sourceKnowledgeItemIds = collect_knowledge_ids(knowledgeGroup),
      state = GENERATED,
      impact = clamp_int(raw.impact, 1, 10),
      confidence = clamp_int(raw.confidence, 1, 10),
      ease = clamp_int(raw.ease, 1, 10),
      qualityScore = null,
      urgencyScore = initial_urgency_estimate(raw, knowledgeGroup),
      freshnessScore = initial_freshness_estimate(knowledgeGroup),
      feedbackScore = 0,
      versionFamilyId = new_uuid(),
      duplicateClusterId = null,
      createdAt = now(),
      updatedAt = now(),
      lastPresentedAt = null,
      lastFeedbackAt = null,
      lastDeliveredAt = null,
      lastReworkedAt = null,
      rottenAt = estimate_rotten_at(raw, knowledgeGroup)
    )

    normalized.add(candidate)

  RETURN normalized
```

---

## 10. refiner pseudocode

## 10.1 knowledge refiner

```text
FUNCTION run_refiner_for_knowledge(company, generatedSet, context, memory):

  neighborhoods = build_candidate_neighborhoods(generatedSet, company, "KNOWLEDGE")
  refinedSet = empty_set()

  FOR neighborhood IN neighborhoods:

    operation = choose_refinement_operation(neighborhood, context, memory)

    IF operation == "SUPPRESS_WEAK":
      champion = select_champion(neighborhood)
      refinedChampion = refine_single_candidate(champion, context, memory)
      refinedSet.add(mark_refined(refinedChampion))
      mark_suppressed(all_others(neighborhood, champion))
      CONTINUE

    IF operation == "MERGE":
      merged = merge_candidates(neighborhood, context, memory)
      refinedSet.add(mark_refined(merged))
      mark_suppressed(all_members(neighborhood))
      CONTINUE

    IF operation == "SPLIT":
      source = select_split_source(neighborhood)
      splitOutputs = split_candidate(source, context, memory)
      FOR item IN splitOutputs:
        refinedSet.add(mark_refined(item))
      mark_suppressed([source])
      CONTINUE

    IF operation == "ENRICH":
      source = select_champion(neighborhood)
      enriched = enrich_candidate(source, context, memory)
      refinedSet.add(mark_refined(enriched))
      mark_suppressed(all_others(neighborhood, source))
      CONTINUE

    source = select_champion(neighborhood)
    refined = refine_single_candidate(source, context, memory)
    refinedSet.add(mark_refined(refined))
    mark_suppressed(all_others(neighborhood, source))

  RETURN refinedSet
```

## 10.2 action refiner

```text
FUNCTION run_refiner_for_actions(company, generatedSet, context, memory):

  neighborhoods = build_candidate_neighborhoods(generatedSet, company, "ACTION")
  refinedSet = empty_set()

  FOR neighborhood IN neighborhoods:

    operation = choose_refinement_operation(neighborhood, context, memory)

    SWITCH operation:

      CASE "MERGE":
        merged = merge_action_candidates(neighborhood, context, memory)
        refinedSet.add(mark_refined(merged))
        mark_suppressed(all_members(neighborhood))

      CASE "SPLIT":
        source = select_split_source(neighborhood)
        outputs = split_action_candidate(source, context, memory)
        FOR item IN outputs:
          refinedSet.add(mark_refined(item))
        mark_suppressed([source])

      CASE "ENRICH":
        source = select_champion(neighborhood)
        enriched = enrich_action_candidate(source, context, memory)
        refinedSet.add(mark_refined(enriched))
        mark_suppressed(all_others(neighborhood, source))

      CASE "SUPPRESS_WEAK":
        champion = select_champion(neighborhood)
        refinedSet.add(mark_refined(refine_single_action(champion, context, memory)))
        mark_suppressed(all_others(neighborhood, champion))

      DEFAULT:
        source = select_champion(neighborhood)
        refinedSet.add(mark_refined(refine_single_action(source, context, memory)))
        mark_suppressed(all_others(neighborhood, source))

  RETURN refinedSet
```

---

## 11. refinement operation choice

```text
FUNCTION choose_refinement_operation(neighborhood, context, memory):

  IF neighborhood_is_exact_duplicate(neighborhood):
    RETURN "SUPPRESS_WEAK"

  IF neighborhood_has_high_semantic_overlap(neighborhood) AND merge_preserves_value(neighborhood):
    RETURN "MERGE"

  IF champion_is_overloaded(neighborhood):
    RETURN "SPLIT"

  IF champion_is_promising_but_underspecified(neighborhood):
    RETURN "ENRICH"

  RETURN "REFINE_AS_IS"
```

### 11.1 mandatory rule
the Refiner MUST NOT leave obvious duplicates unresolved.

---

## 12. evaluator pseudocode

## 12.1 knowledge evaluator

```text
FUNCTION run_evaluator_for_knowledge(company, refinedSet, context, memory):

  evaluatedSet = empty_set()
  comparisonPool = build_relative_comparison_pool(company, refinedSet, "KNOWLEDGE")

  FOR candidate IN refinedSet:

    evaluation = evaluate_knowledge_candidate(candidate, comparisonPool, context, memory)

    candidate.impact = evaluation.impact
    candidate.confidence = evaluation.confidence
    candidate.ease = evaluation.ease
    candidate.iceScore = candidate.impact * candidate.confidence * candidate.ease
    candidate.qualityScore = evaluation.qualityScore
    candidate.urgencyScore = evaluation.urgencyScore
    candidate.freshnessScore = evaluation.freshnessScore
    candidate.feedbackScore = compute_feedback_score(candidate)

    candidate.evaluationReason = evaluation.reason
    candidate.evaluatedAt = now()

    IF evaluation.disposition == "ELIGIBLE":
      candidate.state = EVALUATED
      evaluatedSet.add(candidate)
      CONTINUE

    IF evaluation.disposition == "REVISE":
      candidate.state = REWORK
      queue_rework(candidate, "REVISE")
      evaluatedSet.add(candidate)
      CONTINUE

    IF evaluation.disposition == "REGENERATE":
      candidate.state = REWORK
      queue_rework(candidate, "REGENERATE")
      evaluatedSet.add(candidate)
      CONTINUE

    IF evaluation.disposition == "MERGE":
      candidate.state = REWORK
      queue_rework(candidate, "MERGE")
      evaluatedSet.add(candidate)
      CONTINUE

    IF evaluation.disposition == "SUPPRESS":
      candidate.state = SUPPRESSED
      evaluatedSet.add(candidate)
      CONTINUE

    candidate.state = ARCHIVED
    evaluatedSet.add(candidate)

  RETURN evaluatedSet
```

## 12.2 action evaluator

```text
FUNCTION run_evaluator_for_actions(company, refinedSet, context, memory):

  evaluatedSet = empty_set()
  comparisonPool = build_relative_comparison_pool(company, refinedSet, "ACTION")

  FOR candidate IN refinedSet:

    evaluation = evaluate_action_candidate(candidate, comparisonPool, context, memory)

    candidate.impact = evaluation.impact
    candidate.confidence = evaluation.confidence
    candidate.ease = evaluation.ease
    candidate.iceScore = candidate.impact * candidate.confidence * candidate.ease
    candidate.qualityScore = evaluation.qualityScore
    candidate.urgencyScore = evaluation.urgencyScore
    candidate.freshnessScore = evaluation.freshnessScore
    candidate.feedbackScore = compute_feedback_score(candidate)

    candidate.evaluationReason = evaluation.reason
    candidate.evaluatedAt = now()

    SWITCH evaluation.disposition:

      CASE "ELIGIBLE":
        candidate.state = EVALUATED

      CASE "REVISE":
        candidate.state = REWORK
        queue_rework(candidate, "REVISE")

      CASE "REGENERATE":
        candidate.state = REWORK
        queue_rework(candidate, "REGENERATE")

      CASE "MERGE":
        candidate.state = REWORK
        queue_rework(candidate, "MERGE")

      CASE "SUPPRESS":
        candidate.state = SUPPRESSED

      DEFAULT:
        candidate.state = ARCHIVED

    evaluatedSet.add(candidate)

  RETURN evaluatedSet
```

---

## 13. evaluation scoring pseudocode

```text
FUNCTION evaluate_knowledge_candidate(candidate, comparisonPool, context, memory):

  support = score_support(candidate)
  novelty = score_novelty(candidate, comparisonPool)
  usefulness = score_usefulness(candidate, context)
  actionability = score_actionability(candidate)
  freshness = score_freshness(candidate)
  urgency = score_urgency(candidate, context)
  duplicationPenalty = score_duplication_penalty(candidate, comparisonPool)
  policyPenalty = score_policy_penalty(candidate, memory, context)

  qualityScore =
    weighted_sum(
      support,
      novelty,
      usefulness,
      actionability,
      freshness,
      urgency
    )
    - duplicationPenalty
    - policyPenalty

  normalizedImpact = normalize_impact(candidate, usefulness, urgency)
  normalizedConfidence = normalize_confidence(candidate, support, novelty)
  normalizedEase = normalize_ease(candidate, actionability)

  disposition = decide_disposition(
    qualityScore,
    support,
    duplicationPenalty,
    policyPenalty,
    supply_state(candidate.companyId)
  )

  RETURN {
    disposition: disposition,
    impact: normalizedImpact,
    confidence: normalizedConfidence,
    ease: normalizedEase,
    qualityScore: clamp_real(qualityScore, 0, 100),
    urgencyScore: clamp_real(urgency, 0, 100),
    freshnessScore: clamp_real(freshness, 0, 100),
    reason: build_evaluation_reason(...)
  }
```

### 13.1 disposition decision

```text
FUNCTION decide_disposition(qualityScore, support, duplicationPenalty, policyPenalty, supplyState):

  IF duplicationPenalty is extreme:
    RETURN "SUPPRESS"

  IF policyPenalty is fatal:
    RETURN "ARCHIVE"

  IF qualityScore >= ELIGIBLE_THRESHOLD:
    RETURN "ELIGIBLE"

  IF qualityScore >= REVISE_THRESHOLD:
    RETURN "REVISE"

  IF support is low BUT candidate premise is promising:
    RETURN "REGENERATE"

  IF supplyState is starving AND qualityScore >= FALLBACK_THRESHOLD:
    RETURN "ELIGIBLE"

  RETURN "ARCHIVE"
```

the `supplyState is starving` exception is mandatory if you want a usable system and not a beautifully empty one.

---

## 14. persistence pseudocode

```text
FUNCTION persist_knowledge_evaluation_results(company, generatedSet, refinedSet, evaluatedSet, cycleRunId):

  BEGIN TRANSACTION

    save_generated_knowledge_items(generatedSet, cycleRunId)
    save_refined_knowledge_items(refinedSet, cycleRunId)
    save_evaluated_knowledge_items(evaluatedSet, cycleRunId)
    save_lineage_links(generatedSet, refinedSet, evaluatedSet, cycleRunId)
    save_suppression_and_merge_events(evaluatedSet, cycleRunId)

  COMMIT
```

```text
FUNCTION persist_action_evaluation_results(company, generatedSet, refinedSet, evaluatedSet, cycleRunId):

  BEGIN TRANSACTION

    save_generated_action_items(generatedSet, cycleRunId)
    save_refined_action_items(refinedSet, cycleRunId)
    save_evaluated_action_items(evaluatedSet, cycleRunId)
    save_lineage_links(generatedSet, refinedSet, evaluatedSet, cycleRunId)
    save_suppression_and_merge_events(evaluatedSet, cycleRunId)

  COMMIT
```

all persistence MUST preserve lineage.

---

## 15. frontier selector pseudocode

```text
FUNCTION recompute_frontier(company, cycleRunId):

  eligible = load_frontier_eligible_items(company)

  collapsed = collapse_duplicate_clusters(eligible)
  active = remove_ineligible_states(collapsed)
  freshEnough = apply_rot_filter(active)

  FOR item IN freshEnough:
    item.frontierScore = compute_frontier_score(item, company)

  ranked = sort_descending(freshEnough, by = frontierScore)

  frontier = first_k(ranked, 3)

  save_frontier(company, frontier, cycleRunId)
```

## 15.1 frontier eligibility

```text
FUNCTION load_frontier_eligible_items(company):

  primary = query_items(company, state = EVALUATED)
  fallbackRefined = query_items(company, state = REFINED)
  fallbackGenerated = query_items(company, state = GENERATED)

  IF count(primary) >= 3:
    RETURN primary

  combined = primary + fallbackRefined

  IF count(combined) >= 3:
    RETURN combined

  RETURN combined + fallbackGenerated
```

## 15.2 frontier scoring

```text
FUNCTION compute_frontier_score(item, company):

  stateWeight =
    IF item.state == EVALUATED THEN 1.00
    ELSE IF item.state == REFINED THEN 0.72
    ELSE 0.45

  qualityWeight = normalize_0_1(item.qualityScore)
  urgencyWeight = normalize_0_1(item.urgencyScore)
  freshnessWeight = normalize_0_1(item.freshnessScore)
  feedbackWeight = normalize_feedback_weight(item.feedbackScore)
  priorityWeight = strategic_priority_weight(item, company)

  RETURN
    stateWeight
    * qualityWeight
    * urgencyWeight
    * freshnessWeight
    * feedbackWeight
    * priorityWeight
```

---

## 16. human feedback pseudocode

```text
FUNCTION record_feedback(itemId, itemType, action, comment, payload):

  event = FeedbackEvent(
    feedbackEventId = new_uuid(),
    itemId = itemId,
    itemType = itemType,
    action = action,
    comment = comment,
    payload = payload,
    createdAt = now()
  )

  save_feedback_event(event)
  apply_feedback_to_item_state(event)
  enqueue_memory_update(event)
  enqueue_rerank(itemId)
  enqueue_rework_if_needed(event)
```

## 16.1 feedback-to-state logic

```text
FUNCTION apply_feedback_to_item_state(event):

  item = load_item(event.itemId, event.itemType)

  item.lastFeedbackAt = now()
  item.feedbackScore = recompute_feedback_score(item, event)

  SWITCH event.action:

    CASE "ACCEPT":
      mark_positive_feedback(item)

    CASE "DECLINE":
      declineClass = classify_decline(event.comment, event.payload)
      item.state = REWORK if decline_is_recoverable(declineClass) else SUPPRESSED
      attach_decline_metadata(item, declineClass)

    CASE "COMMENT":
      attach_comment(item, event.comment)

    CASE "MODIFY_ACCEPT":
      mark_positive_feedback(item)
      queue_rework(item, "ALIGN_TO_USER_CORRECTION")

    CASE "DELIVER":
      item.state = DELIVERED
      item.lastDeliveredAt = now()
      mark_strong_positive_feedback(item)

    CASE "POSTPONE":
      reduce_urgency_temporarily(item)

    CASE "SUPPRESS":
      item.state = SUPPRESSED

    CASE "REWORK_REQUEST":
      item.state = REWORK
      queue_rework(item, "EXPLICIT_USER_REQUEST")

  save_item(item)
```

---

## 17. memory update pseudocode

```text
FUNCTION process_memory_updates(company):

  events = load_unprocessed_feedback_events(company)

  FOR event IN events:

    scope = determine_memory_scope(event)
    lesson = distill_feedback_lesson(event)

    IF lesson is not null:
      upsert_memory_entry(company, scope, lesson)

    mark_feedback_event_processed(event)
```

## 17.1 lesson distillation

```text
FUNCTION distill_feedback_lesson(event):

  IF event.action == "DECLINE":
    RETURN build_negative_lesson(event)

  IF event.action == "MODIFY_ACCEPT":
    RETURN build_corrective_lesson(event)

  IF event.action == "DELIVER":
    RETURN build_operational_success_lesson(event)

  IF event.action == "ACCEPT":
    RETURN build_positive_pattern_lesson(event)

  IF event.action == "COMMENT":
    RETURN build_directional_lesson(event)

  RETURN null
```

feedback that cannot be distilled into future behavior change has low system value.

---

## 18. maintenance pseudocode

```text
FUNCTION run_maintenance(company, context, memory, cycleRunId):

  reconcile_duplicate_clusters(company)
  revisit_oldest_modified_candidates(company, context, memory)
  revisit_declined_high_potential_candidates(company, context, memory)
  revisit_stale_refined_candidates(company, context, memory)
  archive_hopeless_rotten_candidates(company)
  process_memory_updates(company)
```

## 18.1 oldest modified candidates

```text
FUNCTION revisit_oldest_modified_candidates(company, context, memory):

  candidates = load_oldest_modified_candidates(company)

  FOR candidate IN candidates:

    IF candidate.state == DELIVERED OR candidate.state == ARCHIVED:
      CONTINUE

    IF candidate_has_unresolved_user_correction(candidate):
      queue_rework(candidate, "OLD_MODIFIED_UNRESOLVED")
```

## 18.2 declined rework candidates

```text
FUNCTION revisit_declined_high_potential_candidates(company, context, memory):

  declined = load_declined_candidates(company)

  FOR candidate IN declined:

    IF candidate_is_hopeless(candidate):
      CONTINUE

    IF candidate_has_informative_decline(candidate):
      queue_rework(candidate, "DECLINE_INFORMED_REWORK")
```

---

## 19. rot handling pseudocode

```text
FUNCTION apply_rot_filter(items):

  result = []

  FOR item IN items:

    IF now() >= item.rottenAt:
      item = handle_rotten_item(item)

    IF item.state NOT IN [ARCHIVED, SUPPRESSED]:
      result.add(item)

  RETURN result
```

```text
FUNCTION handle_rotten_item(item):

  IF item_can_be_reworked(item):
    item.state = REWORK
    queue_rework(item, "ROT_RECOVERY")
    RETURN item

  item.state = ARCHIVED
  save_item(item)
  RETURN item
```

---

## 20. duplicate cluster pseudocode

```text
FUNCTION reconcile_duplicate_clusters(company):

  activeItems = load_active_candidates(company)
  clusters = build_semantic_duplicate_clusters(activeItems)

  FOR cluster IN clusters:

    IF size(cluster) <= 1:
      CONTINUE

    champion = select_cluster_champion(cluster)

    FOR item IN cluster:
      item.duplicateClusterId = cluster.id
      save_item(item)

    FOR item IN cluster:
      IF item.id != champion.id:
        suppress_or_merge(item, champion)
```

---

## 21. selection functions

## 21.1 evidence selection

```text
FUNCTION select_evidence_for_generation(company):

  return top_n(
    filter(
      load_active_evidence(company),
      evidence_not_already_fully_processed
    ),
    by = evidence_generation_priority,
    n = EVIDENCE_BATCH_LIMIT
  )
```

## 21.2 knowledge selection for actions

```text
FUNCTION select_knowledge_for_action_generation(company):

  candidates = load_knowledge_items(company)

  eligible = filter(candidates,
    state IN [EVALUATED, REFINED]
    AND not_suppressed
    AND not_rotten
  )

  RETURN top_n(
    eligible,
    by = action_generation_priority,
    n = KNOWLEDGE_TO_ACTION_BATCH_LIMIT
  )
```

---

## 22. priorities

## 22.1 generation priority
recommended generation priority inputs:
- freshness
- source importance
- strategic topic fit
- evidence novelty
- low existing coverage

## 22.2 action generation priority
recommended action generation priority inputs:
- knowledge quality
- urgency
- high impact
- missing action coverage
- repeated unresolved opportunity signals

## 22.3 frontier priority
the Frontier MUST prioritize:
- evaluated quality
- urgency
- freshness
- strategic leverage
- non-duplication

---

## 23. invariants

the implementation MUST preserve the following invariants:

1. every item is tenant-bound
2. every surfaced item has lineage
3. duplicate siblings do not occupy the Frontier simultaneously under normal mode
4. feedback changes future ranking, memory, or rework behavior
5. evaluated supply starvation triggers fallback surfacing
6. action items preserve source knowledge lineage
7. decline does not equal deletion by default
8. delivery is stronger than acceptance
9. the system can operate with no human intervention for normal throughput
10. the user-facing set never exceeds 3 items

---

## 24. minimum viable test cases

the pseudocode is not credible unless these tests exist.

### 24.1 generation tests
- one evidence unit produces one valid knowledge candidate
- one evidence unit can produce many valid knowledge candidates
- many evidence units can produce one merged knowledge candidate
- many evidence units can produce many differentiated knowledge candidates

### 24.2 refinement tests
- exact duplicates collapse
- near duplicates merge or suppress
- overloaded candidates split
- weak but promising candidates enrich

### 24.3 evaluation tests
- high-quality candidate becomes `EVALUATED`
- low-support promising candidate enters `REWORK`
- fatal duplicate becomes `SUPPRESSED`
- low-quality candidate becomes `ARCHIVED`
- starving supply triggers fallback eligibility

### 24.4 frontier tests
- no more than 3 items surface
- evaluated items outrank refined items
- refined items outrank generated items when all else equal
- stronger newcomers can displace unread older items
- frontier is non-empty when eligible candidates exist

### 24.5 feedback tests
- decline creates rework or suppression
- modify-accept teaches memory
- deliver changes downstream weighting
- comments trigger reranking or rework where relevant

---

## 25. canonical end-to-end pseudocode

```text
LOOP forever:

  companies = select_companies_for_cycle()

  FOR company IN companies:

    IF NOT acquire_company_lock(company):
      CONTINUE

    TRY:

      cycleRunId = new_uuid()
      context = build_company_context(company)
      memory = load_feedback_memory(company)

      ingest_new_evidence(company, cycleRunId)

      knowledgeGenerated =
        run_generator_for_knowledge(company, select_evidence_for_generation(company), context, memory)

      knowledgeRefined =
        run_refiner_for_knowledge(company, knowledgeGenerated, context, memory)

      knowledgeEvaluated =
        run_evaluator_for_knowledge(company, knowledgeRefined, context, memory)

      persist_knowledge_evaluation_results(
        company,
        knowledgeGenerated,
        knowledgeRefined,
        knowledgeEvaluated,
        cycleRunId
      )

      actionGenerated =
        run_generator_for_actions(company, select_knowledge_for_action_generation(company), context, memory)

      actionRefined =
        run_refiner_for_actions(company, actionGenerated, context, memory)

      actionEvaluated =
        run_evaluator_for_actions(company, actionRefined, context, memory)

      persist_action_evaluation_results(
        company,
        actionGenerated,
        actionRefined,
        actionEvaluated,
        cycleRunId
      )

      run_maintenance(company, context, memory, cycleRunId)
      recompute_frontier(company, cycleRunId)

    FINALLY:
      release_company_lock(company)

  sleep(global_poll_interval)
```

---

## 26. final statement

this pseudocode defines the minimum serious form of the candidate processing system.

it is serious because it:
- separates generation, refinement, evaluation, and surfacing
- treats candidate sets instead of pretending single-item magic
- preserves lineage
- handles duplicates
- supports fallback supply
- keeps the user surface small
- turns feedback into system learning
- treats delivery as real business signal
- allows autonomy without UI delusion
