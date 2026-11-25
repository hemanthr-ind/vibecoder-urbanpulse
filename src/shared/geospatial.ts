import type {
  CivicCategory,
  CivicReport,
  HeatmapCell,
  JurisdictionStatus,
  LocationPrecisionBand,
  LocationValidationStatus,
  MapFilterState,
  MapPointFeature,
  PhysicalIssue,
  SeverityLabel,
} from './types.ts';

export const TUMAKURU_CONTEXT = {
  canonicalName: 'Tumakuru, Karnataka, India',
  shortName: 'Tumakuru',
  aliases: ['Tumakuru', 'Tumkur', 'Tumakuru City'],
  timezone: 'Asia/Kolkata',
  defaultCenter: { lat: 13.3392, lng: 77.114 },
  defaultZoom: 13,
  // Diagnostic approximate urban extent only (not an official municipal corporation polygon)
  approximateExtent: {
    minLat: 13.285,
    maxLat: 13.405,
    minLng: 77.055,
    maxLng: 77.175,
  },
} as const;

export interface SeverityVisualToken {
  tier: SeverityLabel;
  label: string;
  hex: string;
  fillRgba: string;
  borderHex: string;
  semanticColor: 'GREEN' | 'BLUE' | 'RED' | 'RED_CRITICAL_EMPHASIS' | 'NEUTRAL_GREY';
  criticalEmphasis: boolean;
}

export function getSeverityVisualToken(severity: SeverityLabel): SeverityVisualToken {
  switch (severity) {
    case 'LOW':
      return {
        tier: 'LOW',
        label: 'Low (0–24)',
        hex: '#20C997',
        fillRgba: 'rgba(32, 201, 151, 0.34)',
        borderHex: '#43C98A',
        semanticColor: 'GREEN',
        criticalEmphasis: false,
      };
    case 'MODERATE':
      return {
        tier: 'MODERATE',
        label: 'Moderate (25–49)',
        hex: '#377DFF',
        fillRgba: 'rgba(55, 125, 255, 0.38)',
        borderHex: '#609AFF',
        semanticColor: 'BLUE',
        criticalEmphasis: false,
      };
    case 'HIGH':
      return {
        tier: 'HIGH',
        label: 'High (50–74)',
        hex: '#FF515A',
        fillRgba: 'rgba(255, 81, 90, 0.42)',
        borderHex: '#FF757C',
        semanticColor: 'RED',
        criticalEmphasis: false,
      };
    case 'CRITICAL':
      return {
        tier: 'CRITICAL',
        label: 'Critical (75–100)',
        hex: '#FF3B47',
        fillRgba: 'rgba(255, 59, 71, 0.56)',
        borderHex: '#FF963D',
        semanticColor: 'RED_CRITICAL_EMPHASIS',
        criticalEmphasis: true,
      };
    case 'UNKNOWN':
    default:
      return {
        tier: 'UNKNOWN',
        label: 'Unknown / Unassessed',
        hex: '#7E93AA',
        fillRgba: 'rgba(126, 147, 170, 0.30)',
        borderHex: '#9AADC1',
        semanticColor: 'NEUTRAL_GREY',
        criticalEmphasis: false,
      };
  }
}

export function getCategoryVisualToken(category: CivicCategory): {
  label: string;
  shortLabel: string;
  accentHex: string;
} {
  switch (category) {
    case 'POTHOLE':
      return {
        label: 'Pothole',
        shortLabel: 'Pothole',
        accentHex: '#FF515A',
      };
    case 'GARBAGE_OR_WASTE':
      return {
        label: 'Garbage / Waste',
        shortLabel: 'Waste',
        accentHex: '#20C997',
      };
    case 'OTHER_CIVIC_CANDIDATE':
    default:
      return {
        label: 'Other Civic Candidate',
        shortLabel: 'Other Civic',
        accentHex: '#FF963D',
      };
  }
}

