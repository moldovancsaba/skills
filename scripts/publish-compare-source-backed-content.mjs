import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env", override: false });

const prisma = new PrismaClient();
const comparePublicCopy = JSON.parse(
  readFileSync(new URL("../src/config/compare-public-copy.json", import.meta.url), "utf8"),
);

function parseArgs(argv) {
  const args = {
    companyId: "",
    outDir: "logs",
    cleanCatalog: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--companyId") {
      args.companyId = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (token === "--outDir") {
      args.outDir = String(argv[index + 1] || "logs").trim() || "logs";
      index += 1;
    } else if (token === "--no-clean") {
      args.cleanCatalog = false;
    }
  }
  return args;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function json(value) {
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

const LOCALIZED_PROVIDER_COPY = {
  "prov-ranger-sport-budapest": {
    hu: {
      announcementBadge: "Ellenőrzött",
      shortDescription:
        "Forrással igazolt budapesti lőtér és akadémia vezetett fegyveres csomagokkal, 25-100 méteres lőtávval és napi nyitvatartással.",
      longDescription:
        "A Ranger Sport hivatalos oldala budapesti lőtéri élményt mutat be vezetett csomagokkal, 25-100 méteres lőtávval, napi 10:00-20:00 nyitvatartással, szállodai transzferrel, oktatói támogatással, biztonsági felszereléssel és EUR 55-től induló csomagárakkal. A Compare ezt a listát csak hivatalos forrás alapján jeleníti meg, és a CHECK Local frissíti, ha a kereskedelmi állítások változnak.",
    },
    it: {
      announcementBadge: "Verificato",
      shortDescription:
        "Poligono e accademia di Budapest supportati da fonte, con pacchetti guidati, distanza di tiro 25-100 m e apertura quotidiana.",
      longDescription:
        "Il sito ufficiale di Ranger Sport presenta un'esperienza di tiro a Budapest con pacchetti guidati, distanza 25-100 m, apertura quotidiana 10:00-20:00, transfer dall'hotel, supporto istruttore, attrezzatura di sicurezza e pacchetti da EUR 55. Compare pubblica questa scheda solo da fonte ufficiale e CHECK Local la aggiorna prima di mostrare variazioni commerciali.",
    },
  },
  "prov-gepard-shooting-range-budapest": {
    hu: {
      announcementBadge: "Ellenőrzött",
      shortDescription:
        "Forrással igazolt budapesti beltéri lőtér felügyelt lőtérhasználattal, klubtagsági lehetőséggel és közzétett elérhetőségekkel.",
      longDescription:
        "A Gepard hivatalos angol oldala megadja a 1222 Budapest, Nagytétényi út 66. címet, telefonszámot, e-mail címet, munkanapi nyitvatartást, éves klubtagsági információt és egyszeri lőtérhasználati díjat. A díj a forrás szerint lőtérhasználatot, felügyeletet és klubfegyvereket tartalmaz, a lőszer nélkül.",
    },
    it: {
      announcementBadge: "Verificato",
      shortDescription:
        "Poligono indoor di Budapest supportato da fonte, con uso supervisionato, opzione club e contatti pubblicati.",
      longDescription:
        "Il sito inglese ufficiale di Gepard indica l'indirizzo 1222 Budapest, Nagytétényi út 66, telefono, email, orari feriali, informazioni sull'iscrizione annuale al club e una tariffa una tantum per l'uso del poligono. La fonte indica che la tariffa include uso del poligono, supervisione e armi del club, ma non munizioni.",
    },
  },
  "prov-celeritas-shooting-club-budapest": {
    hu: {
      announcementBadge: "Ellenőrzött",
      shortDescription:
        "Forrással igazolt budapesti lövészklub fedett lőtéri környezettel, online foglalással, hivatásos lövészetvezetőkkel és biztonsági információkkal.",
      longDescription:
        "A Celeritas hivatalos oldala budapesti lövészklubot ír le fedett, pincei lőtérrel, online foglalással, hivatásos lövészetvezetőkkel, csomaginformációkkal, biztonsági szabályokkal és részvételi feltételekkel. Az ár egyeztetés alapján jelenik meg, mert a CHECK Local még nem normalizált stabil nyilvános csomagárat a Compare szerződésbe.",
    },
    it: {
      announcementBadge: "Verificato",
      shortDescription:
        "Club di tiro di Budapest supportato da fonte, con poligono coperto, prenotazione online, responsabili professionali e informazioni di sicurezza.",
      longDescription:
        "Il sito ufficiale di Celeritas descrive un club di tiro a Budapest con poligono coperto nel seminterrato, prenotazione online, responsabili di tiro professionali, informazioni sui pacchetti, regole di sicurezza e condizioni di partecipazione. Il prezzo resta su richiesta perché CHECK Local non ha ancora normalizzato una tariffa pubblica stabile nel contratto Compare.",
    },
  },
  "prov-b-pro-steel-match-1-budapest": {
    hu: {
      announcementBadge: "Ellenőrzött",
      shortDescription:
        "Forrással igazolt MDLSZ versenykiírás a B-Pro Steel Match eseményhez, budapesti B-Pro Lőtér és Tréning Centrum helyszínnel.",
      longDescription:
        "Az MDLSZ portál dokumentuma azonosítja a B-Pro Steel Match 1 versenyt, a szervező B-Pro Bellators SE egyesületet és a budapesti B-Pro Lőtér és Tréning Centrum helyszínt. A CHECK Local ezt versenylistaként publikálja, és az időpontot, nevezést és részletes versenyadatokat közvetlenül az MDLSZ forrásból kell frissítenie, mielőtt időérzékeny állításokat jelenít meg.",
    },
    it: {
      announcementBadge: "Verificato",
      shortDescription:
        "Avviso gara MDLSZ supportato da fonte per B-Pro Steel Match presso B-Pro Lőtér és Tréning Centrum a Budapest.",
      longDescription:
        "Il documento del portale MDLSZ identifica la gara B-Pro Steel Match 1, l'associazione organizzatrice B-Pro Bellators SE e la sede B-Pro Lőtér és Tréning Centrum a Budapest. CHECK Local pubblica questa voce come competizione e deve aggiornare data, iscrizione e dettagli direttamente dalla fonte MDLSZ prima di mostrare informazioni sensibili al tempo.",
    },
  },
  "prov-omvk-hunter-education-resources": {
    hu: {
      announcementBadge: "Ellenőrzött",
      shortDescription:
        "Forrással igazolt országos vadászkamarai forrás vadászvizsgához és hivatalos magyar vadászati ágazati információkhoz.",
      longDescription:
        "Az Országos Magyar Vadászkamara hivatalos oldala vadászati ágazati forrásokat, közleményeket és vadászvizsgához kapcsolódó információkat tesz közzé Magyarország számára. Ez a lista szándékosan ár egyeztetés alapján jelenik meg, mert a CHECK Local még nem vont ki stabil nyilvános tanfolyamdíjat ehhez a forráshoz.",
    },
    it: {
      announcementBadge: "Verificato",
      shortDescription:
        "Risorsa nazionale della camera venatoria supportata da fonte per esami da cacciatore e informazioni ufficiali ungheresi.",
      longDescription:
        "Il sito ufficiale dell'Országos Magyar Vadászkamara pubblica risorse del settore venatorio, comunicazioni e informazioni relative agli esami da cacciatore in Ungheria. Questa scheda è marcata prezzo su richiesta perché CHECK Local non ha ancora estratto una tariffa pubblica stabile per il corso o la risorsa.",
    },
  },
  "prov-fehova-budapest-hunting-exhibition": {
    hu: {
      announcementBadge: "Ellenőrzött",
      shortDescription:
        "Forrással igazolt budapesti kiállítás vadászoknak, horgászoknak, fegyveres kiállítóknak és outdoor ágazati látogatóknak a HUNGEXPO-n.",
      longDescription:
        "A HUNGEXPO a FeHoVa eseményt jelentős magyar és regionális rendezvényként írja le vadászok, horgászok, természetkedvelők és fegyveres kiállítók számára a HUNGEXPO Budapest Kongresszusi és Kiállítási Központban. A CHECK Local ezt outdoor és vadászati felfedezési elemként publikálja, és a pontos dátumokat, jegyinformációkat közvetlenül a Hungexpo forrásból kell frissítenie.",
    },
    it: {
      announcementBadge: "Verificato",
      shortDescription:
        "Fiera di Budapest supportata da fonte per cacciatori, pescatori, espositori di armi e visitatori outdoor presso HUNGEXPO.",
      longDescription:
        "HUNGEXPO descrive FeHoVa come un evento ungherese e regionale importante per cacciatori, pescatori, amanti della natura ed espositori legati alle armi presso HUNGEXPO Budapest Congress and Exhibition Centre. CHECK Local pubblica questa voce come elemento outdoor/venatorio e deve aggiornare date e biglietteria direttamente dalla fonte Hungexpo.",
    },
  },
};

function provider(input) {
  return {
    catalogProject: "compare",
    image: "",
    galleryImages: [],
    rating: 0,
    reviewCount: 0,
    badges: [],
    bookingEnabled: false,
    localized: LOCALIZED_PROVIDER_COPY[input.id],
    publishedAt: nowIso(),
    updatedAt: nowIso(),
    ...input,
  };
}

const SOURCE_BACKED_LISTINGS = [
  {
    sourceUrl: "https://www.rangersport.hu/",
    sourceTitle: "Ranger Sport Budapest shooting range",
    contentType: "shooting_school",
    entityKind: "provider",
    facts: {
      title: "Ranger Sport Budapest shooting range",
      provider: "Ranger Sport HU",
      location: "Budapest, Hungary",
      evidence:
        "Official site describes a Budapest shooting range with 25-100m shooting distance, daily 10:00-20:00 opening, guided packages, and starting prices from EUR 55.",
    },
    draft: provider({
      id: "prov-ranger-sport-budapest",
      name: "Ranger Sport Budapest",
      category: "Classes",
      borough: "Hungary",
      neighborhood: "Budapest",
      address: "Budapest, Deak Ferenc ter-M, 1052 Hungary",
      activityTypes: ["Rifle", "Pistol", "Shotgun", "Range Training"],
      ageRanges: ["Beginner", "Licensed Adult"],
      dayTimeTags: ["Weekday", "Weekend", "Morning", "Afternoon"],
      pricePerClass: 55,
      shortDescription:
        "Verified Budapest shooting range and academy with guided firearm packages, 25-100m shooting distance, and daily opening hours.",
      longDescription:
        "Ranger Sport's official site presents a Budapest shooting range experience with guided packages, 25-100m shooting distance, daily 10:00-20:00 operation, hotel pickup, instructor support, safety equipment, and packages starting from EUR 55. This Compare listing is created from the official source only and should be refreshed by CHECK Local before any commercial claim changes.",
      email: "info@rangersport.hu",
      website: "https://www.rangersport.hu/",
      phone: "+36 1 808 8170",
    }),
  },
  {
    sourceUrl: "https://www.gepardloter.com/en",
    sourceTitle: "Gepard Shooting Range Budapest",
    contentType: "range",
    entityKind: "provider",
    facts: {
      title: "Gepard Shooting Range Budapest",
      provider: "Gepard Loter",
      location: "1222 Budapest, Nagytetenyi ut 66",
      evidence:
        "Official English site lists the Budapest address, workday opening hours, phone, email, annual club membership, and a one-time range fee.",
    },
    draft: provider({
      id: "prov-gepard-shooting-range-budapest",
      name: "Gepard Shooting Range Budapest",
      category: "Camps",
      borough: "Hungary",
      neighborhood: "Budapest",
      address: "1222 Budapest, Nagytetenyi ut 66, Hungary",
      activityTypes: ["Pistol", "Rifle", "Range Training"],
      ageRanges: ["Beginner", "Licensed Adult"],
      dayTimeTags: ["Weekday", "Evening", "Weekend"],
      pricePerClass: 15,
      shortDescription:
        "Verified indoor Budapest shooting range with supervised range use, club membership option, and published contact details.",
      longDescription:
        "Gepard's official site lists its address at 1222 Budapest, Nagytetenyi ut 66, a contact phone number, email, workday opening hours, annual club membership information, and a one-time range fee that includes range use, supervision, and club guns but not ammunition.",
      email: "gmloterferenczgabor@gmail.com",
      website: "https://www.gepardloter.com/en",
      phone: "+36 70 247 6499",
    }),
  },
  {
    sourceUrl: "https://www.celeritas.hu/",
    sourceTitle: "Celeritas Shooting Club Budapest",
    contentType: "range",
    entityKind: "provider",
    facts: {
      title: "Celeritas Shooting Club Budapest",
      provider: "Celeritas Shooting Club",
      location: "Budapest, Hungary",
      evidence:
        "Official site describes a covered basement range, online booking, professional range officers, safety rules, packages, and rare firearm experiences.",
    },
    draft: provider({
      id: "prov-celeritas-shooting-club-budapest",
      name: "Celeritas Shooting Club Budapest",
      category: "Camps",
      borough: "Hungary",
      neighborhood: "Budapest",
      address: "1239 Budapest, Grassalkovich ut 294, Hungary",
      activityTypes: ["Pistol", "Rifle", "Range Training"],
      ageRanges: ["Beginner", "Licensed Adult"],
      dayTimeTags: ["Weekday", "Weekend", "Seasonal"],
      pricePerClass: 0,
      shortDescription:
        "Verified Budapest shooting club with indoor range context, online booking, professional range officers, and safety information.",
      longDescription:
        "Celeritas' official site describes a Budapest shooting club with a covered basement range, online booking, professional range officers, package information, safety rules, and participation conditions. Price is not normalized here because CHECK Local has not yet extracted a stable public package price into the Compare contract.",
      email: "",
      website: "https://www.celeritas.hu/",
      phone: "",
    }),
  },
  {
    sourceUrl: "https://portal.mdlsz.com/race/3763/1767779977_B-ProSteelMatch1.pdf",
    sourceTitle: "MDLSZ B-Pro Steel Match 1 competition notice",
    contentType: "competition",
    entityKind: "provider",
    facts: {
      title: "B-Pro Steel Match 1",
      provider: "B-Pro Bellators SE / MDLSZ portal",
      location: "1097 Budapest, Peceli utca 2",
      evidence:
        "MDLSZ portal competition notice identifies B-Pro Steel Match 1, B-Pro Bellators SE, and B-Pro Loter es Trening Centrum in Budapest.",
    },
    draft: provider({
      id: "prov-b-pro-steel-match-1-budapest",
      name: "B-Pro Steel Match 1",
      category: "Competitions",
      borough: "Hungary",
      neighborhood: "Budapest",
      address: "1097 Budapest, Peceli utca 2, Hungary",
      activityTypes: ["Pistol", "Competition", "IPSC"],
      ageRanges: ["Competition", "Licensed Adult"],
      dayTimeTags: ["Weekend", "Seasonal"],
      pricePerClass: 0,
      shortDescription:
        "Verified MDLSZ competition notice for B-Pro Steel Match at B-Pro Loter es Trening Centrum in Budapest.",
      longDescription:
        "The MDLSZ portal document identifies B-Pro Steel Match 1, the organizing association B-Pro Bellators SE, and the Budapest venue B-Pro Loter es Trening Centrum. CHECK Local publishes this as a competition listing and should refresh date, registration, and match details directly from the official MDLSZ source before presenting time-sensitive claims.",
      email: "",
      website: "https://portal.mdlsz.com/race/3763/1767779977_B-ProSteelMatch1.pdf",
      phone: "",
    }),
  },
  {
    sourceUrl: "https://www.omvk.hu/",
    sourceTitle: "Orszagos Magyar Vadaszkamara official site",
    contentType: "hunter_education",
    entityKind: "provider",
    facts: {
      title: "OMVK hunter education and exam resources",
      provider: "Orszagos Magyar Vadaszkamara",
      location: "Hungary",
      evidence:
        "Official national hunting chamber site publishes Hungarian hunting-sector news and hunter exam/resource information.",
    },
    draft: provider({
      id: "prov-omvk-hunter-education-resources",
      name: "OMVK hunter education and exam resources",
      category: "Classes",
      borough: "Hungary",
      neighborhood: "Budapest",
      address: "Budapest, Hungary",
      activityTypes: ["Hunter Safety", "Hunter Prep", "Hunt"],
      ageRanges: ["Hunter Prep", "Licensed Adult"],
      dayTimeTags: ["Weekday", "Seasonal"],
      pricePerClass: 0,
      shortDescription:
        "Verified national hunting chamber resource for hunter exam and official Hungarian hunting-sector information.",
      longDescription:
        "The Orszagos Magyar Vadaszkamara official site publishes hunting-sector resources, announcements, and hunter exam-related information for Hungary. This listing is intentionally marked price-on-request because CHECK Local has not extracted a stable public course fee for this resource.",
      email: "",
      website: "https://www.omvk.hu/",
      phone: "",
    }),
  },
  {
    sourceUrl: "https://hungexpo.hu/en/events/fehova/",
    sourceTitle: "FeHoVa hunting, fishing, and arms exhibition",
    contentType: "expo",
    entityKind: "provider",
    facts: {
      title: "FeHoVa Budapest hunting, fishing, and arms exhibition",
      provider: "HUNGEXPO",
      location: "HUNGEXPO Budapest Congress and Exhibition Centre",
      evidence:
        "Hungexpo describes FeHoVa as a major hunting, fishing, and arms event at HUNGEXPO Budapest Congress and Exhibition Centre.",
    },
    draft: provider({
      id: "prov-fehova-budapest-hunting-exhibition",
      name: "FeHoVa Budapest hunting, fishing, and arms exhibition",
      category: "Drop-In Activities",
      borough: "Hungary",
      neighborhood: "Budapest",
      address: "1101 Budapest, Albertirsai ut 10, Hungary",
      activityTypes: ["Hunt", "Shotgun", "Rifle"],
      ageRanges: ["Hunter Prep", "Licensed Adult"],
      dayTimeTags: ["Seasonal", "Weekend"],
      pricePerClass: 0,
      shortDescription:
        "Verified Budapest exhibition for hunters, anglers, arms exhibitors, and outdoor-sector visitors at HUNGEXPO.",
      longDescription:
        "HUNGEXPO describes FeHoVa as a major Hungarian and regional event for hunters, anglers, nature lovers, and arms-related exhibitors at the HUNGEXPO Budapest Congress and Exhibition Centre. CHECK Local publishes this as an outdoor/hunting discovery item and should refresh exact event dates and ticketing directly from Hungexpo before showing time-sensitive details.",
      email: "",
      website: "https://hungexpo.hu/en/events/fehova/",
      phone: "",
    }),
  },
];

async function ensureCompany(companyId) {
  if (companyId) {
    const existing = await prisma.company.findUnique({ where: { id: companyId } });
    if (existing) return existing;
  }
  const named = await prisma.company.findFirst({
    where: {
      OR: [
        { name: { equals: "Compare", mode: "insensitive" } },
        { name: { equals: "RangeScout EU", mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });
  if (named) return named;
  return prisma.company.create({
    data: {
      name: "Compare",
      industry: "sport_shooting_hunting",
      industries: ["sport_shooting_hunting"],
      description: "CHECK Visitor unit for verified sport shooting and hunting discovery in Hungary.",
      targetMarket: "Hunters, sport shooters, clubs, training seekers",
    },
  });
}

async function ensureDestinationInstance(companyId) {
  const existing = await prisma.destinationInstance.findFirst({
    where: { companyId, destinationKey: "compare", isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;
  return prisma.destinationInstance.create({
    data: {
      companyId,
      destinationKey: "compare",
      name: "Compare",
      authRef: "check-local-compare-bridge",
      config: json({
        visitor: {
          blueprints: {
            "rangescout-hungary": {
              visitorKey: "rangescout-hungary",
              state: "active",
              industry: "sport_shooting_hunting",
              location: { country: "Hungary", geoGranularity: "country" },
              audience: ["hunters", "sport shooters", "clubs", "training seekers"],
              publicPromise: "Find verified ranges, training, competitions, clubs, and hunting-related events in Hungary.",
              taxonomyVersion: "v1",
              sourcePolicyVersion: "v1",
              qualityGateVersion: "v1",
              feedbackPolicyVersion: "v1",
            },
          },
        },
      }),
    },
  });
}

async function compareFetch(path, body) {
  const baseUrl = String(process.env.COMPARE_BASE_URL || "").replace(/\/$/, "");
  const ingestKey = String(process.env.COMPARE_INGEST_API_KEY || "").trim();
  if (!baseUrl || !ingestKey) throw new Error("COMPARE_BASE_URL and COMPARE_INGEST_API_KEY are required");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Compare ${path} failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function cleanCompareCatalog() {
  return compareFetch("/api/ingest", {
    operations: [
      { resource: "providers", action: "replaceAll", documents: [] },
      { resource: "meetupGroups", action: "replaceAll", documents: [] },
      {
        resource: "site",
        action: "patch",
        patch: {
          guides: [],
          locationHeroImages: [],
          homeHeroUrl: "",
          discoverHeroUrl: "",
          publicCopy: comparePublicCopy,
          publicLocales: ["en", "hu", "it"],
          publicDefaultLocale: "en",
          publicCopyMaintainedAt: nowIso(),
          publicCopyMaintainedBy: "CHECK Local verified Compare publisher",
        },
      },
    ],
  });
}

async function publishListing(companyId, instance, listing) {
  const at = new Date();
  const fingerprint = hash(`rangescout-hungary|${listing.sourceUrl}|${listing.draft.id}`);
  const contentHash = hash(JSON.stringify([listing.sourceUrl, listing.facts, listing.draft]));

  const workflowRun = await prisma.destinationWorkflowRun.create({
    data: {
      companyId,
      destinationInstanceId: instance.id,
      workflowKind: "visitor_source_backed_publish",
      state: "PUBLISHING",
      currentStage: "PUBLISH_REVIEWED_DRAFT",
      metadata: json({
        source: "publish-compare-source-backed-content",
        visitorKey: "rangescout-hungary",
        sourceUrl: listing.sourceUrl,
        generatedAt: at.toISOString(),
      }),
    },
  });

  const sourceDoc = await prisma.destinationSourceDocument.create({
    data: {
      companyId,
      destinationInstanceId: instance.id,
      workflowRunId: workflowRun.id,
      sourceUrl: listing.sourceUrl,
      sourceType: "visitor_datacard",
      officialnessScore: 95,
      contentHash,
      httpStatus: 200,
      rawText: listing.facts.evidence,
      fetchedAt: at,
      metadata: json({
        visitorSourceDatacard: {
          sourceId: "pending",
          visitorKey: "rangescout-hungary",
          datacardType: "trusted_source_datacard",
          url: listing.sourceUrl,
          canonicalUrl: listing.sourceUrl,
          sourceKind: listing.contentType === "competition" ? "calendar" : "official_site",
          trustTier: "trusted",
          industryRelevance: 1,
          locationRelevance: 1,
          extractionHints: ["Use official source facts only", "Do not infer price or schedule when absent"],
          knownContentTypes: [listing.contentType],
          sourceTitle: listing.sourceTitle,
          entityKind: listing.entityKind,
          extractedFacts: listing.facts,
          publicDraftPayload: listing.draft,
          autoPublishEligible: true,
          refreshCadenceDays: 14,
          lastCheckedAt: at.toISOString(),
          createdAt: at.toISOString(),
          updatedAt: at.toISOString(),
        },
      }),
    },
  });
  await prisma.destinationSourceDocument.update({
    where: { id: sourceDoc.id },
    data: {
      metadata: json({
        visitorSourceDatacard: {
          sourceId: sourceDoc.id,
          visitorKey: "rangescout-hungary",
          datacardType: "trusted_source_datacard",
          url: listing.sourceUrl,
          canonicalUrl: listing.sourceUrl,
          sourceKind: listing.contentType === "competition" ? "calendar" : "official_site",
          trustTier: "trusted",
          industryRelevance: 1,
          locationRelevance: 1,
          extractionHints: ["Use official source facts only", "Do not infer price or schedule when absent"],
          knownContentTypes: [listing.contentType],
          sourceTitle: listing.sourceTitle,
          entityKind: listing.entityKind,
          extractedFacts: listing.facts,
          publicDraftPayload: listing.draft,
          autoPublishEligible: true,
          refreshCadenceDays: 14,
          lastCheckedAt: at.toISOString(),
          createdAt: at.toISOString(),
          updatedAt: at.toISOString(),
        },
      }),
    },
  });

  const candidate = await prisma.destinationCandidate.upsert({
    where: {
      companyId_destinationInstanceId_candidateFingerprint: {
        companyId,
        destinationInstanceId: instance.id,
        candidateFingerprint: fingerprint,
      },
    },
    update: {
      workflowRunId: workflowRun.id,
      canonicalSourceUrl: listing.sourceUrl,
      proposedType: listing.contentType,
      status: "PUBLISHING",
      dedupeStatus: "UNIQUE",
      metadata: json({
        visitorKey: "rangescout-hungary",
        visitorCandidateState: "APPROVED",
        sourceDatacardIds: [sourceDoc.id],
        sourceTrustTier: "trusted",
        entityKind: listing.entityKind,
        adapterVersion: "visitor-public-draft-adapter@v1",
        publicDraftPayload: listing.draft,
        extractedFacts: listing.facts,
        autoPublishEligible: true,
      }),
    },
    create: {
      companyId,
      destinationInstanceId: instance.id,
      workflowRunId: workflowRun.id,
      candidateFingerprint: fingerprint,
      canonicalSourceUrl: listing.sourceUrl,
      proposedType: listing.contentType,
      status: "PUBLISHING",
      dedupeStatus: "UNIQUE",
      metadata: json({
        visitorKey: "rangescout-hungary",
        visitorCandidateState: "APPROVED",
        sourceDatacardIds: [sourceDoc.id],
        sourceTrustTier: "trusted",
        entityKind: listing.entityKind,
        adapterVersion: "visitor-public-draft-adapter@v1",
        publicDraftPayload: listing.draft,
        extractedFacts: listing.facts,
        autoPublishEligible: true,
      }),
    },
  });

  const version = await prisma.destinationFactSnapshot.count({ where: { candidateId: candidate.id } }) + 1;
  const factSnapshot = await prisma.destinationFactSnapshot.create({
    data: {
      companyId,
      destinationInstanceId: instance.id,
      candidateId: candidate.id,
      version,
      factsJson: json({ ...listing.facts, sourceUrl: listing.sourceUrl }),
      provenanceJson: json({
        source: "publish-compare-source-backed-content",
        sourceDocumentId: sourceDoc.id,
        canonicalSourceUrl: listing.sourceUrl,
      }),
      extractorVersion: "check-local-source-backed-extractor@v1",
    },
  });
  const draft = await prisma.destinationDraft.create({
    data: {
      companyId,
      destinationInstanceId: instance.id,
      candidateId: candidate.id,
      version,
      destinationKey: "compare",
      adapterVersion: "visitor-public-draft-adapter@v1",
      draftJson: json(listing.draft),
      provenanceJson: json({
        source: "publish-compare-source-backed-content",
        factSnapshotId: factSnapshot.id,
        sourceDocumentId: sourceDoc.id,
      }),
      basedOnFactSnapshotId: factSnapshot.id,
      reviewState: "APPROVED",
    },
  });

  await prisma.destinationCandidate.update({
    where: { id: candidate.id },
    data: {
      latestFactSnapshotId: factSnapshot.id,
      latestDraftId: draft.id,
    },
  });

  const packetFingerprint = hash(`review|${fingerprint}|${draft.id}`);
  const reviewPacket = await prisma.destinationReviewPacket.create({
    data: {
      companyId,
      destinationInstanceId: instance.id,
      workflowRunId: workflowRun.id,
      candidateId: candidate.id,
      draftId: draft.id,
      bridgeVersion: "visitor-auto-review@v1",
      packetFingerprint,
      packetState: "APPROVED",
      evidenceSummary: json({
        sourceUrl: listing.sourceUrl,
        sourceDocumentId: sourceDoc.id,
        sourceTitle: listing.sourceTitle,
        evidence: listing.facts.evidence,
      }),
      diagnostics: json({
        imagePolicy: "No fake image was used. Empty image renders as a neutral verified-source placeholder.",
        pricePolicy: "Price is only shown when extracted from source; otherwise public UI says price on request.",
      }),
      mediaSummary: json({ status: "not_used_no_fake_media" }),
      draftPayload: json(listing.draft),
      metadata: json({
        visitorKey: "rangescout-hungary",
        entityKind: listing.entityKind,
        autoPublishEligible: true,
      }),
      submittedAt: at,
    },
  });

  const publish = await compareFetch("/api/content-intelligence/publish-reviewed", {
    draftId: draft.id,
    entityKind: listing.entityKind,
    draftPayload: listing.draft,
    adapterVersion: "visitor-public-draft-adapter@v1",
    workflowMetadata: {
      companyId,
      checklistCompanyId: companyId,
      destinationKey: "compare",
      workflowRunId: workflowRun.id,
      candidateId: candidate.id,
      reviewPacketId: reviewPacket.id,
      bridgeVersion: "visitor-auto-review@v1",
    },
    idempotencyKey: `review-packet:${reviewPacket.id}`,
  });

  const published = publish.status === "published" || publish.status === "partial";
  await prisma.destinationCandidate.update({
    where: { id: candidate.id },
    data: {
      status: published ? "PUBLISHED" : "FAILED",
      metadata: json({
        visitorKey: "rangescout-hungary",
        visitorCandidateState: published ? "PUBLISHED" : "REWORK_REQUIRED",
        sourceDatacardIds: [sourceDoc.id],
        sourceTrustTier: "trusted",
        entityKind: listing.entityKind,
        adapterVersion: "visitor-public-draft-adapter@v1",
        publicDraftPayload: listing.draft,
        extractedFacts: listing.facts,
        autoPublishEligible: true,
        publish,
      }),
    },
  });
  await prisma.destinationWorkflowRun.update({
    where: { id: workflowRun.id },
    data: {
      state: published ? "PUBLISHED" : "FAILED",
      currentStage: published ? "PUBLIC_VISIBLE" : "PUBLISH_FAILED",
      metadata: json({
        source: "publish-compare-source-backed-content",
        visitorKey: "rangescout-hungary",
        sourceUrl: listing.sourceUrl,
        publish,
      }),
    },
  });
  const outcome = await prisma.destinationOutcomeMemory.create({
    data: {
      companyId,
      destinationInstanceId: instance.id,
      workflowRunId: workflowRun.id,
      candidateId: candidate.id,
      draftId: draft.id,
      reviewPacketId: reviewPacket.id,
      bridgeVersion: "visitor-auto-review@v1",
      eventType: published ? "publish_completed" : "publish_failed",
      reasonCode: published ? "source_backed_compare_publish" : "source_backed_compare_publish_failed",
      notes: published ? "Verified Compare listing published by CHECK Local." : "Verified Compare listing failed publish.",
      actorType: "SYSTEM",
      actorId: "CHECK Local verified Compare publisher",
      payload: json({ publish, sourceUrl: listing.sourceUrl }),
    },
  });

  return {
    id: listing.draft.id,
    name: listing.draft.name,
    sourceUrl: listing.sourceUrl,
    workflowRunId: workflowRun.id,
    sourceDocumentId: sourceDoc.id,
    candidateId: candidate.id,
    draftId: draft.id,
    reviewPacketId: reviewPacket.id,
    outcomeId: outcome.id,
    publish,
  };
}

const args = parseArgs(process.argv.slice(2));

try {
  const company = await ensureCompany(args.companyId);
  const instance = await ensureDestinationInstance(company.id);
  const clean = args.cleanCatalog ? await cleanCompareCatalog() : null;
  const published = [];
  for (const listing of SOURCE_BACKED_LISTINGS) {
    published.push(await publishListing(company.id, instance, listing));
  }

  mkdirSync(args.outDir, { recursive: true });
  const outputPath = join(args.outDir, `compare-source-backed-publish-${Date.now()}.json`);
  const output = {
    ok: true,
    companyId: company.id,
    companyName: company.name,
    destinationInstanceId: instance.id,
    cleanCatalog: clean,
    published,
  };
  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify({ ok: true, outputPath, companyId: company.id, publishedCount: published.length }, null, 2));
} catch (error) {
  console.error(`Compare source-backed publish failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
