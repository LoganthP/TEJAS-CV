export type Decision = "ACCEPT" | "REVIEW" | "QUARANTINE";
export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EngineName = "data" | "model" | "provenance" | "drift";
export type Stage = "QUEUED" | "LOADING" | "FINGERPRINTING" | "FEATURE_EXTRACTION" | "MODEL_LOADING"
  | "PARALLEL_ANALYSIS" | "FUSION" | "DECISION" | "AUDIT" | "REPORT" | "COMPLETED" | "FAILED";

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "operator" | "client" | "user";
  status?: "pending" | "active" | "rejected";
  requested_role?: "admin" | "operator" | "client" | null;
  request_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  email?: string | null;
  unit?: string | null;
  role_request?: "admin" | "operator" | "client" | null;
  role_request_note?: string | null;
  role_request_at?: string | null;
  type?: "access" | "role_change";
  current_role?: string | null;
  note?: string | null;
  requested_at?: string | null;
  disabled: boolean;
  created_at: string;
  created_by?: string;
  last_login?: string;
  last_login_at?: string;
  permissions?: Permissions;
}

export interface AuthStatus {
  auth_required: boolean;
  setup_required: boolean;
  self_signup: boolean;
  user: User | null;
}

export interface Permissions {
  view: boolean;
  run_assessments: boolean;
  run_inference: boolean;
  verify: boolean;
  ingest_data: boolean;
  upload_models: boolean;
  build_baselines: boolean;
  train_models: boolean;
  benchmarks: boolean;
  approve_models: boolean;
  attack_lab: boolean;
  register_contributors: boolean;
  manage_users: boolean;
}

export type MeResponse = User;

export interface Job {
  id: string;
  label: string | null;
  dataset_id: string | null;
  model_id: string | null;
  baseline_id: string | null;
  trusted_model: string | null;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  stage: Stage;
  progress: number;
  risk_score: number | null;
  confidence: number | null;
  decision: Decision | null;
  engine_scores: Record<EngineName, number> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_by?: string | null;
}

export interface JobSummary extends Job {
  severity_counts: Record<Severity, number>;
  primary_reasons: string[];
  rules_fired: { rule: string; effect: string; reason: string }[];
  recommended_action: string | null;
  coverage: { ratio?: number; executed?: number; unavailable?: number };
}

export interface Finding {
  id: number;
  job_id: string;
  engine: EngineName;
  finding_type: string;
  severity: Severity;
  confidence: number;
  score: number;
  title: string;
  reason: string;
  evidence: Record<string, any> | null;
  recommendation: string;
  subject: string;
  finding_hash: string;
  job_label?: string | null;
}

export interface Check {
  name: string;
  status: "PASSED" | "FLAGGED" | "SKIPPED" | "UNAVAILABLE" | "ERROR";
  detail: string;
}

export interface EvBase {
  seq: number;
  job_id: string;
  ts: string;
  stage?: Stage;
  progress?: number;
  message?: string;
}

export type JobEvent =
  | (EvBase & { type: "queued" })
  | (EvBase & { type: "stage"; decision?: Decision; risk_score?: number; confidence?: number })
  | (EvBase & { type: "engine_progress"; engine: EngineName; engine_progress: number })
  | (EvBase & {
      type: "engine_complete";
      engine: EngineName;
      duration_s: number;
      error: string | null;
      findings: { type: string; severity: Severity; title: string; confidence: number }[];
      checks: Check[];
    })
  | (EvBase & {
      type: "complete";
      decision: Decision;
      risk_score: number;
      confidence: number;
      engine_scores: Record<EngineName, number>;
      audit_block: number;
    })
  | (EvBase & { type: "failed"; error?: string })
  | (EvBase & { type: "error"; message?: string });

export interface Asset {
  id: string;
  asset_type: "dataset" | "model";
  name: string;
  contributor: string;
  sha256: string;
  size: number;
  signed: boolean;
  status: string;
  meta: Record<string, any>;
  created_at: string;
  path?: string;
  uploaded_by?: string;
}

export interface DatasetSample {
  id: number;
  relpath: string;
  label: string;
  contributor: string;
  sha256: string;
  phash?: string;
  readable: boolean;
  error?: string | null;
  stats?: Record<string, any>;
  width?: number;
  height?: number;
}

export interface AuditBlock {
  index: number;
  timestamp: string;
  event_type: string;
  subject: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  merkle_root: string | null;
  leaf_count: number;
  previous_hash: string;
  block_hash: string;
  signature: string;
}

export interface ChainVerification {
  valid: boolean;
  length: number;
  first_invalid_index: number | null;
  head_hash: string | null;
  verified_at: string;
  blocks: {
    index: number;
    event_type: string;
    subject: string;
    timestamp: string;
    block_hash: string;
    previous_hash: string;
    merkle_root: string | null;
    status: "VALID" | "TAMPERED" | "UNTRUSTED_DOWNSTREAM";
    issues: string[];
  }[];
}

