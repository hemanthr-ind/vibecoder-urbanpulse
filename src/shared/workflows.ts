import type {
  CivicReport,
  OperationalIssueStatus,
  PhysicalIssue,
  UserRole,
} from './types.ts';
import { validateCoordinates } from './geospatial.ts';

const ALLOWED_TRANSITIONS: Record<OperationalIssueStatus, OperationalIssueStatus[]> = {
  PENDING_VERIFICATION: [
    'VERIFIED',
    'REJECTED',
    'NEEDS_ADDITIONAL_EVIDENCE',
    'ASSIGNED',
  ],
  VERIFIED: ['ASSIGNED', 'IN_PROGRESS', 'REJECTED', 'RESOLVED'],
  ASSIGNED: ['IN_PROGRESS', 'RESOLUTION_SUBMITTED', 'VERIFIED', 'REJECTED'],
  IN_PROGRESS: ['RESOLUTION_SUBMITTED', 'RESOLVED', 'NEEDS_ADDITIONAL_EVIDENCE'],
  RESOLUTION_SUBMITTED: ['RESOLVED', 'IN_PROGRESS', 'REOPENED'],
  RESOLVED: ['REOPENED'],
  REOPENED: ['ASSIGNED', 'IN_PROGRESS', 'VERIFIED', 'RESOLVED'],
  REJECTED: ['REOPENED', 'PENDING_VERIFICATION'],
  NEEDS_ADDITIONAL_EVIDENCE: ['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'],
};

export function validateIssueTransition(params: {
  from: OperationalIssueStatus;
  to: OperationalIssueStatus;
  actorRole: UserRole;
}): { allowed: boolean; reason: string | null } {
  if (params.from === params.to) {
    return { allowed: true, reason: null };
  }

  const allowedTargets = ALLOWED_TRANSITIONS[params.from] ?? [];
  if (!allowedTargets.includes(params.to)) {
    return {
      allowed: false,
      reason: `Transition from ${params.from} to ${params.to} is not permitted.`,
    };
  }

  if (params.actorRole === 'CITIZEN') {
    return { allowed: false, reason: 'Citizens cannot modify operational issue status.' };
  }

  if (params.actorRole === 'FIELD_OFFICER') {
    const officerAllowed: OperationalIssueStatus[] = [
      'IN_PROGRESS',
      'RESOLUTION_SUBMITTED',
      'NEEDS_ADDITIONAL_EVIDENCE',
    ];
    if (!officerAllowed.includes(params.to)) {
      return {
        allowed: false,
        reason: `Field officers cannot directly transition an issue to ${params.to}.`,
      };
    }
  }

  return { allowed: true, reason: null };
}

export interface PlatformKpis {
  totalReportsSubmitted: number;
  uniquePhysicalIssues: number;
  pendingIssues: number;
  pendingVerification: number;
  criticalIssues: number;
  highPriorityIssues: number;
  assignedTasks: number;
  inProgressIssues: number;
  resolvedIssues: number;
  potholeIssues: number;
  garbageIssues: number;
  otherCivicCandidates: number;
  uncertainReports: number;
  unlocatedReports: number;
}

export function computePlatformKpis(
  reports: CivicReport[],
  issues: PhysicalIssue[],
): PlatformKpis {
  const unlocatedReports = reports.filter(
    (r) => !validateCoordinates(r.location_observation.latitude, r.location_observation.longitude).valid,
  ).length;

  const uncertainReports = reports.filter(
    (r) =>
      r.human_verification_status === 'UNCERTAIN' ||
      r.ai_analysis?.image_assessment.relevance_status === 'CIVIC_UNCERTAIN',
  ).length;

  return {
    totalReportsSubmitted: reports.length,
    uniquePhysicalIssues: issues.length,
    pendingIssues: issues.filter(
      (i) =>
        i.current_issue_status !== 'RESOLVED' && i.current_issue_status !== 'REJECTED',
    ).length,
    pendingVerification: issues.filter(
      (i) =>
        i.human_verification_status === 'NOT_REVIEWED' ||
        i.human_verification_status === 'REVIEW_RECOMMENDED' ||
        i.human_verification_status === 'REVIEW_REQUIRED' ||
        i.human_verification_status === 'UNDER_REVIEW',
    ).length,
    criticalIssues: issues.filter(
      (i) =>
        i.severity_label === 'CRITICAL' &&
        i.current_issue_status !== 'RESOLVED' &&
        i.current_issue_status !== 'REJECTED',
    ).length,
    highPriorityIssues: issues.filter(
      (i) =>
        (i.priority_assessment.label === 'HIGH' ||
          i.priority_assessment.label === 'CRITICAL') &&
        i.current_issue_status !== 'RESOLVED' &&
        i.current_issue_status !== 'REJECTED',
    ).length,
    assignedTasks: issues.filter((i) => i.current_issue_status === 'ASSIGNED').length,
    inProgressIssues: issues.filter(
      (i) =>
        i.current_issue_status === 'IN_PROGRESS' ||
        i.current_issue_status === 'RESOLUTION_SUBMITTED',
    ).length,
    resolvedIssues: issues.filter((i) => i.current_issue_status === 'RESOLVED').length,
    potholeIssues: issues.filter((i) => i.canonical_category === 'POTHOLE').length,
    garbageIssues: issues.filter((i) => i.canonical_category === 'GARBAGE_OR_WASTE').length,
    otherCivicCandidates: issues.filter(
      (i) => i.canonical_category === 'OTHER_CIVIC_CANDIDATE',
    ).length,
    uncertainReports,
    unlocatedReports,
  };
}
