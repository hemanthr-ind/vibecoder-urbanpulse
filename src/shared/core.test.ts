import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAgeScore,
  calculateCorroborationScore,
  calculatePriorityAssessment,
  getPriorityLabel,
  getSeverityLabel,
  validateBoundingBoxNormalized,
} from './aiEngine.ts';
import {
  aggregateSeverityHeatmap,
  checkTumakuruPlausibility,
  classifyGpsPrecisionBand,
  filterMapFeatures,
  getSeverityVisualToken,
  haversineDistanceMeters,
  validateCoordinates,
} from './geospatial.ts';
import { validateIssueTransition } from './workflows.ts';
import type { MapPointFeature } from './types.ts';

test('Priority formula computes exact 5-factor weighted score when all factors are present', () => {
  const result = calculatePriorityAssessment({
    factors: {
      severity: 80,
      public_impact: 70,
      geographical_importance: 60,
      independent_corroboration: 40,
      time_unresolved: 50,
    },
  });
  // (80*0.35) + (70*0.25) + (60*0.15) + (40*0.15) + (50*0.10) = 28 + 17.5 + 9 + 6 + 5 = 65.5
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.is_provisional, false);
  assert.equal(result.available_weight_coverage, 1);
  assert.equal(result.score, 65.5);
  assert.equal(result.label, 'HIGH');
});

test('Priority missing-factor policy normalizes provisional score when coverage >= 60%', () => {
  const result = calculatePriorityAssessment({
    factors: {
      severity: 80,
      public_impact: 60,
      geographical_importance: null,
      independent_corroboration: 40,
      time_unresolved: null,
    },
  });
  // Available weights: 35 + 25 + 15 = 75% (0.75 >= 0.60)
  // Weighted sum: 80*35 + 60*25 + 40*15 = 2800 + 1500 + 600 = 4900 / 75 = 65.333 -> 65.3
  assert.equal(result.status, 'PROVISIONAL');
  assert.equal(result.is_provisional, true);
  assert.equal(result.available_weight_coverage, 0.75);
  assert.deepEqual(result.missing_factors, ['geographical_importance', 'time_unresolved']);
  assert.equal(result.score, 65.3);
  assert.equal(result.label, 'HIGH');
});

test('Priority returns null when coverage < 60% and never replaces missing factors with zero', () => {
  const result = calculatePriorityAssessment({
    factors: {
      severity: 90,
      public_impact: null,
      geographical_importance: null,
      independent_corroboration: 20,
      time_unresolved: null,
    },
  });
  // Available weights: 35 + 15 = 50% (< 60%)
  assert.equal(result.status, 'INSUFFICIENT_FACTOR_COVERAGE');
  assert.equal(result.score, null);
  assert.equal(result.label, 'UNDETERMINED');
  assert.equal(result.ranking_eligibility, 'NOT_ELIGIBLE');
});

test('Severity & Priority bands match specification exactly', () => {
  assert.equal(getSeverityLabel(0), 'LOW');
  assert.equal(getSeverityLabel(24), 'LOW');
  assert.equal(getSeverityLabel(25), 'MODERATE');
  assert.equal(getSeverityLabel(49), 'MODERATE');
  assert.equal(getSeverityLabel(50), 'HIGH');
  assert.equal(getSeverityLabel(74), 'HIGH');
  assert.equal(getSeverityLabel(75), 'CRITICAL');
  assert.equal(getSeverityLabel(null), 'UNKNOWN');
  assert.equal(getPriorityLabel(null), 'UNDETERMINED');
});

test('Age score uses diminishing returns and stops when resolved', () => {
  const open = calculateAgeScore({
    startTimestamp: '2026-11-10T10:00:00Z',
    evaluationTimestamp: '2026-11-24T10:00:00Z',
    isResolved: false,
  });
  assert.equal(open.daysUnresolved, 14);
  assert.equal(open.ageScore, 50);

  const resolved = calculateAgeScore({
    startTimestamp: '2026-11-10T10:00:00Z',
    evaluationTimestamp: '2026-11-24T10:00:00Z',
    isResolved: true,
  });
  assert.equal(resolved.ageScore, null);
});