export function validateCoordinates(
  lat: unknown,
  lng: unknown,
): { valid: boolean; latitude: number | null; longitude: number | null; reason: string | null } {
  if (lat === null || lat === undefined || lng === null || lng === undefined || lat === '' || lng === '') {
    return { valid: false, latitude: null, longitude: null, reason: 'GPS_UNAVAILABLE' };
  }
  const latNum = typeof lat === 'number' ? lat : Number(lat);
  const lngNum = typeof lng === 'number' ? lng : Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return { valid: false, latitude: null, longitude: null, reason: 'INVALID_NON_FINITE' };
  }
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return { valid: false, latitude: null, longitude: null, reason: 'OUT_OF_WGS84_BOUNDS' };
  }
  if (Math.abs(latNum) < 0.0001 && Math.abs(lngNum) < 0.0001) {
    return { valid: false, latitude: null, longitude: null, reason: 'NULL_ISLAND_PLACEHOLDER' };
  }
  return { valid: true, latitude: latNum, longitude: lngNum, reason: null };
}

export function classifyGpsPrecisionBand(accuracyMeters: number | null | undefined): LocationPrecisionBand {
  if (accuracyMeters === null || accuracyMeters === undefined || !Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
    return 'UNKNOWN';
  }
  if (accuracyMeters <= 10) return 'HIGH';
  if (accuracyMeters <= 25) return 'GOOD';
  if (accuracyMeters <= 50) return 'FAIR';
  if (accuracyMeters <= 100) return 'LOW';
  return 'POOR';
}

export function checkTumakuruPlausibility(
  latitude: number | null,
  longitude: number | null,
): JurisdictionStatus {
  if (latitude === null || longitude === null) return 'UNKNOWN';
  const ext = TUMAKURU_CONTEXT.approximateExtent;
  const inside =
    latitude >= ext.minLat &&
    latitude <= ext.maxLat &&
    longitude >= ext.minLng &&
    longitude <= ext.maxLng;
  return inside
    ? 'INSIDE_OPERATING_EXTENT_UNVERIFIED_BOUNDARY'
    : 'OUTSIDE_OPERATING_EXTENT';
}

