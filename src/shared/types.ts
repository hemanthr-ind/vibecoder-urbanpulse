export type UserRole = 'CITIZEN' | 'ADMIN' | 'FIELD_OFFICER';

export type SupportedCivicClass = 'POTHOLE' | 'GARBAGE_OR_WASTE';
export type CivicCategory = SupportedCivicClass | 'OTHER_CIVIC_CANDIDATE';

export type RelevanceStatus =
  | 'CIVIC_RELEVANT_SUPPORTED'
  | 'CIVIC_OTHER_CANDIDATE'
  | 'CIVIC_IRRELEVANT'
  | 'CIVIC_UNCERTAIN'
  | 'CIVIC_UNUSABLE';

export type AnalysisMode =
  | 'DETECTOR_AND_VISION'
  | 'VISION_ONLY'
  | 'DETECTOR_ONLY'
  | 'PARTIAL_PIPELINE';

export type AiProcessingStatus =
  | 'NOT_STARTED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED';

export type SeverityLabel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export type PriorityLabel =
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'CRITICAL'
  | 'UNDETERMINED'
  | 'PROVISIONAL_UNDETERMINED';

export type PriorityStatus =
  | 'COMPLETE'
  | 'PROVISIONAL'
  | 'INSUFFICIENT_FACTOR_COVERAGE'
  | 'UNAVAILABLE';

export type LocalizationStatus =
  | 'DETECTOR_NATIVE'
  | 'DETECTOR_TRANSFORMED'
  | 'VALIDATED_GROUNDED_MODEL_OUTPUT'
  | 'MODEL_ESTIMATE_UNVALIDATED'
  | 'NOT_PROVIDED_BY_DETECTOR'
  | 'NOT_AVAILABLE';

export type HumanVerificationStatus =
  | 'NOT_REVIEWED'
  | 'REVIEW_RECOMMENDED'
  | 'REVIEW_REQUIRED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'CORRECTED'
  | 'REJECTED'
  | 'NEEDS_MORE_EVIDENCE'
  | 'UNCERTAIN';

export type OperationalIssueStatus =
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLUTION_SUBMITTED'
  | 'RESOLVED'
  | 'REOPENED'
  | 'REJECTED'
  | 'NEEDS_ADDITIONAL_EVIDENCE';

export type VerificationRecommendationCode =
  | 'NOT_REQUIRED_UNDER_CONFIGURED_POLICY'
  | 'REVIEW_RECOMMENDED'
  | 'MANUAL_VERIFICATION_REQUIRED'
  | 'REJECTED_AS_IRRELEVANT'
  | 'AWAITING_ADDITIONAL_EVIDENCE'
  | 'CATEGORY_SUPPORT_REQUIRED'
  | 'PIPELINE_FAILURE_REQUIRES_RETRY';

export type LocationSource =
  | 'DEVICE_GPS'
  | 'USER_PLACED_PIN'
  | 'USER_CONFIRMED_DEVICE_GPS'
  | 'IMAGE_EXIF_GPS'
  | 'VERIFIED_REVIEWER_CORRECTION'
  | 'TRUSTED_EXTERNAL_GEOCODER'
  | 'MANUAL_ADDRESS_GEOCODE'
  | 'REPORT_LEVEL_LOCATION'
  | 'UNKNOWN';

export type LocationMeaning =
  | 'ISSUE_LOCATION'
  | 'REPORT_OBSERVATION_LOCATION'
  | 'APPROXIMATE_LOCATION'
  | 'UNKNOWN';

export type LocationPrecisionBand =
  | 'HIGH'
  | 'GOOD'
  | 'FAIR'
  | 'LOW'
  | 'POOR'
  | 'UNKNOWN';

export type LocationValidationStatus =
  | 'VALID_EXACT_OR_HIGH_PRECISION'
  | 'VALID_APPROXIMATE'
  | 'PENDING_USER_CONFIRMATION'
  | 'PENDING_HUMAN_REVIEW'
  | 'INVALID_COORDINATE'
  | 'GPS_UNAVAILABLE'
  | 'GPS_ACCURACY_POOR'
  | 'STALE_LOCATION'
  | 'OUTSIDE_CONFIGURED_AREA'
  | 'JURISDICTION_UNVERIFIED'
  | 'UNKNOWN';

export type JurisdictionStatus =
  | 'INSIDE_OPERATING_EXTENT_UNVERIFIED_BOUNDARY'
  | 'OUTSIDE_OPERATING_EXTENT'
  | 'JURISDICTION_UNVERIFIED'
  | 'UNKNOWN';