test('Corroboration score follows band mapping and rejects negative counts', () => {
  assert.equal(calculateCorroborationScore(0), 0);
  assert.equal(calculateCorroborationScore(1), 20);
  assert.equal(calculateCorroborationScore(2), 40);
  assert.equal(calculateCorroborationScore(4), 60);
  assert.equal(calculateCorroborationScore(7), 80);
  assert.equal(calculateCorroborationScore(12), 100);
  assert.equal(calculateCorroborationScore(-1), null);
});

test('Bounding box validation rejects inverted or out-of-range coordinates', () => {
  assert.deepEqual(validateBoundingBoxNormalized([0.1, 0.2, 0.8, 0.9]), [0.1, 0.2, 0.8, 0.9]);
  assert.equal(validateBoundingBoxNormalized([-0.1, 0.2, 0.8, 0.9]), null);
  assert.equal(validateBoundingBoxNormalized([0.8, 0.2, 0.3, 0.9]), null);
  assert.equal(validateBoundingBoxNormalized([0.1, 0.2, 0.1, 0.9]), null);
});

test('Geospatial coordinate validation & Tumakuru plausibility check', () => {
  assert.equal(validateCoordinates(13.3392, 77.114).valid, true);
  assert.equal(validateCoordinates(95, 77.114).valid, false);
  assert.equal(validateCoordinates(0, 0).valid, false);
  assert.equal(validateCoordinates(null, 77.114).reason, 'GPS_UNAVAILABLE');
  assert.equal(
    checkTumakuruPlausibility(13.3392, 77.114),
    'INSIDE_OPERATING_EXTENT_UNVERIFIED_BOUNDARY',
  );
  assert.equal(checkTumakuruPlausibility(12.9716, 77.5946), 'OUTSIDE_OPERATING_EXTENT');
  assert.equal(classifyGpsPrecisionBand(8), 'HIGH');
  assert.equal(classifyGpsPrecisionBand(120), 'POOR');
  assert.ok(haversineDistanceMeters(13.3392, 77.114, 13.3482, 77.114) > 900);
});

test('Severity colour mapping obeys Green/Blue/Red/Neutral Grey rule', () => {
  assert.equal(getSeverityVisualToken('LOW').semanticColor, 'GREEN');
  assert.equal(getSeverityVisualToken('MODERATE').semanticColor, 'BLUE');
  assert.equal(getSeverityVisualToken('HIGH').semanticColor, 'RED');
  assert.equal(getSeverityVisualToken('CRITICAL').semanticColor, 'RED_CRITICAL_EMPHASIS');
  assert.equal(getSeverityVisualToken('UNKNOWN').semanticColor, 'NEUTRAL_GREY');
});

test('Heatmap aggregation keeps critical issue visible and unknown-only cells neutral grey', () => {
  const baseFeature: MapPointFeature = {
    feature_id: 'f1',
    feature_type: 'PHYSICAL_ISSUE_POINT',
    physical_issue_id: 'iss-1',
    primary_report_id: 'rep-1',
    report_reference: 'UP-001',
    associated_report_ids: ['rep-1'],
    category: 'POTHOLE',
    summary: 'Test pothole',
    location_label: 'B.H. Road',
    latitude: 13.3392,
    longitude: 77.114,
    location_type: 'ISSUE_LOCATION',
    location_source: 'USER_PLACED_PIN',
    horizontal_accuracy_meters: 8,
    precision_band: 'HIGH',
    location_validation_status: 'VALID_EXACT_OR_HIGH_PRECISION',
    jurisdiction_status: 'INSIDE_OPERATING_EXTENT_UNVERIFIED_BOUNDARY',
    severity_score: 18,
    severity_label: 'LOW',
    priority_score: 20,
    priority_label: 'LOW',
    priority_is_provisional: false,
    issue_status: 'VERIFIED',
    verification_status: 'VERIFIED',
    ai_processing_status: 'COMPLETED',
    report_count: 1,
    confirmed_independent_report_count: 1,
    days_unresolved: 2,
    assigned_officer_id: null,
    assigned_officer_name: null,
    thumbnail_url: null,
    submitted_at: '2026-11-20T10:00:00Z',
    last_updated_at: '2026-11-20T10:00:00Z',
    safety_review_flag: false,
    is_new_pulse: false,
    is_demo_seed: true,
  };

  const critFeature: MapPointFeature = {
    ...baseFeature,
    feature_id: 'f2',
    physical_issue_id: 'iss-2',
    primary_report_id: 'rep-2',
    report_reference: 'UP-002',
    severity_score: 88,
    severity_label: 'CRITICAL',
  };

  const unknownFeature: MapPointFeature = {
    ...baseFeature,
    feature_id: 'f3',
    physical_issue_id: 'iss-3',
    primary_report_id: 'rep-3',
    report_reference: 'UP-003',
    latitude: 13.36,
    longitude: 77.13,
    severity_score: null,
    severity_label: 'UNKNOWN',
  };

  const cells = aggregateSeverityHeatmap([baseFeature, critFeature, unknownFeature], 300);
  assert.equal(cells.length, 2);
  const firstCell = cells.find((c) => c.unique_physical_issue_count === 2);
  assert.ok(firstCell);
  assert.equal(firstCell.cell_severity_tier, 'CRITICAL');
  assert.equal(firstCell.low_severity_issue_count, 1);
  assert.equal(firstCell.critical_severity_issue_count, 1);

  const secondCell = cells.find((c) => c.unique_physical_issue_count === 1);
  assert.ok(secondCell);
  assert.equal(secondCell.cell_severity_tier, 'UNKNOWN');
});

