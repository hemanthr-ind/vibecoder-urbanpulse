import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { verifySessionToken, type SessionPayload } from './auth.ts';
import type { StoredUser, UrbanPulseDatabase } from './seedData.ts';
import {
  calculateAgeScore,
  calculateCorroborationScore,
  calculatePriorityAssessment,
  getSeverityLabel,
} from '../src/shared/aiEngine.ts';
import { createDefaultMapFilters } from '../src/shared/geospatial.ts';
import type {
  AuditEntry,
  CivicCategory,
  HumanVerificationStatus,
  MapFilterState,
  NotificationItem,
  OperationalIssueStatus,
  PhysicalIssue,
  PriorityLabel,
  SeverityLabel,
  SystemConfig,
  UserAccount,
  UserRole,
} from '../src/shared/types.ts';

export interface AuthenticatedRequest extends Request {
  sessionUser?: SessionPayload | null;
}

export function attachSession(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    req.sessionUser = verifySessionToken(token);
  } else {
    req.sessionUser = null;
  }
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.sessionUser) {
      res.status(401).json({
        error: 'Authentication required for this workspace action.',
        code: 'UNAUTHORIZED',
      });
      return;
    }
    if (!allowedRoles.includes(req.sessionUser.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
        code: 'FORBIDDEN',
      });
      return;
    }
    next();
  };
}

export function sanitizeUser(user: StoredUser): UserAccount {
  return {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    zone: user.zone,
  };
}

export function resolveUploadsDir(): string {
  const preferred = path.resolve(process.cwd(), 'uploads');
  try {
    if (!fs.existsSync(preferred)) fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), 'urbanpulse-uploads');
    if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

export function saveBase64Image(
  dataUrl: string,
  prefix = 'img',
): {
  url: string;
  mimeType: string;
  fileNameSafe: string;
} | null {
  const match = /^data:(image\/(?:jpeg|jpg|png));base64,([A-Za-z0-9+/=]+)$/i.exec(
    dataUrl.trim(),
  );
  if (!match) return null;

  const rawMime = match[1].toLowerCase();
  const mimeType = rawMime === 'image/png' ? 'image/png' : 'image/jpeg';
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const buffer = Buffer.from(match[2], 'base64');

  // Cap single image size at 8MB
  if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
    return null;
  }

  const uploadsDir = resolveUploadsDir();

  const fileNameSafe = `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}.${ext}`;
  const targetPath = path.join(uploadsDir, fileNameSafe);
  fs.writeFileSync(targetPath, buffer);

  return {
    url: `/uploads/${fileNameSafe}`,
    mimeType,
    fileNameSafe,
  };
}

function splitQueryList<T extends string>(val: unknown): T[] {
  if (!val) return [];
  const str = Array.isArray(val) ? val.join(',') : String(val);
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as T[];
}

export function parseMapFiltersFromQuery(query: Request['query']): MapFilterState {
  const defaults = createDefaultMapFilters();
  return {
    ...defaults,
    categories: splitQueryList<CivicCategory>(query.categories),
    severities: splitQueryList<SeverityLabel>(query.severities),
    priorities: splitQueryList<PriorityLabel>(query.priorities),
    verificationStatuses: splitQueryList<HumanVerificationStatus>(query.verificationStatuses),
    operationalStatuses: splitQueryList<OperationalIssueStatus>(query.operationalStatuses),
    assignedOfficerId: typeof query.assignedOfficerId === 'string' ? query.assignedOfficerId : '',
    dateFrom: typeof query.dateFrom === 'string' ? query.dateFrom : '',
    dateTo: typeof query.dateTo === 'string' ? query.dateTo : '',
    searchQuery: typeof query.searchQuery === 'string' ? query.searchQuery : '',
    unresolvedOnly: query.unresolvedOnly === 'true' || query.unresolvedOnly === '1',
  };
}

export function appendAudit(
  db: UrbanPulseDatabase,
  entry: Omit<AuditEntry, 'audit_id' | 'occurred_at'>,
): void {
  db.auditLogs.unshift({
    audit_id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    occurred_at: new Date().toISOString(),
    ...entry,
  });
  if (db.auditLogs.length > 500) {
    db.auditLogs = db.auditLogs.slice(0, 500);
  }
}

export function pushNotification(
  db: UrbanPulseDatabase,
  item: Omit<NotificationItem, 'notification_id' | 'created_at' | 'read'>,
): void {
  db.notifications.unshift({
    notification_id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: new Date().toISOString(),
    read: false,
    ...item,
  });
  if (db.notifications.length > 250) {
    db.notifications = db.notifications.slice(0, 250);
  }
}

export function recomputeIssueScoring(issue: PhysicalIssue, config: SystemConfig): void {
  const isResolved = issue.current_issue_status === 'RESOLVED';
  const ageRes = calculateAgeScore({
    startTimestamp: issue.first_reported_at,
    evaluationTimestamp: new Date().toISOString(),
    isResolved,
    halfSaturationDays: config.age_half_saturation_days,
  });
  if (!isResolved) {
    issue.days_unresolved = ageRes.daysUnresolved;
    issue.age_score = ageRes.ageScore;
  } else {
    issue.age_score = null;
  }

  const additionalReports = Math.max(0, issue.confirmed_independent_report_count - 1);
  issue.corroboration_score = calculateCorroborationScore(additionalReports) ?? 0;
  issue.severity_label = getSeverityLabel(issue.severity_score);

  issue.priority_assessment = calculatePriorityAssessment({
    factors: {
      severity: issue.severity_score,
      public_impact: issue.public_impact_score,
      geographical_importance: issue.geographical_importance_score,
      independent_corroboration: issue.corroboration_score,
      time_unresolved: issue.age_score,
    },
    weights: config.priority_weights,
    minCoverage: config.minimum_priority_factor_coverage,
    formulaVersion: config.formula_version,
    safetyReviewFlag: issue.safety_review_flag,
  });
}

export function refreshOfficerCounts(db: UrbanPulseDatabase): void {
  for (const officer of db.officers) {
    const active = db.issues.filter(
      (i) =>
        i.assigned_officer_id === officer.officer_id &&
        i.current_issue_status !== 'RESOLVED' &&
        i.current_issue_status !== 'REJECTED',
    ).length;
    officer.active_task_count = active;
  }
}
