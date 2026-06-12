'use client';

import { getGdsLocaleMetadata, isGdsRtlLocale } from "@doneisbetter/gds/client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { FALLBACK_LANGUAGE, UI_LANGUAGE_STORAGE_KEY, UI_LANGUAGE_VALUES, type TextDirection, type UiLanguage } from "@/lib/ui-language-config";

export { FALLBACK_LANGUAGE, UI_LANGUAGE_STORAGE_KEY, UI_LANGUAGE_VALUES, type TextDirection, type UiLanguage };
type TranslationParams = Record<string, string | number>;

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === "string" && UI_LANGUAGE_VALUES.includes(value as UiLanguage);
}

export function resolveUiLanguage(value: unknown): UiLanguage {
  return isUiLanguage(value) ? value : FALLBACK_LANGUAGE;
}

export function getUiLanguageDirection(language: UiLanguage): TextDirection {
  const metadata = getGdsLocaleMetadata(language);
  return metadata.direction === "rtl" || isGdsRtlLocale(language) ? "rtl" : "ltr";
}

export const UI_LANGUAGE_OPTIONS: Array<{
  value: UiLanguage;
  label: string;
  nativeName: string;
  dir: TextDirection;
}> = [
  { value: "en", label: "English", nativeName: "English", dir: getUiLanguageDirection("en") },
  { value: "hu", label: "Hungarian", nativeName: "Magyar", dir: getUiLanguageDirection("hu") },
  { value: "es", label: "Spanish", nativeName: "Español", dir: getUiLanguageDirection("es") },
  { value: "ar", label: "Arabic", nativeName: "العربية", dir: getUiLanguageDirection("ar") },
  { value: "he", label: "Hebrew", nativeName: "עברית", dir: getUiLanguageDirection("he") },
];