export type MapMode = 'PINPOINT_REPORT_MAP' | 'SEVERITY_HEATMAP';
export type BasemapStyle = 'NORMAL' | 'SATELLITE' | 'TERRAIN' | 'DARK';
export type MapColorEncoding = 'SEVERITY' | 'CATEGORY';

export interface PriorityWeights {
  severity: number;
  public_impact: number;
  geographical_importance: number;
  independent_corroboration: number;
  time_unresolved: number;
}

export interface SeverityAssessment {
  status: 'ASSESSED' | 'PROVISIONAL' | 'PENDING_CATEGORY_RUBRIC' | 'UNAVAILABLE';
  score: number | null;
  label: SeverityLabel;
  rubric_id: string;
  rubric_version: string;
  dimension_scores: Record<string, number | null>;
  dimension_weights: Record<string, number>;
  available_dimension_coverage: number;
  evidence_summary: string;
  missing_evidence: string[];
  assessment_uncertainty: string;
  human_review_recommended: boolean;
}

export interface PublicImpactAssessment {
  status: 'ASSESSED' | 'PROVISIONAL' | 'UNAVAILABLE';
  score: number | null;
  dimension_scores: Record<string, number | null>;
  dimension_weights: Record<string, number>;
  available_dimension_coverage: number;
  evidence_summary: string;
  verified_context_used: string[];
  unknown_context: string[];
  assessment_uncertainty: string;
}

export interface DetectionRecord {
  detection_id: string;
  source_image_id: string;
  physical_issue_id: string | null;
  class_id: SupportedCivicClass | 'OTHER_CIVIC_CANDIDATE';
  original_detector_class_label: string | null;
  class_display_label: string;
  detection_status:
    | 'ACCEPTED_DETECTION'
    | 'ACCEPTED_REQUIRES_REVIEW'
    | 'BELOW_ACCEPTANCE_THRESHOLD'
    | 'CLASS_UNSUPPORTED'
    | 'LOCALIZATION_INVALID'
    | 'VISUAL_CONTRADICTION'
    | 'MODEL_OUTPUT_INVALID'
    | 'NOT_A_CIVIC_PROBLEM';
  raw_confidence: number | null;
  normalized_confidence: number | null;
  confidence_percent: number | null;
  confidence_band: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';
  calibration_status: 'UNCALIBRATED' | 'CALIBRATED' | 'UNKNOWN' | 'NOT_APPLICABLE';
  localization_status: LocalizationStatus;
  localization_source: LocalizationStatus;
  bounding_box_normalized: [number, number, number, number] | null;
  visible_description: string;
  supporting_evidence: string[];
  counter_evidence: string[];
  severity_assessment: SeverityAssessment;
  public_impact_assessment: PublicImpactAssessment;
  uncertainty_flags: string[];
  verification_status: HumanVerificationStatus;
}

export interface PriorityFactorScores {
  severity: number | null;
  public_impact: number | null;
  geographical_importance: number | null;
  independent_corroboration: number | null;
  time_unresolved: number | null;
}

export interface PriorityAssessment {
  status: PriorityStatus;
  score: number | null;
  label: PriorityLabel;
  is_provisional: boolean;
  formula_id: string;
  formula_version: string;
  factor_scores: PriorityFactorScores;
  factor_weights: PriorityWeights;
  available_weight_coverage: number;
  missing_factors: string[];
  calculation_expression: string;
  calculation_explanation: string;
  safety_review_flag: boolean;
  ranking_eligibility: 'ELIGIBLE' | 'PROVISIONAL_ELIGIBLE' | 'NOT_ELIGIBLE';
  comparability_warnings: string[];
}