export interface InferenceRecord {
  id: string;
  seq: number;
  model_asset_id: string;
  model_hash: string;
  input_hash: string;
  output: {
    top_class: string;
    confidence: number;
    probabilities: Record<string, number>;
    [k: string]: unknown;
  };
  output_hash: string;
  timestamp: string;
  nonce: string;
  previous_hash: string;
  record_hash: string;
  signature: string;
  attestations: number;
}

export interface InferenceChainVerification {
  valid: boolean;
  length: number;
  first_invalid_seq: number | null;
  head_hash: string | null;
  verified_at: string;
  records: {
    id: string;
    seq: number;
    timestamp: string;
    record_hash: string;
    previous_hash: string;
    status: "VALID" | "TAMPERED" | "UNTRUSTED_DOWNSTREAM";
    issues: string[];
  }[];
}

export interface Contributor {
  id: string;
  name: string;
  public_key: string;
  organisation: string | null;
  created_at: string;
  private_key_once?: string;
  warning?: string;
}

export interface TrustedModel {
  id: string;
  asset_id: string;
  name: string;
  sha256: string;
  registered_at: string;
}

export interface Baseline {
  id: string;
  name: string;
  dataset_id: string;
  features_path: string;
  created_at: string;
}

export interface SystemStatus {
  system: string;
  version: string;
  mode: string;
  external_network_dependencies: string[];
  embedder: string;
  embedder_note: string;
  adapters: { onnx: boolean; onnxruntime: boolean; torch: boolean };
  signing: { algorithm: string; key_id: string; public_key: string };
  audit_ledger: { valid: boolean; length: number; head: string | null };
  fusion: {
    weights: Record<EngineName, number>;
    review_at: number;
    quarantine_at: number;
  };
  health: "SECURE" | "COMPROMISED";
  limits?: {
    max_archive_bytes: number;
    max_files: number;
    max_analysis_samples: number;
    accepted_image_types: string[];
  };
}

export interface TestPackCase {
  scale: string;
  id: string;
  name: string;
  expected: string | string[];
  why: string;
  images: number;
  zip_exists: boolean;
}

export interface DashboardSummary {
  counts: {
    datasets: number;
    models: number;
    images: number;
    inferences: number;
    findings: number;
    jobs: number;
    contributors: number;
    trusted_models: number;
    audit_blocks: number;
  };
  active_jobs: Job[];
  latest_job: Job | null;
  decisions: Record<Decision, number>;
  severity_counts: Record<Severity, number>;
  recent_findings: Finding[];
  asset_status: Record<string, number>;
}

export interface Scenario {
  name: string;
  title: string;
  story: string;
  dataset: string;
  model: string;
  expect: Decision;
  why: string;
}

export interface MerkleProofResponse {
  sample: string;
  leaf_sha256: string;
  leaf_index: number;
  proof: { position: "left" | "right"; hash: string }[];
  merkle_root: string;
  verified: boolean;
}

export interface ProvenanceGraphData {
  nodes: {
    id: string;
    type: string;
    data: {
      label: string;
      status: "ok" | "warning" | "danger" | "pending";
      [key: string]: any;
    };
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    label?: string;
    data?: any;
  }[];
}

export interface SampleDetails {
  general: {
    filename: string;
    relpath: string;
    label: string;
    dataset_id: string;
    dataset_name: string;
    size_bytes: number;
    format: string | null;
    width: number;
    height: number;
    mode: string | null;
    source_modified_at: string | null;
    ingested_at: string | null;
    uploaded_by: { username: string; display_name: string; role: string | null; kind: string } | null;
    contributor: string;
  };
  signatures: {
    sha256: string;
    sha256_recomputed_now: string | null;
    file_unchanged: boolean;
    merkle_root: string;
    merkle_proof: { position: "left" | "right"; hash: string }[];
    merkle_verified: boolean;
    manifest_present: boolean;
    listed_in_manifest: boolean;
    manifest_hash_matches: boolean;
    manifest_signer: string | null;
    manifest_signature_valid: boolean;
    signer_key_fingerprint: string | null;
  };
  security: {
    dataset_status: string;
    uploaded_by: { username: string; display_name: string; role: string | null; kind: string } | null;
    ingested_at: string | null;
    visible_to_roles: string[];
    findings: {
      job_id: string;
      decision: string;
      time: string | null;
      reasons: string[];
    }[];
  };
  details: {
    exif: {
      DateTimeOriginal?: string | null;
      Make?: string | null;
      Model?: string | null;
      Software?: string | null;
      gps_present?: boolean;
    } | null;
    stats: {
      brightness?: number;
      contrast?: number;
      saturation?: number;
      blur?: number;
      haze?: number;
      edge_density?: number;
      [key: string]: any;
    };
    phash: string | null;
    sample_id: number;
  };
  history: {
    same_file_elsewhere: {
      dataset_id: string;
      dataset_name: string;
      relpath: string;
      label: string;
      ingested_at: string | null;
    }[];
    near_duplicates: {
      dataset_id: string;
      relpath: string;
      sample_id: number;
      distance: number;
    }[];
    demo_tampered: boolean;
  };
}