export function deriveLocationValidationStatus(params: {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  jurisdictionStatus: JurisdictionStatus;
}): LocationValidationStatus {
  const check = validateCoordinates(params.latitude, params.longitude);
  if (!check.valid) {
    return check.reason === 'GPS_UNAVAILABLE' ? 'GPS_UNAVAILABLE' : 'INVALID_COORDINATE';
  }
  if (params.jurisdictionStatus === 'OUTSIDE_OPERATING_EXTENT') {
    return 'OUTSIDE_CONFIGURED_AREA';
  }
  const band = classifyGpsPrecisionBand(params.accuracyMeters);
  if (band === 'POOR' || band === 'LOW') return 'GPS_ACCURACY_POOR';
  if (band === 'FAIR' || band === 'UNKNOWN') return 'VALID_APPROXIMATE';
  return 'VALID_EXACT_OR_HIGH_PRECISION';
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function createDefaultMapFilters(): MapFilterState {
  return {
    categories: [],
    severities: [],
    priorities: [],
    verificationStatuses: [],
    operationalStatuses: [],
    assignedOfficerId: '',
    dateFrom: '',
    dateTo: '',
    searchQuery: '',
    unresolvedOnly: false,
  };
}

export function buildMapFeatures(
  issues: PhysicalIssue[],
  reports: CivicReport[],
): {
  features: MapPointFeature[];
  unlocatedCount: number;
  invalidCount: number;
} {
  const features: MapPointFeature[] = [];
  let unlocatedCount = 0;
  let invalidCount = 0;
  const linkedReportIds = new Set<string>();
  const reportMap = new Map<string, CivicReport>(reports.map((r) => [r.report_id, r]));

  const nowMs = Date.now();

  for (const issue of issues) {
    issue.associated_report_ids.forEach((id) => linkedReportIds.add(id));
    const loc = issue.authoritative_location;
    if (!loc) {
      unlocatedCount += 1;
      continue;
    }
    const coordCheck = validateCoordinates(loc.latitude, loc.longitude);
    if (!coordCheck.valid || coordCheck.latitude === null || coordCheck.longitude === null) {
      if (coordCheck.reason === 'GPS_UNAVAILABLE') unlocatedCount += 1;
      else invalidCount += 1;
      continue;
    }

    const primaryReportId = issue.associated_report_ids[0] ?? issue.physical_issue_id;
    const primaryReport = reportMap.get(primaryReportId);
    const featureType =
      loc.location_meaning === 'ISSUE_LOCATION' &&
      (loc.precision_band === 'HIGH' || loc.precision_band === 'GOOD')
        ? 'PHYSICAL_ISSUE_POINT'
        : loc.location_meaning === 'REPORT_OBSERVATION_LOCATION'
          ? 'REPORT_OBSERVATION_POINT'
          : 'APPROXIMATE_LOCATION_POINT';

    const ageHours = (nowMs - Date.parse(issue.first_reported_at)) / (1000 * 60 * 60);
    const isNew = Number.isFinite(ageHours) && ageHours <= 24;

    features.push({
      feature_id: `feat_${issue.physical_issue_id}`,
      feature_type: featureType,
      physical_issue_id: issue.physical_issue_id,
      primary_report_id: primaryReportId,
      report_reference: primaryReport?.report_reference ?? issue.physical_issue_id,
      associated_report_ids: issue.associated_report_ids,
      category: issue.canonical_category,
      summary: issue.canonical_summary,
      location_label: loc.human_readable_label || primaryReport?.location_label || 'Tumakuru',
      latitude: coordCheck.latitude,
      longitude: coordCheck.longitude,
      location_type: loc.location_meaning,
      location_source: loc.location_source,
      horizontal_accuracy_meters: loc.horizontal_accuracy_meters,
      precision_band: loc.precision_band,
      location_validation_status: loc.validation_status,
      jurisdiction_status: loc.jurisdiction_status,
      severity_score: issue.severity_score,
      severity_label: issue.severity_label,
      priority_score: issue.priority_assessment.score,
      priority_label: issue.priority_assessment.label,
      priority_is_provisional: issue.priority_assessment.is_provisional,
      issue_status: issue.current_issue_status,
      verification_status: issue.human_verification_status,
      ai_processing_status: primaryReport?.ai_processing_status ?? 'COMPLETED',
      report_count: issue.related_submission_count,
      confirmed_independent_report_count: issue.confirmed_independent_report_count,
      days_unresolved: issue.days_unresolved,
      assigned_officer_id: issue.assigned_officer_id,
      assigned_officer_name: issue.assigned_officer_name,
      thumbnail_url: primaryReport?.evidence_assets[0]?.url ?? null,
      submitted_at: issue.first_reported_at,
      last_updated_at: issue.last_updated_at,
      safety_review_flag: issue.safety_review_flag,
      is_new_pulse: isNew || issue.severity_label === 'CRITICAL',
      is_demo_seed: issue.is_demo_seed,
    });
  }

  // Include unlinked reports (e.g. AI pending or failed, or unlinked observation) so pending reports remain visible
  for (const report of reports) {
    if (linkedReportIds.has(report.report_id)) continue;
    const loc = report.location_observation;
    const coordCheck = validateCoordinates(loc.latitude, loc.longitude);
    if (!coordCheck.valid || coordCheck.latitude === null || coordCheck.longitude === null) {
      if (coordCheck.reason === 'GPS_UNAVAILABLE') unlocatedCount += 1;
      else invalidCount += 1;
      continue;
    }

    features.push({
      feature_id: `feat_${report.report_id}`,
      feature_type: 'REPORT_OBSERVATION_POINT',
      physical_issue_id: report.physical_issue_id,
      primary_report_id: report.report_id,
      report_reference: report.report_reference,
      associated_report_ids: [report.report_id],
      category: report.user_selected_category,
      summary: report.description || 'Pending AI visual assessment',
      location_label: report.location_label || loc.human_readable_label || 'Tumakuru',
      latitude: coordCheck.latitude,
      longitude: coordCheck.longitude,
      location_type: loc.location_meaning,
      location_source: loc.location_source,
      horizontal_accuracy_meters: loc.horizontal_accuracy_meters,
      precision_band: loc.precision_band,
      location_validation_status: loc.validation_status,
      jurisdiction_status: loc.jurisdiction_status,
      severity_score: null,
      severity_label: 'UNKNOWN',
      priority_score: null,
      priority_label: 'UNDETERMINED',
      priority_is_provisional: false,
      issue_status: report.operational_status,
      verification_status: report.human_verification_status,
      ai_processing_status: report.ai_processing_status,
      report_count: 1,
      confirmed_independent_report_count: 1,
      days_unresolved: 0,
      assigned_officer_id: null,
      assigned_officer_name: null,
      thumbnail_url: report.evidence_assets[0]?.url ?? null,
      submitted_at: report.submitted_at,
      last_updated_at: report.updated_at,
      safety_review_flag: false,
      is_new_pulse: true,
      is_demo_seed: report.is_demo_seed,
    });
  }

  return { features, unlocatedCount, invalidCount };
}

export function filterMapFeatures(
  features: MapPointFeature[],
  filters: MapFilterState,
): MapPointFeature[] {
  const query = filters.searchQuery.trim().toLowerCase();

  return features.filter((feat) => {
    if (filters.categories.length > 0 && !filters.categories.includes(feat.category)) {
      return false;
    }
    if (filters.severities.length > 0 && !filters.severities.includes(feat.severity_label)) {
      return false;
    }
    if (filters.priorities.length > 0 && !filters.priorities.includes(feat.priority_label)) {
      return false;
    }
    if (
      filters.verificationStatuses.length > 0 &&
      !filters.verificationStatuses.includes(feat.verification_status)
    ) {
      return false;
    }
    if (
      filters.operationalStatuses.length > 0 &&
      !filters.operationalStatuses.includes(feat.issue_status)
    ) {
      return false;
    }
    if (filters.unresolvedOnly && (feat.issue_status === 'RESOLVED' || feat.issue_status === 'REJECTED')) {
      return false;
    }
    if (filters.assignedOfficerId && feat.assigned_officer_id !== filters.assignedOfficerId) {
      return false;
    }
    if (filters.dateFrom) {
      const fromMs = Date.parse(filters.dateFrom);
      if (Number.isFinite(fromMs) && Date.parse(feat.submitted_at) < fromMs) return false;
    }
    if (filters.dateTo) {
      const toMs = Date.parse(filters.dateTo) + 86400000;
      if (Number.isFinite(toMs) && Date.parse(feat.submitted_at) > toMs) return false;
    }
    if (query) {
      const haystack = [
        feat.report_reference,
        feat.physical_issue_id ?? '',
        feat.location_label,
        feat.summary,
        feat.category,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

const SEVERITY_RANK: Record<SeverityLabel, number> = {
  UNKNOWN: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function getCellSizeMetersForZoom(zoom: number): number {
  if (zoom >= 15) return 150;
  if (zoom >= 13) return 300;
  return 600;
}

export function aggregateSeverityHeatmap(
  features: MapPointFeature[],
  cellSizeMeters = 300,
): HeatmapCell[] {
  if (features.length === 0) return [];

  // Approximate degree step around Tumakuru latitude (~13.34 deg)
  const latStep = cellSizeMeters / 111320;
  const lngStep = cellSizeMeters / (111320 * Math.cos((TUMAKURU_CONTEXT.defaultCenter.lat * Math.PI) / 180));

  const buckets = new Map<string, { row: number; col: number; items: MapPointFeature[] }>();

  for (const feat of features) {
    const row = Math.floor(feat.latitude / latStep);
    const col = Math.floor(feat.longitude / lngStep);
    const key = `cell_${cellSizeMeters}m_${row}_${col}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.items.push(feat);
    } else {
      buckets.set(key, { row, col, items: [feat] });
    }
  }

  const cells: HeatmapCell[] = [];

  for (const [cellId, bucket] of buckets.entries()) {
    const south = bucket.row * latStep;
    const north = (bucket.row + 1) * latStep;
    const west = bucket.col * lngStep;
    const east = (bucket.col + 1) * lngStep;

    let potholeCount = 0;
    let garbageCount = 0;
    let otherCount = 0;
    let lowCount = 0;
    let modCount = 0;
    let highCount = 0;
    let critCount = 0;
    let unknownCount = 0;
    let unresolvedCount = 0;
    let verifiedCount = 0;
    let unverifiedCount = 0;
    let reportSubmissions = 0;
    let hasApprox = false;

    const validSeverities: number[] = [];
    const validPriorities: number[] = [];
    let highestTier: SeverityLabel = 'UNKNOWN';

    for (const item of bucket.items) {
      reportSubmissions += item.report_count;
      if (item.category === 'POTHOLE') potholeCount += 1;
      else if (item.category === 'GARBAGE_OR_WASTE') garbageCount += 1;
      else otherCount += 1;

      if (item.severity_label === 'LOW') lowCount += 1;
      else if (item.severity_label === 'MODERATE') modCount += 1;
      else if (item.severity_label === 'HIGH') highCount += 1;
      else if (item.severity_label === 'CRITICAL') critCount += 1;
      else unknownCount += 1;

      if (SEVERITY_RANK[item.severity_label] > SEVERITY_RANK[highestTier]) {
        highestTier = item.severity_label;
      }

      if (item.severity_score !== null) validSeverities.push(item.severity_score);
      if (item.priority_score !== null) validPriorities.push(item.priority_score);

      if (item.issue_status !== 'RESOLVED' && item.issue_status !== 'REJECTED') {
        unresolvedCount += 1;
      }
      if (item.verification_status === 'VERIFIED' || item.verification_status === 'CORRECTED') {
        verifiedCount += 1;
      } else {
        unverifiedCount += 1;
      }
      if (item.feature_type !== 'PHYSICAL_ISSUE_POINT') {
        hasApprox = true;
      }
    }

    const maxSev = validSeverities.length > 0 ? Math.max(...validSeverities) : null;
    const meanSev =
      validSeverities.length > 0
        ? Math.round((validSeverities.reduce((a, b) => a + b, 0) / validSeverities.length) * 10) / 10
        : null;
    const maxPri = validPriorities.length > 0 ? Math.max(...validPriorities) : null;

    cells.push({
      cell_id: cellId,
      center_lat: (south + north) / 2,
      center_lng: (west + east) / 2,
      bounds: { south, west, north, east },
      aggregation_method: 'UNIQUE_ISSUE_SEVERITY_CELL',
      resolution_meters_approx: cellSizeMeters,
      unique_physical_issue_count: bucket.items.length,
      report_submission_count: reportSubmissions,
      pothole_issue_count: potholeCount,
      garbage_issue_count: garbageCount,
      other_civic_issue_count: otherCount,
      low_severity_issue_count: lowCount,
      moderate_severity_issue_count: modCount,
      high_severity_issue_count: highCount,
      critical_severity_issue_count: critCount,
      unknown_severity_issue_count: unknownCount,
      maximum_severity_score: maxSev,
      mean_severity_score: meanSev,
      maximum_priority_score: maxPri,
      unresolved_issue_count: unresolvedCount,
      verified_issue_count: verifiedCount,
      unverified_issue_count: unverifiedCount,
      cell_severity_tier: highestTier,
      has_approximate_locations: hasApprox,
      contributing_issue_ids: bucket.items.map((i) => i.physical_issue_id ?? i.primary_report_id),
      contributing_report_refs: bucket.items.map((i) => i.report_reference),
    });
  }

  return cells;
}