export interface AiAnalysisRun {
  analysis_id: string;
  report_id: string;
  schema_version: string;
  analysis_status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'REQUIRES_REVIEW';
  analysis_mode: AnalysisMode;
  started_at: string;
  completed_at: string;
  image_assessment: {
    relevance_status: RelevanceStatus;
    relevance_reason: string;
    image_quality_status: 'GOOD' | 'DEGRADED' | 'POOR' | 'UNUSABLE';
    quality_issues: string[];
    screenshot_or_rephotographed_evidence: boolean;
    image_integrity_status: 'NO_CONCERN_IDENTIFIED' | 'POSSIBLE_IMAGE_INTEGRITY_CONCERN' | 'NOT_EVALUATED';
    user_category_match_status: 'MATCH' | 'DISAGREEMENT' | 'NOT_APPLICABLE';
    user_description_match_status: 'CONSISTENT' | 'CONFLICT' | 'UNVERIFIED' | 'NOT_PROVIDED';
    manual_review_required: boolean;
  };
  detected_classes: SupportedCivicClass[];
  detections: DetectionRecord[];
  other_civic_candidates: Array<{
    candidate_label: string;
    visible_description: string;
    reason_civic_related: string;
    additional_evidence_needed: string;
  }>;
  verification_recommendation: {
    recommendation: VerificationRecommendationCode;
    reason_codes: string[];
    reason_summary: string;
    additional_evidence_requested: string[];
  };
  uncertainty_and_warnings: string[];
  model_metadata: {
    vision_model_name: string | null;
    vision_model_version: string | null;
    detector_name: string | null;
    detector_version: string | null;
    calibration_status: string;
    prompt_version: string;
    severity_rubric_version: string;
    priority_formula_version: string;
  };
  failure_summary?: string | null;
}

export interface LocationObservation {
  location_observation_id: string;
  report_id: string;
  physical_issue_id: string | null;
  latitude: number | null;
  longitude: number | null;
  horizontal_accuracy_meters: number | null;
  coordinate_reference_system: 'EPSG:4326';
  location_source: LocationSource;
  location_meaning: LocationMeaning;
  human_readable_label: string;
  captured_at: string | null;
  recorded_at: string;
  confirmed_by_user: boolean;
  verified_by_authorized_reviewer: boolean;
  validation_status: LocationValidationStatus;
  precision_band: LocationPrecisionBand;
  jurisdiction_status: JurisdictionStatus;
  supersedes_location_observation_id: string | null;
}

export interface EvidenceAsset {
  evidence_id: string;
  report_id: string;
  url: string;
  mime_type: string;
  file_name_safe: string;
  width: number | null;
  height: number | null;
  captured_at: string | null;
  uploaded_at: string;
  kind: 'CITIZEN_REPORT' | 'FIELD_INSPECTION' | 'FIELD_RESOLUTION';
}

export interface HumanOverrideRecord {
  override_id: string;
  reviewer_id: string;
  reviewer_name: string;
  decided_at: string;
  action:
    | 'CONFIRM'
    | 'CORRECT_CLASSIFICATION'
    | 'REJECT'
    | 'REQUEST_EVIDENCE'
    | 'MARK_UNCERTAIN'
    | 'ESCALATE';
  previous_category: CivicCategory;
  new_category: CivicCategory;
  previous_severity_score: number | null;
  new_severity_score: number | null;
  reason: string;
}

export interface PhysicalIssue {
  physical_issue_id: string;
  canonical_category: CivicCategory;
  canonical_summary: string;
  current_issue_status: OperationalIssueStatus;
  human_verification_status: HumanVerificationStatus;
  severity_score: number | null;
  severity_label: SeverityLabel;
  public_impact_score: number | null;
  geographical_importance_score: number | null;
  geographical_importance_status: 'VERIFIED_CONTEXT' | 'UNAVAILABLE' | 'UNKNOWN';
  corroboration_score: number;
  confirmed_independent_report_count: number;
  related_submission_count: number;
  age_score: number | null;
  days_unresolved: number | null;
  priority_assessment: PriorityAssessment;
  authoritative_location: LocationObservation | null;
  location_history: LocationObservation[];
  human_override: HumanOverrideRecord | null;
  assigned_officer_id: string | null;
  assigned_officer_name: string | null;
  assigned_at: string | null;
  due_at: string | null;
  field_notes: Array<{
    note_id: string;
    officer_id: string;
    officer_name: string;
    created_at: string;
    note: string;
    stage: string;
  }>;
  field_evidence: EvidenceAsset[];
  first_reported_at: string;
  last_updated_at: string;
  resolved_at: string | null;
  reopened_at: string | null;
  associated_report_ids: string[];
  safety_review_flag: boolean;
  is_demo_seed: boolean;
}

