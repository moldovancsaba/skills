const assert = require("node:assert/strict");

const {
  applyOpportunitySearchFeedback,
  buildSearchQueries,
  filterCandidateResults,
  isAllowedCompanyCandidate,
  normalizeSearchState,
} = require("./lib/opportunity-search");

function main() {
  const company = {
    name: "Checklist OS",
    industry: "B2B SaaS",
    targetMarket: "RevOps teams",
    website: "https://checklist.example.com",
    productCategories: ["Sales intelligence", "Workflow automation"],
    demographics: {
      location: "Europe",
    },
  };

  const queries = buildSearchQueries(company, [
    {
      title: "Competitive CRM rollout",
      hashtags: ["#pipeline", "#sales"],
    },
  ]);

  assert.equal(queries.length, 3, "search pipeline should keep a bounded query set");
  assert.match(queries[0], /RevOps teams/i, "primary query should include target market");
  assert.match(queries[0], /Sales intelligence/i, "primary query should include product category");
  assert.match(queries[0], /Europe/i, "primary query should include geography when available");

  const hashtagIndustryQueries = buildSearchQueries({
    name: "Fortitude AI",
    industry: "#ai",
    targetMarket: null,
    website: "",
    productCategories: [],
    demographics: {},
  }, []);
  assert.equal(
    hashtagIndustryQueries.some((query) => query.includes("#ai")),
    false,
    "search queries must strip hashtag-style company metadata before web search",
  );

  const learnedQueries = buildSearchQueries(
    company,
    [
      {
        title: "Competitive CRM rollout",
        hashtags: ["#pipeline", "#sales"],
      },
    ],
    normalizeSearchState({
      termScores: {
        "sales engagement": 4,
        "pipeline automation": 2,
      },
      queryStats: {
        "sales engagement companies Europe": {
          accepted: 3,
          createdOpportunitycards: 2,
          createdSources: 1,
        },
      },
    }),
  );
  assert.equal(learnedQueries.length, 4, "query memory should allow one extra bounded learned query");
  assert.equal(
    learnedQueries.some((query) => /sales engagement companies europe/i.test(query)),
    true,
    "successful historical queries should be reused directly",
  );
  const migratedState = normalizeSearchState({
    queryStats: {
      "legacy accepted query": {
        accepted: 2,
      },
    },
  });
  assert.equal(
    migratedState.queryStats["legacy accepted query"].accepted,
    0,
    "legacy search state must not preserve pre-feedback accepted counts as real accepts",
  );
  assert.equal(
    migratedState.queryStats["legacy accepted query"].candidateCount,
    2,
    "legacy search state must migrate old accepted counters into candidate counts",
  );

  const learnedState = applyOpportunitySearchFeedback(
    normalizeSearchState({
      queryStats: {
        "sales engagement companies Europe": {
          runs: 2,
          accepted: 1,
          declined: 0,
          candidateCount: 3,
        },
      },
      termScores: {
        acme: 1,
      },
      domainScores: {
        "acme.example.com": 1,
      },
    }),
    {
      action: "DECLINE",
      query: "sales engagement companies Europe",
      domain: "https://acme.example.com/platform",
      terms: ["Acme Revenue Platform", "#Forecasting"],
    },
  );
  assert.equal(
    learnedState.queryStats["sales engagement companies Europe"].declined,
    1,
    "declined opportunity feedback must penalize the exact originating query",
  );
  assert.equal(
    learnedState.domainScores["acme.example.com"] < 1,
    true,
    "declined feedback must reduce confidence in the originating domain",
  );
  assert.equal(
    learnedState.termScores.forecasting < 0,
    true,
    "declined feedback must reduce learned confidence in extracted lead terms",
  );

  const accepted = {
    title: "Acme Revenue Platform",
    snippet: "Revenue platform for RevOps teams across Europe.",
    url: "https://acme.example.com/platform",
  };
  const sameCompany = {
    title: "Checklist OS",
    snippet: "Official company site",
    url: "https://checklist.example.com",
  };
  const socialProfile = {
    title: "Acme on LinkedIn",
    snippet: "LinkedIn profile",
    url: "https://linkedin.com/company/acme",
  };
  const peopleResult = {
    title: "VP Sales profile",
    snippet: "Person profile and resume",
    url: "https://people.example.com/vp-sales",
  };
  const documentResult = {
    title: "Industry list",
    snippet: "PDF download",
    url: "https://docs.example.com/list.pdf",
  };
  const genericListicle = {
    title: "Top 25 RevOps Tools for 2026",
    snippet: "Comparison guide and market roundup.",
    url: "https://market.example.com/revops-tools",
  };

  assert.equal(isAllowedCompanyCandidate(accepted, company), true, "company candidate should be accepted");
  assert.equal(isAllowedCompanyCandidate(sameCompany, company), false, "own-company results must be rejected");
  assert.equal(isAllowedCompanyCandidate(socialProfile, company), false, "social-network pages must be rejected");
  assert.equal(isAllowedCompanyCandidate(peopleResult, company), false, "people-profile results must be rejected");
  assert.equal(isAllowedCompanyCandidate(documentResult, company), false, "document downloads must be rejected");
  assert.equal(isAllowedCompanyCandidate(genericListicle, company), false, "generic listicles must be rejected before mining");

  const filtered = filterCandidateResults(
    [sameCompany, socialProfile, accepted, peopleResult, documentResult, genericListicle],
    company,
  );
  assert.equal(filtered.length, 1, "filter should keep only company-like candidates");
  assert.equal(filtered[0].url, accepted.url, "accepted candidate should survive filtering");

  console.log("Opportunity search tests passed.");
}

main();