const translations = {
  en: {
    common: {
      back: "Back",
      cancel: "Cancel",
      confirm: "Confirm",
      save: "Save",
      copied: "Copied",
      error: "Error",
      loading: "Loading...",
      privacy: "Privacy",
      terms: "Terms",
    },
    nav: {
      company: "Intelligence Unit",
      companyDescription: "Operating Unit",
      companySyncing: "Synchronizing...",
      selectPortfolio: "Select a portfolio unit to begin operations.",
      themeLight: "Light mode",
      themeDark: "Dark mode",
      identity: "Identity",
      organizationSettings: "Organization Settings",
      terminateSession: "Terminate Session",
      systemAccess: "System Access",
      data: "Data",
      topics: "Topics",
      goals: "Goals",
      review: "Review",
      knowmore: "Knowmore",
      sales: "Sales",
      tactical: "Tactical",
      checklist: "Checklist",
      aiQueue: "AI Queue",
    },
    uiLanguage: {
      label: "UI Language",
      description: "Choose the interface language for this browser.",
      placeholder: "Select interface language",
      helper: "Applies immediately and stays on this device.",
    },
    home: {
      loading: "Hardening OS Infrastructure...",
      syncFailure: "Synchronization Failure",
      faq: "Intelligence FAQ",
      sso: "Sign in with SSO",
      editUnit: "Edit Unit",
      purgeUnit: "Purge Unit",
      unitId: "UNIT ID: {{id}}",
      noUnitsTitle: "No intelligence units are currently provisioned",
      noUnitsDescription: "This account does not yet have an active operating unit.",
      provisionUnit: "Provision New Intelligence Unit",
      createTitle: "Initialize New Unit",
      editTitle: "Modify Intelligence Unit",
      companyName: "Company Name",
      companyNamePlaceholder: "Enter company name",
      industriesLabel: "Strategic Industries",
      industriesPlaceholder: "Search or add industry tags (e.g. #saas, #ai)",
      initializeUnit: "Initialize Unit",
      synchronizeUnit: "Synchronize Unit",
      failedCompanies: "Failed to fetch companies",
      failedCreate: "Failed to create company",
      failedUpdate: "Failed to update company",
      failedDelete: "Failed to delete company",
      deleteConfirm: "Delete this company?",
    },
    settings: {
      loading: "Loading OS configuration...",
      missing: "Error: Settings context not found.",
      saved: "Settings saved",
      communicationUpdated: "Communication preferences updated successfully.",
      organizationSaved: "Organization saved",
      organizationUpdated: "Language and organization settings updated.",
      saveFailed: "Failed to save settings.",
      organizationSaveFailed: "Failed to save organization settings.",
      secretRegenerated: "Secret regenerated",
      secretIssued: "A new Bridge API Key has been issued.",
      regenerateFailed: "Failed to regenerate secret.",
      copied: "Copied to clipboard.",
      regenerateConfirm: "Regenerating the secret will break existing bridge integrations. Continue?",
      uiLanguageTitle: "Interface Language",
      uiLanguageDescription: "This changes the visible app language for navigation and shared UI on this device.",
      alertingLayer: "Alerting Layer",
      alertingDescription: "Enable or disable automated AI discoveries and task alerts.",
      languageManagement: "Language Management",
      languageDescription: "Define which languages the local AI system is allowed to use for synthesis, refinement, and repair.",
      permittedLanguages: "Permitted Languages",
      permittedLanguagesPlaceholder: "Select permitted languages for local AI synthesis...",
      enabledCount: "{{count}} Enabled",
      applyLanguagePolicy: "Apply Language Policy",
      policyEnforcement: "Policy Enforcement",
      policyDetails:
        "The local AI system must use only these permitted languages for flashcards and taskcards. Content detected in a disallowed language or in mixed-language form is treated as a quality error and should be rewritten or removed during synthesis and revisit passes.",
      notificationChannel: "Notification Channel",
      channel: "Channel",
      contactHandle: "Contact Handle / URL",
      sensitivityPriority: "Sensitivity & Priority",
      minimumIceScore: "Minimum ICE Score",
      higherScore: "Higher score = fewer, higher-quality notifications.",
      bridgeApi: "Communication Bridge API",
      bridgeDescription: "Use this key to send data into check memory from external scripts.",
      bridgeSecretStored: "Bridge secret stored securely (hashed at rest). Regenerate to reveal a new key.",
      bridgeSecretMissing: "No bridge secret has been issued yet.",
      bridgeSecretDetails: "Newly generated keys are shown once, then stored hashed at rest. Use the `x-company-id`, `x-bridge-secret`, and `x-bridge-timestamp` headers when posting into the bridge.",
      bridgeEndpoint: "Endpoint",
      bridgeExampleRequest: "Example Request",
      languagePolicyOnly: "AI language policy",
      languagePolicyHelper: "This is separate from the visible UI language selector.",
      daemonPolicyTitle: "Destination daemon policy",
      daemonPolicyDescription:
        "Control per-miniapp destination daemon limits for this Unit. Runtime order is explicit override, then Unit policy, then shared defaults.",
      daemonPolicySaved: "Daemon policy saved",
      daemonPolicyUpdated: "Per-miniapp execution limits have been updated.",
      daemonPolicySaveFailed: "Failed to save daemon policy.",
      daemonPolicyLoadFailed: "Daemon policy could not be loaded for this Unit.",
      daemonPolicyResolvedSource: "Resolved source: {{source}}",
      daemonPolicySourceDefault: "shared default",
      daemonPolicySourceWorkerConfig: "unit worker config",
      daemonPolicyDefaultHint: "Shared fallback defaults apply when no miniapp override exists.",
      daemonPolicyDestinationCompare: "Compare",
      daemonPolicyLaneOverrides: "{{destination}} lane overrides",
      daemonPolicyLaneOverridesDescription: "Limits applied when this Miniapp lane is active for the Unit.",
      daemonPolicyWarnings: "Policy warnings",
      daemonPolicyReset: "Reset",
      daemonPolicySave: "Save daemon policy",
      daemonPolicyMaxRunsLabel: "Max runs",
      daemonPolicyMaxRunsDescription: "Active mission runs daemon can process per cycle.",
      daemonPolicyMaxPassesLabel: "Max passes",
      daemonPolicyMaxPassesDescription: "Execution passes daemon can make per run in one cycle.",
      daemonPolicyMaxAutoRejectionsLabel: "Max auto rejections",
      daemonPolicyMaxAutoRejectionsDescription: "Automatic rejection budget before run handoff.",
      daemonPolicyMaxRevisionIntakesLabel: "Max revision intakes",
      daemonPolicyMaxRevisionIntakesDescription: "Maintenance stale sweep intake budget per cycle.",
      daemonPolicyMaxApprovedPublishesLabel: "Max approved publishes",
      daemonPolicyMaxApprovedPublishesDescription: "Approved packet publish budget per cycle.",
    },
    dashboard: {
      loading: "Synchronizing intelligence stream...",
      data: "Data",
      topics: "Topics",
      goals: "Goals",
      review: "Review",
      knowmore: "Knowmore",
      tactical: "Tactical",
      checklist: "Checklist",
      aiQueue: "AI Queue",
      searchAnswers: "Search & Answers",
      searchDescription: "Unified retrieval across cards, queue work, and grounded answers over company context.",
      workflows: "Workflows",
      workflowsDescription: "Bounded workflow blueprints and enrichment waterfall controls for operator-guided automation.",
      observability: "Observability",
      observabilityDescription: "Mission control for worker health, queue pressure, score health, and recent system outcomes.",
      scoreHealth: "Score Health",
      scoreHealthDescription: "Live observability for score clustering, tuple repetition, and tactical score diversity.",
      taskTupleRepeat: "Task Tuple Repeat",
      taskPriorityCrowd: "Task Priority Crowd",
      scoreAlert: "Score Alert",
      taskIceDiversity: "Task ICE Diversity",
      awaitingScoreSample: "Awaiting score health sample",
      synthesizedIntelligence: "Synthesized Intelligence",
      synthesizedDescription: "Top-priority strategic goals derived by the local AI system.",
      openGlobalProtocol: "Open Global Protocol",
      addIntelligence: "Add Intelligence",
    },
    taskCard: {
      task: "TASK",
      deliver: "Deliver",
      delete: "Delete",
      accept: "Accept",
      decline: "Decline",
      declineTask: "Decline Task",
      modifyAccept: "Modify & Accept",
      markDelivered: "Mark Delivered",
      deleteAccepted: "Delete Accepted Task",
      acceptTask: "Accept Task",
      title: "Title",
      description: "Description",
      declineReason: "Decline Reason",
      declinePlaceholder: "Select a reason",
      strategicFeedback: "Strategic Feedback",
      feedbackPlaceholder: "Provide context for system calibration...",
      intelligenceControls: "Intelligence controls",
      pinEvidence: "Pin relevant evidence",
      pin: "Pin",
      requestReevaluation: "Request re-evaluation",
      refresh: "Refresh",
      viewTrace: "View synthesis trace",
      trace: "Trace",
      postpone: "POSTPONE...",
      archive: "Archive",
      declineReasons: {
        DUPLICATE: "Already exists (Duplicate)",
        ALREADY_DONE: "Already completed",
        IRRELEVANT: "Irrelevant to our strategy",
        LOW_PRIORITY: "Valid, but low priority right now",
        BAD_TIMING: "Good idea, but wrong timing",
        TOO_VAGUE: "Too vague (needs more detail)",
        MISSING_CONTEXT: "Missing context",
        NOT_ACTIONABLE: "Not actionable by the team",
        WRONG: "Factually incorrect",
        IGNORANT_OUTPUT: "AI Hallucination",
      },
      postponeOptions: {
        IDEABANK: "Idea Bank",
        ROADMAP: "Roadmap",
        BACKLOG: "Backlog",
        TODO: "Next",
      },
    },
  },
  hu: {
    common: { back: "Vissza", cancel: "Mégse", confirm: "Megerősítés", save: "Mentés", copied: "Másolva", error: "Hiba", loading: "Betöltés...", privacy: "Adatvédelem", terms: "Feltételek" },
    nav: { company: "Intelligencia egység", companyDescription: "Működési egység", companySyncing: "Szinkronizálás...", selectPortfolio: "Válassz egy portfólióegységet a műveletek megkezdéséhez.", themeLight: "Világos mód", themeDark: "Sötét mód", identity: "Azonosítás", organizationSettings: "Szervezeti beállítások", terminateSession: "Munkamenet lezárása", systemAccess: "Rendszerhozzáférés", data: "Adatok", topics: "Témák", goals: "Célok", review: "Áttekintés", knowmore: "Knowmore", sales: "Értékesítés", tactical: "Taktikai", checklist: "Checklist", aiQueue: "AI várólista" },
    uiLanguage: { label: "Felület nyelve", description: "Válaszd ki a felület nyelvét ehhez a böngészőhöz.", placeholder: "Válassz felületi nyelvet", helper: "Azonnal érvényes, és ezen az eszközön marad." },
    home: { loading: "OS infrastruktúra előkészítése...", syncFailure: "Szinkronizációs hiba", faq: "Intelligencia GYIK", sso: "Bejelentkezés SSO-val", editUnit: "Egység szerkesztése", purgeUnit: "Egység törlése", unitId: "EGYSÉG AZONOSÍTÓ: {{id}}", noUnitsTitle: "Jelenleg nincs kiépített intelligencia egység", noUnitsDescription: "Ehhez a fiókhoz még nincs aktív működési egység.", provisionUnit: "Új intelligencia egység létrehozása", createTitle: "Új egység inicializálása", editTitle: "Intelligencia egység módosítása", companyName: "Cég neve", companyNamePlaceholder: "Add meg a cég nevét", industriesLabel: "Stratégiai iparágak", industriesPlaceholder: "Iparági címkék keresése vagy hozzáadása (pl. #saas, #ai)", initializeUnit: "Egység inicializálása", synchronizeUnit: "Egység szinkronizálása", failedCompanies: "A cégek lekérése nem sikerült", failedCreate: "A cég létrehozása nem sikerült", failedUpdate: "A cég frissítése nem sikerült", failedDelete: "A cég törlése nem sikerült", deleteConfirm: "Törlöd ezt a céget?" },
    settings: { loading: "OS konfiguráció betöltése...", missing: "Hiba: a beállítási környezet nem található.", saved: "Beállítások mentve", communicationUpdated: "A kommunikációs beállítások sikeresen frissültek.", organizationSaved: "Szervezet mentve", organizationUpdated: "A nyelvi és szervezeti beállítások frissültek.", saveFailed: "A beállítások mentése nem sikerült.", organizationSaveFailed: "A szervezeti beállítások mentése nem sikerült.", secretRegenerated: "Titok újragenerálva", secretIssued: "Új Bridge API kulcs lett kiadva.", regenerateFailed: "A titok újragenerálása nem sikerült.", copied: "Vágólapra másolva.", regenerateConfirm: "A titok újragenerálása megszakítja a meglévő bridge integrációkat. Folytatod?", uiLanguageTitle: "Felület nyelve", uiLanguageDescription: "Ez ezen az eszközön megváltoztatja a látható alkalmazásnyelvet a navigációban és a közös felületeken.", alertingLayer: "Riasztási réteg", alertingDescription: "Kapcsold be vagy ki az automatikus AI felismeréseket és feladatriasztásokat.", languageManagement: "Nyelvkezelés", languageDescription: "Határozd meg, mely nyelveket használhatja a helyi AI szintézishez, finomításhoz és javításhoz.", permittedLanguages: "Engedélyezett nyelvek", permittedLanguagesPlaceholder: "Válaszd ki a helyi AI szintéziséhez engedélyezett nyelveket...", enabledCount: "{{count}} engedélyezve", applyLanguagePolicy: "Nyelvi szabály alkalmazása", policyEnforcement: "Szabályérvényesítés", policyDetails: "A helyi AI rendszer csak ezeket az engedélyezett nyelveket használhatja a kártyákhoz és feladatkártyákhoz. A tiltott vagy vegyes nyelvű tartalom minőségi hibának számít, és a szintézis vagy felülvizsgálat során át kell írni vagy el kell távolítani.", notificationChannel: "Értesítési csatorna", channel: "Csatorna", contactHandle: "Kapcsolati azonosító / URL", sensitivityPriority: "Érzékenység és prioritás", minimumIceScore: "Minimum ICE pontszám", higherScore: "Magasabb pontszám = kevesebb, jobb minőségű értesítés.", bridgeApi: "Kommunikációs Bridge API", bridgeDescription: "Ezzel a kulccsal küldhetsz adatot a check memóriába külső szkriptekből.", bridgeSecretStored: "A bridge titok biztonságosan van tárolva (hash-elve nyugalmi állapotban). Újrageneráláskor új kulcs jelenik meg.", bridgeSecretMissing: "Még nincs kiadva bridge titok.", bridgeSecretDetails: "Az újonnan generált kulcsok egyszer jelennek meg, utána hash-elve tárolódnak. A bridge hívásokhoz használd az `x-company-id`, `x-bridge-secret` és `x-bridge-timestamp` headereket.", bridgeEndpoint: "Végpont", bridgeExampleRequest: "Példa kérés", languagePolicyOnly: "AI nyelvi szabály", languagePolicyHelper: "Ez különáll a látható UI nyelvválasztótól.", daemonPolicyTitle: "Destination daemon policy", daemonPolicyDescription: "Control per-miniapp destination daemon limits for this Unit. Runtime order is explicit override, then Unit policy, then shared defaults.", daemonPolicySaved: "Daemon policy saved", daemonPolicyUpdated: "Per-miniapp execution limits have been updated.", daemonPolicySaveFailed: "Failed to save daemon policy.", daemonPolicyLoadFailed: "Daemon policy could not be loaded for this Unit.", daemonPolicyResolvedSource: "Resolved source: {{source}}", daemonPolicySourceDefault: "shared default", daemonPolicySourceWorkerConfig: "unit worker config", daemonPolicyDefaultHint: "Shared fallback defaults apply when no miniapp override exists.", daemonPolicyDestinationCompare: "Compare", daemonPolicyLaneOverrides: "{{destination}} lane overrides", daemonPolicyLaneOverridesDescription: "Limits applied when this Miniapp lane is active for the Unit.", daemonPolicyWarnings: "Policy warnings", daemonPolicyReset: "Reset", daemonPolicySave: "Save daemon policy", daemonPolicyMaxRunsLabel: "Max runs", daemonPolicyMaxRunsDescription: "Active mission runs daemon can process per cycle.", daemonPolicyMaxPassesLabel: "Max passes", daemonPolicyMaxPassesDescription: "Execution passes daemon can make per run in one cycle.", daemonPolicyMaxAutoRejectionsLabel: "Max auto rejections", daemonPolicyMaxAutoRejectionsDescription: "Automatic rejection budget before run handoff.", daemonPolicyMaxRevisionIntakesLabel: "Max revision intakes", daemonPolicyMaxRevisionIntakesDescription: "Maintenance stale sweep intake budget per cycle.", daemonPolicyMaxApprovedPublishesLabel: "Max approved publishes", daemonPolicyMaxApprovedPublishesDescription: "Approved packet publish budget per cycle." },
    dashboard: { loading: "Intelligenciafolyam szinkronizálása...", data: "Adatok", topics: "Témák", goals: "Célok", review: "Áttekintés", knowmore: "Knowmore", tactical: "Taktikai", checklist: "Checklist", aiQueue: "AI várólista", searchAnswers: "Keresés és válaszok", searchDescription: "Egységes lekérés kártyákon, várólistamunkán és a vállalati kontextuson alapuló válaszokon át.", workflows: "Munkafolyamatok", workflowsDescription: "Korlátozott munkafolyamat-tervek és dúsítási vezérlők operátorvezérelt automatizáláshoz.", observability: "Megfigyelhetőség", observabilityDescription: "Vezérlőközpont a worker egészséghez, várólistaterheléshez, pontszámegészséghez és a legutóbbi rendszereredményekhez.", scoreHealth: "Pontszámegészség", scoreHealthDescription: "Élő megfigyelhetőség a pontszámcsoportosuláshoz, tuple ismétlődéshez és taktikai diverzitáshoz.", taskTupleRepeat: "Feladat tuple ismétlődés", taskPriorityCrowd: "Feladat prioritási torlódás", scoreAlert: "Pontszámriasztás", taskIceDiversity: "Feladat ICE diverzitás", awaitingScoreSample: "Pontszámegészség minta várható", synthesizedIntelligence: "Szintetizált intelligencia", synthesizedDescription: "A helyi AI rendszerből származó legfontosabb stratégiai célok.", openGlobalProtocol: "Globális protokoll megnyitása", addIntelligence: "Intelligencia hozzáadása" },
    taskCard: { task: "FELADAT", deliver: "Kézbesítés", delete: "Törlés", accept: "Elfogadás", decline: "Elutasítás", declineTask: "Feladat elutasítása", modifyAccept: "Módosítás és elfogadás", markDelivered: "Kézbesítettnek jelölés", deleteAccepted: "Elfogadott feladat törlése", acceptTask: "Feladat elfogadása", title: "Cím", description: "Leírás", declineReason: "Elutasítás oka", declinePlaceholder: "Válassz okot", strategicFeedback: "Stratégiai visszajelzés", feedbackPlaceholder: "Adj kontextust a rendszer kalibrálásához...", intelligenceControls: "Intelligencia vezérlők", pinEvidence: "Releváns bizonyíték rögzítése", pin: "Rögzítés", requestReevaluation: "Újraértékelés kérése", refresh: "Frissítés", viewTrace: "Szintézis nyomvonal megtekintése", trace: "Nyomvonal", postpone: "HALASZTÁS...", archive: "Archiválás", declineReasons: { DUPLICATE: "Már létezik (duplikátum)", ALREADY_DONE: "Már elkészült", IRRELEVANT: "Nem releváns a stratégiánkhoz", LOW_PRIORITY: "Érvényes, de most alacsony prioritású", BAD_TIMING: "Jó ötlet, de rossz az időzítés", TOO_VAGUE: "Túl homályos (több részlet kell)", MISSING_CONTEXT: "Hiányzó kontextus", NOT_ACTIONABLE: "A csapat számára nem végrehajtható", WRONG: "Tényszerűen hibás", IGNORANT_OUTPUT: "AI hallucináció" }, postponeOptions: { IDEABANK: "Ötlettár", ROADMAP: "Ütemterv", BACKLOG: "Backlog", TODO: "Következő" } },
  },
  es: {
    common: { back: "Volver", cancel: "Cancelar", confirm: "Confirmar", save: "Guardar", copied: "Copiado", error: "Error", loading: "Cargando...", privacy: "Privacidad", terms: "Términos" },
    nav: { company: "Unidad de inteligencia", companyDescription: "Unidad operativa", companySyncing: "Sincronizando...", selectPortfolio: "Selecciona una unidad de portafolio para comenzar las operaciones.", themeLight: "Modo claro", themeDark: "Modo oscuro", identity: "Identidad", organizationSettings: "Configuración de la organización", terminateSession: "Cerrar sesión", systemAccess: "Acceso al sistema", data: "Datos", topics: "Temas", goals: "Objetivos", review: "Revisión", knowmore: "Knowmore", sales: "Ventas", tactical: "Táctico", checklist: "Checklist", aiQueue: "Cola de IA" },
    uiLanguage: { label: "Idioma de la interfaz", description: "Elige el idioma de la interfaz para este navegador.", placeholder: "Selecciona el idioma de la interfaz", helper: "Se aplica de inmediato y permanece en este dispositivo." },
    home: { loading: "Acondicionando infraestructura del SO...", syncFailure: "Fallo de sincronización", faq: "FAQ de inteligencia", sso: "Iniciar sesión con SSO", editUnit: "Editar unidad", purgeUnit: "Eliminar unidad", unitId: "ID DE UNIDAD: {{id}}", noUnitsTitle: "No hay unidades de inteligencia aprovisionadas", noUnitsDescription: "Esta cuenta todavía no tiene una unidad operativa activa.", provisionUnit: "Aprovisionar nueva unidad de inteligencia", createTitle: "Inicializar nueva unidad", editTitle: "Modificar unidad de inteligencia", companyName: "Nombre de la empresa", companyNamePlaceholder: "Introduce el nombre de la empresa", industriesLabel: "Industrias estratégicas", industriesPlaceholder: "Busca o añade etiquetas de industria (p. ej. #saas, #ai)", initializeUnit: "Inicializar unidad", synchronizeUnit: "Sincronizar unidad", failedCompanies: "No se pudieron obtener las empresas", failedCreate: "No se pudo crear la empresa", failedUpdate: "No se pudo actualizar la empresa", failedDelete: "No se pudo eliminar la empresa", deleteConfirm: "¿Eliminar esta empresa?" },
    settings: { loading: "Cargando configuración del SO...", missing: "Error: no se encontró el contexto de configuración.", saved: "Configuración guardada", communicationUpdated: "Las preferencias de comunicación se actualizaron correctamente.", organizationSaved: "Organización guardada", organizationUpdated: "Se actualizaron los ajustes de idioma y organización.", saveFailed: "No se pudieron guardar los ajustes.", organizationSaveFailed: "No se pudieron guardar los ajustes de la organización.", secretRegenerated: "Se regeneró el secreto", secretIssued: "Se emitió una nueva clave API de Bridge.", regenerateFailed: "No se pudo regenerar el secreto.", copied: "Copiado al portapapeles.", regenerateConfirm: "Regenerar el secreto romperá las integraciones bridge existentes. ¿Continuar?", uiLanguageTitle: "Idioma de la interfaz", uiLanguageDescription: "Esto cambia el idioma visible de la aplicación para la navegación y la UI compartida en este dispositivo.", alertingLayer: "Capa de alertas", alertingDescription: "Activa o desactiva los descubrimientos automáticos de IA y las alertas de tareas.", languageManagement: "Gestión de idiomas", languageDescription: "Define qué idiomas puede usar el sistema local de IA para síntesis, refinamiento y reparación.", permittedLanguages: "Idiomas permitidos", permittedLanguagesPlaceholder: "Selecciona los idiomas permitidos para la síntesis local de IA...", enabledCount: "{{count}} habilitados", applyLanguagePolicy: "Aplicar política de idioma", policyEnforcement: "Aplicación de la política", policyDetails: "El sistema local de IA debe usar solo estos idiomas permitidos para tarjetas y tarjetas de tareas. El contenido detectado en un idioma no permitido o en forma mixta se trata como un error de calidad y debe reescribirse o eliminarse durante la síntesis y las revisiones.", notificationChannel: "Canal de notificación", channel: "Canal", contactHandle: "Identificador de contacto / URL", sensitivityPriority: "Sensibilidad y prioridad", minimumIceScore: "Puntuación ICE mínima", higherScore: "Mayor puntuación = menos notificaciones, pero de mayor calidad.", bridgeApi: "API de Communication Bridge", bridgeDescription: "Usa esta clave para enviar datos a la memoria de check desde scripts externos.", bridgeSecretStored: "El secreto del bridge se guarda de forma segura (hasheado en reposo). Regénéralo para revelar una nueva clave.", bridgeSecretMissing: "Todavía no se ha emitido ningún secreto del bridge.", bridgeSecretDetails: "Las claves recién generadas se muestran una sola vez y luego se almacenan hasheadas en reposo. Usa las cabeceras `x-company-id`, `x-bridge-secret` y `x-bridge-timestamp` al publicar en el bridge.", bridgeEndpoint: "Endpoint", bridgeExampleRequest: "Solicitud de ejemplo", languagePolicyOnly: "Política de idioma de IA", languagePolicyHelper: "Esto es independiente del selector del idioma visible de la UI.", daemonPolicyTitle: "Destination daemon policy", daemonPolicyDescription: "Control per-miniapp destination daemon limits for this Unit. Runtime order is explicit override, then Unit policy, then shared defaults.", daemonPolicySaved: "Daemon policy saved", daemonPolicyUpdated: "Per-miniapp execution limits have been updated.", daemonPolicySaveFailed: "Failed to save daemon policy.", daemonPolicyLoadFailed: "Daemon policy could not be loaded for this Unit.", daemonPolicyResolvedSource: "Resolved source: {{source}}", daemonPolicySourceDefault: "shared default", daemonPolicySourceWorkerConfig: "unit worker config", daemonPolicyDefaultHint: "Shared fallback defaults apply when no miniapp override exists.", daemonPolicyDestinationCompare: "Compare", daemonPolicyLaneOverrides: "{{destination}} lane overrides", daemonPolicyLaneOverridesDescription: "Limits applied when this Miniapp lane is active for the Unit.", daemonPolicyWarnings: "Policy warnings", daemonPolicyReset: "Reset", daemonPolicySave: "Save daemon policy", daemonPolicyMaxRunsLabel: "Max runs", daemonPolicyMaxRunsDescription: "Active mission runs daemon can process per cycle.", daemonPolicyMaxPassesLabel: "Max passes", daemonPolicyMaxPassesDescription: "Execution passes daemon can make per run in one cycle.", daemonPolicyMaxAutoRejectionsLabel: "Max auto rejections", daemonPolicyMaxAutoRejectionsDescription: "Automatic rejection budget before run handoff.", daemonPolicyMaxRevisionIntakesLabel: "Max revision intakes", daemonPolicyMaxRevisionIntakesDescription: "Maintenance stale sweep intake budget per cycle.", daemonPolicyMaxApprovedPublishesLabel: "Max approved publishes", daemonPolicyMaxApprovedPublishesDescription: "Approved packet publish budget per cycle." },
    dashboard: { loading: "Sincronizando flujo de inteligencia...", data: "Datos", topics: "Temas", goals: "Objetivos", review: "Revisión", knowmore: "Knowmore", tactical: "Táctico", checklist: "Checklist", aiQueue: "Cola de IA", searchAnswers: "Búsqueda y respuestas", searchDescription: "Recuperación unificada entre tarjetas, trabajo en cola y respuestas fundamentadas sobre el contexto de la empresa.", workflows: "Flujos de trabajo", workflowsDescription: "Planos de flujo acotados y controles de enriquecimiento para automatización guiada por operadores.", observability: "Observabilidad", observabilityDescription: "Centro de control para salud de workers, presión de cola, salud de puntuación y resultados recientes del sistema.", scoreHealth: "Salud de puntuación", scoreHealthDescription: "Observabilidad en vivo para agrupación de puntuaciones, repetición de tuplas y diversidad táctica de puntuaciones.", taskTupleRepeat: "Repetición de tuplas de tareas", taskPriorityCrowd: "Concentración de prioridad de tareas", scoreAlert: "Alerta de puntuación", taskIceDiversity: "Diversidad ICE de tareas", awaitingScoreSample: "Esperando muestra de salud de puntuación", synthesizedIntelligence: "Inteligencia sintetizada", synthesizedDescription: "Objetivos estratégicos prioritarios derivados por el sistema local de IA.", openGlobalProtocol: "Abrir protocolo global", addIntelligence: "Añadir inteligencia" },
    taskCard: { task: "TAREA", deliver: "Entregar", delete: "Eliminar", accept: "Aceptar", decline: "Rechazar", declineTask: "Rechazar tarea", modifyAccept: "Modificar y aceptar", markDelivered: "Marcar como entregada", deleteAccepted: "Eliminar tarea aceptada", acceptTask: "Aceptar tarea", title: "Título", description: "Descripción", declineReason: "Motivo de rechazo", declinePlaceholder: "Selecciona un motivo", strategicFeedback: "Retroalimentación estratégica", feedbackPlaceholder: "Añade contexto para calibrar el sistema...", intelligenceControls: "Controles de inteligencia", pinEvidence: "Fijar evidencia relevante", pin: "Fijar", requestReevaluation: "Solicitar reevaluación", refresh: "Actualizar", viewTrace: "Ver trazabilidad de síntesis", trace: "Trazabilidad", postpone: "POSPONER...", archive: "Archivar", declineReasons: { DUPLICATE: "Ya existe (Duplicado)", ALREADY_DONE: "Ya se completó", IRRELEVANT: "Irrelevante para nuestra estrategia", LOW_PRIORITY: "Válido, pero de baja prioridad ahora", BAD_TIMING: "Buena idea, pero mal momento", TOO_VAGUE: "Demasiado vago (requiere más detalle)", MISSING_CONTEXT: "Falta contexto", NOT_ACTIONABLE: "No es accionable por el equipo", WRONG: "Incorrecto objetivamente", IGNORANT_OUTPUT: "Alucinación de IA" }, postponeOptions: { IDEABANK: "Banco de ideas", ROADMAP: "Hoja de ruta", BACKLOG: "Backlog", TODO: "Siguiente" } },
  },
  ar: {
    common: { back: "رجوع", cancel: "إلغاء", confirm: "تأكيد", save: "حفظ", copied: "تم النسخ", error: "خطأ", loading: "جارٍ التحميل...", privacy: "الخصوصية", terms: "الشروط" },
    nav: { company: "وحدة الاستخبارات", companyDescription: "وحدة تشغيل", companySyncing: "جارٍ المزامنة...", selectPortfolio: "اختر وحدة محفظة لبدء التشغيل.", themeLight: "الوضع الفاتح", themeDark: "الوضع الداكن", identity: "الهوية", organizationSettings: "إعدادات المؤسسة", terminateSession: "إنهاء الجلسة", systemAccess: "دخول النظام", data: "البيانات", topics: "الموضوعات", goals: "الأهداف", review: "المراجعة", knowmore: "Knowmore", sales: "المبيعات", tactical: "تكتيكي", checklist: "Checklist", aiQueue: "طابور الذكاء الاصطناعي" },
    uiLanguage: { label: "لغة الواجهة", description: "اختر لغة الواجهة لهذا المتصفح.", placeholder: "اختر لغة الواجهة", helper: "يتم التطبيق فورًا ويبقى على هذا الجهاز." },
    home: { loading: "تهيئة بنية نظام التشغيل...", syncFailure: "فشل المزامنة", faq: "الأسئلة الشائعة للاستخبارات", sso: "تسجيل الدخول عبر SSO", editUnit: "تعديل الوحدة", purgeUnit: "حذف الوحدة", unitId: "معرّف الوحدة: {{id}}", noUnitsTitle: "لا توجد وحدات استخبارات مهيأة حاليًا", noUnitsDescription: "هذا الحساب لا يملك بعد وحدة تشغيل نشطة.", provisionUnit: "تجهيز وحدة استخبارات جديدة", createTitle: "تهيئة وحدة جديدة", editTitle: "تعديل وحدة الاستخبارات", companyName: "اسم الشركة", companyNamePlaceholder: "أدخل اسم الشركة", industriesLabel: "القطاعات الاستراتيجية", industriesPlaceholder: "ابحث عن وسوم القطاعات أو أضفها (مثل #saas و #ai)", initializeUnit: "تهيئة الوحدة", synchronizeUnit: "مزامنة الوحدة", failedCompanies: "فشل جلب الشركات", failedCreate: "فشل إنشاء الشركة", failedUpdate: "فشل تحديث الشركة", failedDelete: "فشل حذف الشركة", deleteConfirm: "هل تريد حذف هذه الشركة؟" },
    settings: { loading: "جارٍ تحميل إعدادات النظام...", missing: "خطأ: لم يتم العثور على سياق الإعدادات.", saved: "تم حفظ الإعدادات", communicationUpdated: "تم تحديث تفضيلات الاتصال بنجاح.", organizationSaved: "تم حفظ المؤسسة", organizationUpdated: "تم تحديث إعدادات اللغة والمؤسسة.", saveFailed: "فشل حفظ الإعدادات.", organizationSaveFailed: "فشل حفظ إعدادات المؤسسة.", secretRegenerated: "تم إنشاء السر من جديد", secretIssued: "تم إصدار مفتاح Bridge API جديد.", regenerateFailed: "فشل إعادة إنشاء السر.", copied: "تم النسخ إلى الحافظة.", regenerateConfirm: "إعادة إنشاء السر ستعطل تكاملات bridge الحالية. هل تريد المتابعة؟", uiLanguageTitle: "لغة الواجهة", uiLanguageDescription: "يغيّر هذا اللغة الظاهرة للتنقل والواجهة المشتركة على هذا الجهاز.", alertingLayer: "طبقة التنبيهات", alertingDescription: "فعّل أو عطّل اكتشافات الذكاء الاصطناعي التلقائية وتنبيهات المهام.", languageManagement: "إدارة اللغات", languageDescription: "حدّد اللغات التي يُسمح للنظام المحلي للذكاء الاصطناعي باستخدامها في التوليف والتحسين والإصلاح.", permittedLanguages: "اللغات المسموح بها", permittedLanguagesPlaceholder: "اختر اللغات المسموح بها لتوليف الذكاء الاصطناعي المحلي...", enabledCount: "{{count}} مفعّل", applyLanguagePolicy: "تطبيق سياسة اللغة", policyEnforcement: "تطبيق السياسة", policyDetails: "يجب على نظام الذكاء الاصطناعي المحلي استخدام هذه اللغات المسموح بها فقط للبطاقات وبطاقات المهام. ويُعامل أي محتوى بلغة غير مسموح بها أو بصيغة لغات مختلطة كخطأ جودة، ويجب إعادة كتابته أو إزالته أثناء التوليف والمراجعة.", notificationChannel: "قناة الإشعارات", channel: "القناة", contactHandle: "معرّف التواصل / الرابط", sensitivityPriority: "الحساسية والأولوية", minimumIceScore: "الحد الأدنى لدرجة ICE", higherScore: "درجة أعلى = إشعارات أقل وأعلى جودة.", bridgeApi: "واجهة Communication Bridge API", bridgeDescription: "استخدم هذا المفتاح لإرسال البيانات إلى ذاكرة check من سكربتات خارجية.", bridgeSecretStored: "يتم تخزين سر الجسر بشكل آمن (مشفّر كقيمة هاش أثناء السكون). أعد توليده لإظهار مفتاح جديد.", bridgeSecretMissing: "لم يتم إصدار سر للجسر بعد.", bridgeSecretDetails: "تُعرض المفاتيح التي تم إنشاؤها حديثًا مرة واحدة فقط ثم تُخزن كقيمة هاش أثناء السكون. استخدم رؤوس `x-company-id` و`x-bridge-secret` و`x-bridge-timestamp` عند الإرسال إلى الجسر.", bridgeEndpoint: "نقطة النهاية", bridgeExampleRequest: "طلب مثال", languagePolicyOnly: "سياسة لغة الذكاء الاصطناعي", languagePolicyHelper: "هذا منفصل عن محدد لغة الواجهة المرئية.", daemonPolicyTitle: "Destination daemon policy", daemonPolicyDescription: "Control per-miniapp destination daemon limits for this Unit. Runtime order is explicit override, then Unit policy, then shared defaults.", daemonPolicySaved: "Daemon policy saved", daemonPolicyUpdated: "Per-miniapp execution limits have been updated.", daemonPolicySaveFailed: "Failed to save daemon policy.", daemonPolicyLoadFailed: "Daemon policy could not be loaded for this Unit.", daemonPolicyResolvedSource: "Resolved source: {{source}}", daemonPolicySourceDefault: "shared default", daemonPolicySourceWorkerConfig: "unit worker config", daemonPolicyDefaultHint: "Shared fallback defaults apply when no miniapp override exists.", daemonPolicyDestinationCompare: "Compare", daemonPolicyLaneOverrides: "{{destination}} lane overrides", daemonPolicyLaneOverridesDescription: "Limits applied when this Miniapp lane is active for the Unit.", daemonPolicyWarnings: "Policy warnings", daemonPolicyReset: "Reset", daemonPolicySave: "Save daemon policy", daemonPolicyMaxRunsLabel: "Max runs", daemonPolicyMaxRunsDescription: "Active mission runs daemon can process per cycle.", daemonPolicyMaxPassesLabel: "Max passes", daemonPolicyMaxPassesDescription: "Execution passes daemon can make per run in one cycle.", daemonPolicyMaxAutoRejectionsLabel: "Max auto rejections", daemonPolicyMaxAutoRejectionsDescription: "Automatic rejection budget before run handoff.", daemonPolicyMaxRevisionIntakesLabel: "Max revision intakes", daemonPolicyMaxRevisionIntakesDescription: "Maintenance stale sweep intake budget per cycle.", daemonPolicyMaxApprovedPublishesLabel: "Max approved publishes", daemonPolicyMaxApprovedPublishesDescription: "Approved packet publish budget per cycle." },
    dashboard: { loading: "جارٍ مزامنة تدفق الاستخبارات...", data: "البيانات", topics: "الموضوعات", goals: "الأهداف", review: "المراجعة", knowmore: "Knowmore", tactical: "تكتيكي", checklist: "Checklist", aiQueue: "طابور الذكاء الاصطناعي", searchAnswers: "البحث والإجابات", searchDescription: "استرجاع موحّد عبر البطاقات وأعمال الطابور والإجابات المستندة إلى سياق الشركة.", workflows: "سير العمل", workflowsDescription: "مخططات سير عمل محدودة وعناصر تحكم للإثراء من أجل أتمتة موجّهة من المشغّل.", observability: "المراقبة", observabilityDescription: "مركز تحكم لصحة العمال وضغط الطابور وصحة الدرجات ونتائج النظام الحديثة.", scoreHealth: "صحة الدرجات", scoreHealthDescription: "مراقبة مباشرة لتكتل الدرجات وتكرار الأزواج وتنوع الدرجات التكتيكية.", taskTupleRepeat: "تكرار أزواج المهام", taskPriorityCrowd: "تزاحم أولوية المهام", scoreAlert: "تنبيه الدرجات", taskIceDiversity: "تنوع ICE للمهام", awaitingScoreSample: "بانتظار عينة صحة الدرجات", synthesizedIntelligence: "استخبارات مُولَّفة", synthesizedDescription: "أهم الأهداف الاستراتيجية المستخرجة بواسطة نظام الذكاء الاصطناعي المحلي.", openGlobalProtocol: "فتح البروتوكول العام", addIntelligence: "إضافة استخبارات" },
    taskCard: { task: "مهمة", deliver: "تسليم", delete: "حذف", accept: "قبول", decline: "رفض", declineTask: "رفض المهمة", modifyAccept: "تعديل وقبول", markDelivered: "وضع علامة تم التسليم", deleteAccepted: "حذف المهمة المقبولة", acceptTask: "قبول المهمة", title: "العنوان", description: "الوصف", declineReason: "سبب الرفض", declinePlaceholder: "اختر سببًا", strategicFeedback: "ملاحظات استراتيجية", feedbackPlaceholder: "أضف سياقًا لمعايرة النظام...", intelligenceControls: "عناصر تحكم الاستخبارات", pinEvidence: "تثبيت الأدلة المهمة", pin: "تثبيت", requestReevaluation: "طلب إعادة التقييم", refresh: "تحديث", viewTrace: "عرض أثر التوليف", trace: "الأثر", postpone: "تأجيل...", archive: "أرشفة", declineReasons: { DUPLICATE: "موجودة بالفعل (مكررة)", ALREADY_DONE: "تم إنجازها بالفعل", IRRELEVANT: "غير مرتبطة باستراتيجيتنا", LOW_PRIORITY: "صالحة لكنها منخفضة الأولوية الآن", BAD_TIMING: "فكرة جيدة لكن التوقيت غير مناسب", TOO_VAGUE: "غامضة جدًا (تحتاج تفاصيل أكثر)", MISSING_CONTEXT: "سياق مفقود", NOT_ACTIONABLE: "غير قابلة للتنفيذ من الفريق", WRONG: "غير صحيحة واقعيًا", IGNORANT_OUTPUT: "هلوسة ذكاء اصطناعي" }, postponeOptions: { IDEABANK: "بنك الأفكار", ROADMAP: "خارطة الطريق", BACKLOG: "المتراكم", TODO: "التالي" } },
  },
  he: {
    common: { back: "חזרה", cancel: "ביטול", confirm: "אישור", save: "שמירה", copied: "הועתק", error: "שגיאה", loading: "טוען...", privacy: "פרטיות", terms: "תנאים" },
    nav: { company: "יחידת מודיעין", companyDescription: "יחידת תפעול", companySyncing: "מסנכרן...", selectPortfolio: "בחר יחידת פורטפוליו כדי להתחיל בפעילות.", themeLight: "מצב בהיר", themeDark: "מצב כהה", identity: "זהות", organizationSettings: "הגדרות ארגון", terminateSession: "סיום סשן", systemAccess: "גישת מערכת", data: "נתונים", topics: "נושאים", goals: "יעדים", review: "סקירה", knowmore: "Knowmore", sales: "מכירות", tactical: "טקטי", checklist: "Checklist", aiQueue: "תור AI" },
    uiLanguage: { label: "שפת הממשק", description: "בחר את שפת הממשק עבור הדפדפן הזה.", placeholder: "בחר שפת ממשק", helper: "השינוי מוחל מיד ונשמר במכשיר הזה." },
    home: { loading: "מקשיחים את תשתית מערכת ההפעלה...", syncFailure: "כשל בסנכרון", faq: "שאלות נפוצות למודיעין", sso: "התחברות עם SSO", editUnit: "עריכת יחידה", purgeUnit: "מחיקת יחידה", unitId: "מזהה יחידה: {{id}}", noUnitsTitle: "אין כרגע יחידות מודיעין שהוקצו", noUnitsDescription: "לחשבון הזה עדיין אין יחידת תפעול פעילה.", provisionUnit: "הקצאת יחידת מודיעין חדשה", createTitle: "אתחול יחידה חדשה", editTitle: "שינוי יחידת מודיעין", companyName: "שם החברה", companyNamePlaceholder: "הזן את שם החברה", industriesLabel: "ענפים אסטרטגיים", industriesPlaceholder: "חפש או הוסף תגיות ענף (למשל #saas, #ai)", initializeUnit: "אתחל יחידה", synchronizeUnit: "סנכרן יחידה", failedCompanies: "נכשל באחזור החברות", failedCreate: "נכשל ביצירת החברה", failedUpdate: "נכשל בעדכון החברה", failedDelete: "נכשל במחיקת החברה", deleteConfirm: "למחוק את החברה הזו?" },
    settings: { loading: "טוען תצורת מערכת...", missing: "שגיאה: הקשר ההגדרות לא נמצא.", saved: "ההגדרות נשמרו", communicationUpdated: "העדפות התקשורת עודכנו בהצלחה.", organizationSaved: "הארגון נשמר", organizationUpdated: "הגדרות השפה והארגון עודכנו.", saveFailed: "שמירת ההגדרות נכשלה.", organizationSaveFailed: "שמירת הגדרות הארגון נכשלה.", secretRegenerated: "הסוד נוצר מחדש", secretIssued: "הונפק מפתח Bridge API חדש.", regenerateFailed: "יצירה מחדש של הסוד נכשלה.", copied: "הועתק ללוח.", regenerateConfirm: "יצירה מחדש של הסוד תשבור אינטגרציות bridge קיימות. להמשיך?", uiLanguageTitle: "שפת הממשק", uiLanguageDescription: "זה משנה את שפת האפליקציה הנראית בניווט ובממשק המשותף במכשיר הזה.", alertingLayer: "שכבת התראות", alertingDescription: "הפעל או השבת גילויי AI אוטומטיים והתראות משימות.", languageManagement: "ניהול שפות", languageDescription: "הגדר אילו שפות מותר למערכת ה-AI המקומית להשתמש בהן לסינתזה, עידון ותיקון.", permittedLanguages: "שפות מותרות", permittedLanguagesPlaceholder: "בחר את השפות המותרות לסינתזת AI מקומית...", enabledCount: "{{count}} מופעלות", applyLanguagePolicy: "החל מדיניות שפה", policyEnforcement: "אכיפת מדיניות", policyDetails: "מערכת ה-AI המקומית חייבת להשתמש רק בשפות המותרות האלה עבור כרטיסים וכרטיסי משימות. תוכן בשפה אסורה או בתערובת שפות נחשב לשגיאת איכות ויש לנסחו מחדש או להסירו במהלך הסינתזה והסקירות.", notificationChannel: "ערוץ התראות", channel: "ערוץ", contactHandle: "כתובת קשר / URL", sensitivityPriority: "רגישות ועדיפות", minimumIceScore: "ציון ICE מינימלי", higherScore: "ציון גבוה יותר = פחות התראות, באיכות גבוהה יותר.", bridgeApi: "Communication Bridge API", bridgeDescription: "השתמש במפתח הזה כדי לשלוח נתונים לזיכרון check מסקריפטים חיצוניים.", bridgeSecretStored: "סוד ה-bridge נשמר בצורה מאובטחת (כ-hash במנוחה). צור מחדש כדי לחשוף מפתח חדש.", bridgeSecretMissing: "עדיין לא הונפק סוד bridge.", bridgeSecretDetails: "מפתחות שנוצרים מחדש מוצגים פעם אחת בלבד ואז נשמרים כ-hash במנוחה. השתמש בכותרות `x-company-id`, `x-bridge-secret` ו-`x-bridge-timestamp` בעת שליחה ל-bridge.", bridgeEndpoint: "נקודת קצה", bridgeExampleRequest: "בקשה לדוגמה", languagePolicyOnly: "מדיניות שפת AI", languagePolicyHelper: "זה נפרד מבחירת שפת ה-UI הנראית.", daemonPolicyTitle: "Destination daemon policy", daemonPolicyDescription: "Control per-miniapp destination daemon limits for this Unit. Runtime order is explicit override, then Unit policy, then shared defaults.", daemonPolicySaved: "Daemon policy saved", daemonPolicyUpdated: "Per-miniapp execution limits have been updated.", daemonPolicySaveFailed: "Failed to save daemon policy.", daemonPolicyLoadFailed: "Daemon policy could not be loaded for this Unit.", daemonPolicyResolvedSource: "Resolved source: {{source}}", daemonPolicySourceDefault: "shared default", daemonPolicySourceWorkerConfig: "unit worker config", daemonPolicyDefaultHint: "Shared fallback defaults apply when no miniapp override exists.", daemonPolicyDestinationCompare: "Compare", daemonPolicyLaneOverrides: "{{destination}} lane overrides", daemonPolicyLaneOverridesDescription: "Limits applied when this Miniapp lane is active for the Unit.", daemonPolicyWarnings: "Policy warnings", daemonPolicyReset: "Reset", daemonPolicySave: "Save daemon policy", daemonPolicyMaxRunsLabel: "Max runs", daemonPolicyMaxRunsDescription: "Active mission runs daemon can process per cycle.", daemonPolicyMaxPassesLabel: "Max passes", daemonPolicyMaxPassesDescription: "Execution passes daemon can make per run in one cycle.", daemonPolicyMaxAutoRejectionsLabel: "Max auto rejections", daemonPolicyMaxAutoRejectionsDescription: "Automatic rejection budget before run handoff.", daemonPolicyMaxRevisionIntakesLabel: "Max revision intakes", daemonPolicyMaxRevisionIntakesDescription: "Maintenance stale sweep intake budget per cycle.", daemonPolicyMaxApprovedPublishesLabel: "Max approved publishes", daemonPolicyMaxApprovedPublishesDescription: "Approved packet publish budget per cycle." },
    dashboard: { loading: "מסנכרן את זרם המודיעין...", data: "נתונים", topics: "נושאים", goals: "יעדים", review: "סקירה", knowmore: "Knowmore", tactical: "טקטי", checklist: "Checklist", aiQueue: "תור AI", searchAnswers: "חיפוש ותשובות", searchDescription: "אחזור מאוחד בין כרטיסים, עבודת תור ותשובות מבוססות על הקשר החברה.", workflows: "זרימות עבודה", workflowsDescription: "תבניות זרימת עבודה תחומות ובקרות העשרה לאוטומציה מונחית מפעיל.", observability: "תצפיתיות", observabilityDescription: "מרכז שליטה לבריאות workers, לחץ בתור, בריאות ציונים ותוצאות מערכת אחרונות.", scoreHealth: "בריאות ציונים", scoreHealthDescription: "תצפיתיות חיה לצבירי ציונים, חזרת tuples ומגוון ציונים טקטי.", taskTupleRepeat: "חזרת tuples של משימות", taskPriorityCrowd: "צפיפות עדיפות משימות", scoreAlert: "התראת ציון", taskIceDiversity: "מגוון ICE של משימות", awaitingScoreSample: "ממתין לדגימת בריאות ציונים", synthesizedIntelligence: "מודיעין מסונתז", synthesizedDescription: "יעדים אסטרטגיים בעדיפות גבוהה שנגזרו על ידי מערכת ה-AI המקומית.", openGlobalProtocol: "פתח פרוטוקול גלובלי", addIntelligence: "הוסף מודיעין" },
    taskCard: { task: "משימה", deliver: "מסירה", delete: "מחיקה", accept: "אישור", decline: "דחייה", declineTask: "דחיית משימה", modifyAccept: "שינוי ואישור", markDelivered: "סימון כנמסר", deleteAccepted: "מחיקת משימה שאושרה", acceptTask: "אישור משימה", title: "כותרת", description: "תיאור", declineReason: "סיבת דחייה", declinePlaceholder: "בחר סיבה", strategicFeedback: "משוב אסטרטגי", feedbackPlaceholder: "הוסף הקשר לכיול המערכת...", intelligenceControls: "בקרות מודיעין", pinEvidence: "נעץ ראיה רלוונטית", pin: "נעץ", requestReevaluation: "בקש הערכה מחדש", refresh: "רענון", viewTrace: "הצג עקבת סינתזה", trace: "עקבה", postpone: "דחייה...", archive: "ארכוב", declineReasons: { DUPLICATE: "כבר קיים (כפול)", ALREADY_DONE: "כבר הושלם", IRRELEVANT: "לא רלוונטי לאסטרטגיה שלנו", LOW_PRIORITY: "תקף, אך בעדיפות נמוכה כרגע", BAD_TIMING: "רעיון טוב, אבל תזמון לא נכון", TOO_VAGUE: "מעורפל מדי (צריך יותר פירוט)", MISSING_CONTEXT: "חסר הקשר", NOT_ACTIONABLE: "לא בר-ביצוע לצוות", WRONG: "שגוי עובדתית", IGNORANT_OUTPUT: "הזיית AI" }, postponeOptions: { IDEABANK: "בנק רעיונות", ROADMAP: "מפת דרכים", BACKLOG: "באקלוג", TODO: "הבא" } },
  },
} as const;