export interface CivicReport {
  report_id: string;
  report_reference: string;
  submitted_by_user_id: string;
  submitted_by_label: string;
  user_selected_category: CivicCategory;
  description: string;
  additional_info: string;
  location_label: string;
  submitted_at: string;
  updated_at: string;
  ai_processing_status: AiProcessingStatus;
  human_verification_status: HumanVerificationStatus;
  operational_status: OperationalIssueStatus;
  physical_issue_id: string | null;
  evidence_assets: EvidenceAsset[];
  location_observation: LocationObservation;
  ai_analysis: AiAnalysisRun | null;
  timeline: Array<{
    event_id: string;
    step: string;
    status: string;
    actor_label: string;
    occurred_at: string;
    detail: string;
  }>;
  is_demo_seed: boolean;
}

export interface FieldOfficer {
  officer_id: string;
  user_id: string;
  name: string;
  email: string;
  badge_code: string;
  zone: string;
  availability: 'AVAILABLE' | 'ON_FIELD_DUTY' | 'BUSY' | 'OFF_DUTY';
  active_task_count: number;
  completed_task_count: number;
  avg_resolution_hours: number | null;
}

export interface UserAccount {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: string;
  zone?: string;
}

export interface NotificationItem {
  notification_id: string;
  target_role: UserRole | 'ALL';
  recipient_user_id: string | null;
  type: string;
  title: string;
  message: string;
  related_report_id: string | null;
  related_issue_id: string | null;
  created_at: string;
  read: boolean;
}

export interface AuditEntry {
  audit_id: string;
  occurred_at: string;
  actor_id: string;
  actor_role: UserRole | 'SYSTEM';
  actor_name: string;
  action: string;
  entity_type: 'REPORT' | 'ISSUE' | 'USER' | 'OFFICER' | 'CONFIG' | 'AUTH';
  entity_id: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface SystemConfig {
  operating_city: string;
  priority_weights: PriorityWeights;
  minimum_priority_factor_coverage: number;
  age_half_saturation_days: number;
  auto_resolve_on_field_submission: boolean;
  confidence_review_threshold: number;
  formula_version: string;
  severity_rubric_version: string;
}

export interface MapFilterState {
  categories: CivicCategory[];
  severities: SeverityLabel[];
  priorities: PriorityLabel[];
  verificationStatuses: HumanVerificationStatus[];
  operationalStatuses: OperationalIssueStatus[];
  assignedOfficerId: string;
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
  unresolvedOnly: boolean;
}

export interface MapPointFeature {
  feature_id: string;
  feature_type: 'PHYSICAL_ISSUE_POINT' | 'REPORT_OBSERVATION_POINT' | 'APPROXIMATE_LOCATION_POINT';
  physical_issue_id: string | null;
  primary_report_id: string;
  report_reference: string;
  associated_report_ids: string[];
  category: CivicCategory;
  summary: string;
  location_label: string;
  latitude: number;
  longitude: number;
  location_type: LocationMeaning;
  location_source: LocationSource;
  horizontal_accuracy_meters: number | null;
  precision_band: LocationPrecisionBand;
  location_validation_status: LocationValidationStatus;
  jurisdiction_status: JurisdictionStatus;
  severity_score: number | null;
  severity_label: SeverityLabel;
  priority_score: number | null;
  priority_label: PriorityLabel;
  priority_is_provisional: boolean;
  issue_status: OperationalIssueStatus;
  verification_status: HumanVerificationStatus;
  ai_processing_status: AiProcessingStatus;
  report_count: number;
  confirmed_independent_report_count: number;
  days_unresolved: number | null;
  assigned_officer_id: string | null;
  assigned_officer_name: string | null;
  thumbnail_url: string | null;
  submitted_at: string;
  last_updated_at: string;
  safety_review_flag: boolean;
  is_new_pulse: boolean;
  is_demo_seed: boolean;
}

export interface HeatmapCell {
  cell_id: string;
  center_lat: number;
  center_lng: number;
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
  aggregation_method: 'UNIQUE_ISSUE_SEVERITY_CELL';
  resolution_meters_approx: number;
  unique_physical_issue_count: number;
  report_submission_count: number;
  pothole_issue_count: number;
  garbage_issue_count: number;
  other_civic_issue_count: number;
  low_severity_issue_count: number;
  moderate_severity_issue_count: number;
  high_severity_issue_count: number;
  critical_severity_issue_count: number;
  unknown_severity_issue_count: number;
  maximum_severity_score: number | null;
  mean_severity_score: number | null;
  maximum_priority_score: number | null;
  unresolved_issue_count: number;
  verified_issue_count: number;
  unverified_issue_count: number;
  cell_severity_tier: SeverityLabel;
  has_approximate_locations: boolean;
  contributing_issue_ids: string[];
  contributing_report_refs: string[];
}
