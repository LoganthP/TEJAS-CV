/**
 * TEJAS-CV — Landing Page Content Configuration
 * 
 * ALL text content for the public landing page is centralized here.
 * The team can edit this file directly to update any copy without touching React components.
 * 
 * Important content guidelines:
 * - Working prototype presented for Smart India Hackathon 2026 (Idea stage).
 * - Uses honest framing: "designed to", "prototype", "our approach", "aims to".
 * - No unvalidated metrics or claims (no accuracy %, deployment counts, or dataset sizes).
 * - Focused specifically on offline AI-integrity assurance for computer vision in defence.
 */


export interface ProblemItem {
  number: string;
  title: string;
  description: string;
}

export interface WorkflowStep {
  step: string;
  title: string;
  action: string;
  description: string;
  tag: string;
}

export interface CapabilityItem {
  id: string;
  number: string;
  title: string;
  description: string;
  badge: string;
}

export interface TechGroup {
  category: string;
  items: string[];
}

export interface InnovationItem {
  number: string;
  title: string;
  description: string;
  highlight: string;
}

export interface ImpactRow {
  traditional: string;
  tejas: string;
}

export const LANDING_CONTENT = {
  nav: {
    links: [
      { id: "hero", label: "Home" },
      { id: "problem", label: "Problem" },
      { id: "solution", label: "Solution" },
      { id: "workflow", label: "Working" },
      { id: "capabilities", label: "Features" },
      { id: "impact", label: "Impact" },
    ],
    loginBtn: "Log in",
    signupBtn: "Request access",
    consoleBtn: "Open console →",
    presenterModeHint: "Presenter Mode (P)",
  },

  hero: {
    title: "TEJAS-CV",
    subtitle: "Trusted Evaluation & Judgement Assurance System for Computer Vision",
    tagline: "DETECT • EXPLAIN • PROVE • DECIDE",
    motto: "From \"Trust me\" to \"Prove it.\"",
    primaryCta: "Explore our idea",
    coreNodes: ["Data", "Model", "Provenance", "Drift"],
  },

  problem: {
    sectionNum: "01",
    sectionLabel: "THE PROBLEM",
    heading: "The challenge we aim to solve",
    theProblemHeading: "The Problem",
    theProblemBody:
      "Defence computer-vision systems increasingly depend on datasets, pretrained models and third-party components whose integrity is assumed rather than verified.",
    whyItMattersHeading: "Why it matters",
    whyItMattersBody:
      "A poisoned dataset, a hidden backdoor or a silently swapped model can make a system fail exactly when it matters, and without evidence nobody can tell what went wrong.",
    challenges: [
      {
        number: "01",
        title: "Unverified Trust Assumptions",
        description: "Datasets and models are trusted on reputation, not verified.",
      },
      {
        number: "02",
        title: "Stealthy Adversarial Attacks",
        description: "Poisoning, backdoors and model substitution are hard to detect by inspection.",
      },
      {
        number: "03",
        title: "Mutable Audit Trails",
        description: "Inference outputs and logs can be altered with no tamper evidence.",
      },
      {
        number: "04",
        title: "Black-Box Decisions & Air-Gap Constraints",
        description: "Decisions lack explainable, auditable evidence, and systems often run fully offline.",
      },
    ] as ProblemItem[],
  },

  solution: {
    sectionNum: "02",
    sectionLabel: "OUR SOLUTION",
    heading: "Introducing TEJAS-CV",
    lead: "An offline assurance layer that verifies the data, the model and the outputs of a computer-vision pipeline, and proves every decision.",
    description:
      "TEJAS-CV sits around an existing vision pipeline without replacing it. It independently examines what goes in and what comes out, then returns Accept, Review or Quarantine, with the reasons and a cryptographic record.",
    flowItems: [
      { label: "DATA", sub: "Datasets & metadata" },
      { label: "MODEL", sub: "ONNX / PyTorch weights" },
      { label: "OUTPUTS", sub: "Inference records" },
    ],
    hubTitle: "TEJAS-CV",
    hubSubtitle: "Offline Assurance Core",
    hubChips: [
      "Integrity checks",
      "Backdoor screening",
      "Provenance",
      "Drift",
      "Explainable evidence",
    ],
    outcomes: [
      { label: "EVIDENCE", sub: "Multi-factor audit trail" },
      { label: "DECISION", sub: "Accept · Review · Quarantine" },
    ],
  },

  workflow: {
    sectionNum: "03",
    sectionLabel: "WORKFLOW",
    heading: "From input to assured decision",
    subtitle: "A 5-stage verification sequence engineered for defense-critical autonomy",
    steps: [
      {
        step: "01",
        title: "INGEST",
        action: "Cryptographic Fingerprinting",
        description: "Datasets, models and inference records are fingerprinted (SHA-256, Merkle root).",
        tag: "FINGERPRINT",
      },
      {
        step: "02",
        title: "ANALYSE",
        action: "Multi-Engine Inspection",
        description: "Four assurance engines run in parallel across data, models, logs, and drift.",
        tag: "PARALLEL SCAN",
      },
      {
        step: "03",
        title: "EXPLAIN",
        action: "Evidence Attribution",
        description: "Every finding carries its reason, evidence, confidence, severity and a recommendation.",
        tag: "EXPLAINABILITY",
      },
      {
        step: "04",
        title: "DECIDE",
        action: "Evidence Fusion",
        description: "Evidence fusion gives Accept, Review or Quarantine based on risk assessment.",
        tag: "VERDICT",
      },
      {
        step: "05",
        title: "PROVE",
        action: "Immutable Sealing",
        description: "The decision is signed and sealed in a hash-chained audit ledger.",
        tag: "LEDGER SEAL",
      },
    ] as WorkflowStep[],
  },

  concept: {
    sectionNum: "04",
    sectionLabel: "PROTOTYPE CONCEPT",
    heading: "TEJAS-CV at a glance",
    subtitle: "An end-to-end architecture overview of our prototype assurance pipeline",
    caption: "Conceptual view of the working prototype.",
    inputs: {
      title: "PIPELINE INPUTS",
      items: [
        { label: "Dataset", detail: "Images, labels, annotations" },
        { label: "Model", detail: "ONNX / PyTorch weights" },
        { label: "Inference records", detail: "Real-time decision streams" },
        { label: "Contributors", detail: "Signatures & origin logs" },
      ],
    },
    engines: [
      { title: "Data Integrity", subtitle: "Label noise & poison check", status: "ONLINE" },
      { title: "Model Integrity", subtitle: "Backdoor & Trojan screening", status: "ONLINE" },
      { title: "Provenance & Tamper", subtitle: "Merkle roots & signature trace", status: "ONLINE" },
      { title: "Distribution Shift", subtitle: "Haze / Night / Sensor drift", status: "ONLINE" },
    ],
    outputs: {
      title: "ASSURED OUTPUTS",
      decisions: ["ACCEPT", "REVIEW", "QUARANTINE"],
      items: [
        "Explainable findings",
        "Signed audit report",
        "Hash-chained ledger",
        "Security alerts",
      ],
    },
  },

  capabilities: {
    sectionNum: "05",
    sectionLabel: "CAPABILITIES",
    heading: "What TEJAS-CV brings",
    subtitle: "Six core pillars engineered for air-gapped defence intelligence systems",
    items: [
      {
        id: "data",
        number: "01",
        title: "Data integrity",
        description: "Finds duplicates, label conflicts, poisoning patterns and suspicious contributors.",
        badge: "DATASET SHIELD",
      },
      {
        id: "model",
        number: "02",
        title: "Model integrity",
        description: "Checks fingerprints, screens for backdoor triggers and detects substitution.",
        badge: "BACKDOOR SCANNER",
      },
      {
        id: "provenance",
        number: "03",
        title: "Provenance & tamper evidence",
        description: "Uses signed manifests, Merkle proofs and a verifiable inference chain.",
        badge: "MERKLE PROOF",
      },
      {
        id: "drift",
        number: "04",
        title: "Drift awareness",
        description: "Separates night, haze or sensor change from attacks; drift is not treated as attack.",
        badge: "ENVIRONMENT ADAPTIVE",
      },
      {
        id: "explainable",
        number: "05",
        title: "Explainable decisions",
        description: "Gives the reason, evidence and recommended action for every finding.",
        badge: "HUMAN-VERIFIABLE",
      },
      {
        id: "airgap",
        number: "06",
        title: "Offline & air-gapped",
        description: "Designed to run with no internet dependency.",
        badge: "ZERO EXTERNAL I/O",
      },
    ] as CapabilityItem[],
  },

  architecture: {
    sectionNum: "06",
    sectionLabel: "ARCHITECTURE",
    heading: "Built as an assurance pipeline",
    subtitle: "End-to-end data flow designed to be explainable in 20 seconds",
    stages: [
      {
        index: "1",
        name: "Data Sources",
        details: "Imagery, pretrained models, ground station telemetry",
        type: "source",
      },
      {
        index: "2",
        name: "Fingerprinting & Feature Extraction",
        details: "Cryptographic SHA-256 hashes & activation statistics",
        type: "process",
      },
      {
        index: "3",
        name: "Parallel Assurance Engines",
        details: "Data · Model · Provenance · Drift screening",
        type: "engine",
      },
      {
        index: "4",
        name: "Evidence Fusion",
        details: "Cross-engine risk weighting & anomalous pattern aggregation",
        type: "process",
      },
      {
        index: "5",
        name: "Verdict Decision",
        details: "ACCEPT · REVIEW · QUARANTINE categorisation",
        type: "decision",
      },
      {
        index: "6",
        name: "Signed Report & Ledger",
        details: "Ed25519 signature & SHA-256 hash-chained immutable block",
        type: "output",
      },
    ],
  },

  technology: {
    sectionNum: "07",
    sectionLabel: "TECHNOLOGY",
    heading: "Powering TEJAS-CV",
    subtitle: "A lightweight, robust and self-contained technology stack",
    groups: [
      {
        category: "Interface",
        items: ["React 19", "Vite", "Tailwind CSS"],
      },
      {
        category: "Analysis",
        items: ["Python", "FastAPI", "NumPy / SciPy", "ONNX Runtime"],
      },
      {
        category: "Trust Layer",
        items: ["SHA-256", "Merkle Trees", "Ed25519 Signatures", "Hash-Chained Ledger"],
      },
      {
        category: "Storage",
        items: ["SQLite (embedded, offline)"],
      },
    ] as TechGroup[],
    disclaimer: "Technology choices may evolve as the prototype matures.",
  },

  innovation: {
    sectionNum: "08",
    sectionLabel: "INNOVATION",
    heading: "Why our approach?",
    subtitle: "Moving beyond traditional heuristic validation into cryptographic assurance",
    callout: "TEJAS-CV is designed not merely to detect, but to explain, prove and decide.",
    cards: [
      {
        number: "01",
        title: "Zero Trust",
        description: "Nothing is trusted by default, not even signed models.",
        highlight: "Continuous verification on every asset",
      },
      {
        number: "02",
        title: "Explainable",
        description: "Every verdict comes with evidence a human can check.",
        highlight: "Root causes, evidence snippets & clear recommendations",
      },
      {
        number: "03",
        title: "Provable",
        description: "Tampering with records is detected and pinpointed.",
        highlight: "Hash-chained Merkle structure seals each audit entry",
      },
      {
        number: "04",
        title: "Deployable Offline",
        description: "Built for disconnected, sensitive environments.",
        highlight: "No cloud dependencies, zero external phone-home",
      },
    ] as InnovationItem[],
  },

  impact: {
    sectionNum: "09",
    sectionLabel: "IMPACT",
    heading: "From assumption to assurance",
    subtitle: "A paradigm shift for mission-critical computer vision pipelines",
    traditionalLabel: "Traditional Pipeline",
    tejasLabel: "TEJAS-CV Approach",
    rows: [
      {
        traditional: "Trust by reputation",
        tejas: "Verify before use",
      },
      {
        traditional: "Manual inspection",
        tejas: "Automated screening",
      },
      {
        traditional: "No tamper evidence",
        tejas: "Cryptographic proof",
      },
      {
        traditional: "Unexplained failures",
        tejas: "Evidence-backed decisions",
      },
    ] as ImpactRow[],
    expectedOutcome:
      "TEJAS-CV aims to give defence stakeholders verifiable confidence in the data, models and outputs their vision systems depend on.",
  },
};