test('Shared map filter applies consistently across categories and unresolved status', () => {
  const f1: MapPointFeature = {
    feature_id: 'f1',
    feature_type: 'PHYSICAL_ISSUE_POINT',
    physical_issue_id: 'iss-1',
    primary_report_id: 'rep-1',
    report_reference: 'UP-001',
    associated_report_ids: ['rep-1'],
    category: 'POTHOLE',
    summary: 'Deep pothole',
    location_label: 'B.H. Road',
    latitude: 13.3392,
    longitude: 77.114,
    location_type: 'ISSUE_LOCATION',
    location_source: 'USER_PLACED_PIN',
    horizontal_accuracy_meters: 8,
    precision_band: 'HIGH',
    location_validation_status: 'VALID_EXACT_OR_HIGH_PRECISION',
    jurisdiction_status: 'INSIDE_OPERATING_EXTENT_UNVERIFIED_BOUNDARY',
    severity_score: 82,
    severity_label: 'CRITICAL',
    priority_score: 79,
    priority_label: 'CRITICAL',
    priority_is_provisional: false,
    issue_status: 'ASSIGNED',
    verification_status: 'VERIFIED',
    ai_processing_status: 'COMPLETED',
    report_count: 2,
    confirmed_independent_report_count: 2,
    days_unresolved: 4,
    assigned_officer_id: 'off-1',
    assigned_officer_name: 'Ravi Kumar',
    thumbnail_url: null,
    submitted_at: '2026-11-20T10:00:00Z',
    last_updated_at: '2026-11-20T10:00:00Z',
    safety_review_flag: true,
    is_new_pulse: true,
    is_demo_seed: true,
  };

  const f2: MapPointFeature = {
    ...f1,
    feature_id: 'f2',
    physical_issue_id: 'iss-2',
    category: 'GARBAGE_OR_WASTE',
    issue_status: 'RESOLVED',
  };

  const filtered = filterMapFeatures([f1, f2], {
    categories: ['POTHOLE'],
    severities: [],
    priorities: [],
    verificationStatuses: [],
    operationalStatuses: [],
    assignedOfficerId: '',
    dateFrom: '',
    dateTo: '',
    searchQuery: '',
    unresolvedOnly: true,
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].physical_issue_id, 'iss-1');
});

test('Workflow transition rules enforce RBAC boundaries', () => {
  assert.equal(
    validateIssueTransition({ from: 'PENDING_VERIFICATION', to: 'VERIFIED', actorRole: 'CITIZEN' }).allowed,
    false,
  );
  assert.equal(
    validateIssueTransition({ from: 'ASSIGNED', to: 'RESOLVED', actorRole: 'FIELD_OFFICER' }).allowed,
    false,
  );
  assert.equal(
    validateIssueTransition({ from: 'ASSIGNED', to: 'RESOLUTION_SUBMITTED', actorRole: 'FIELD_OFFICER' }).allowed,
    true,
  );
  assert.equal(
    validateIssueTransition({ from: 'RESOLUTION_SUBMITTED', to: 'RESOLVED', actorRole: 'ADMIN' }).allowed,
    true,
  );
});