type TranslationTree = typeof translations.en;
type TranslationLeaf = string | number | TranslationTree | Record<string, unknown>;

function interpolate(template: string, params?: TranslationParams) {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? ""));
}

function getNestedValue(source: Record<string, unknown>, path: string): TranslationLeaf | undefined {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, source) as TranslationLeaf | undefined;
}

type UiI18nContextValue = {
  language: UiLanguage;
  dir: TextDirection;
  setLanguage: (value: UiLanguage) => void;
  t: (key: string, params?: TranslationParams) => string;
};

const UiI18nContext = createContext<UiI18nContextValue | null>(null);

export function UiLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(() => {
    if (typeof window === "undefined") return FALLBACK_LANGUAGE;
    const stored = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    return resolveUiLanguage(stored);
  });

  const dir = useMemo<TextDirection>(() => {
    return getUiLanguageDirection(language);
  }, [language]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language);
  }, [dir, language]);

  const setLanguage = useCallback((value: UiLanguage) => {
    setLanguageState(value);
  }, []);

  const t = useCallback((key: string, params?: TranslationParams) => {
    const active = getNestedValue(translations[language] as unknown as Record<string, unknown>, key);
    const fallback = getNestedValue(translations[FALLBACK_LANGUAGE] as unknown as Record<string, unknown>, key);
    const resolved = typeof active === "string" ? active : typeof fallback === "string" ? fallback : key;
    return interpolate(resolved, params);
  }, [language]);

  const value = useMemo<UiI18nContextValue>(() => ({
    language,
    dir,
    setLanguage,
    t,
  }), [dir, language, setLanguage, t]);

  return <UiI18nContext.Provider value={value}>{children}</UiI18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(UiI18nContext);
  if (!context) {
    throw new Error("useI18n must be used within UiLanguageProvider");
  }
  return context;
}
