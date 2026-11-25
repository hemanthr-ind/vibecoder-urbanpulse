import type {
  AiAnalysisRun,
  AuditEntry,
  CivicCategory,
  CivicReport,
  FieldOfficer,
  HeatmapCell,
  HumanOverrideRecord,
  MapFilterState,
  MapMode,
  MapPointFeature,
  NotificationItem,
  PhysicalIssue,
  SystemConfig,
  UserAccount,
  UserRole,
} from '../shared/types';
import type { PlatformKpis } from '../shared/workflows';

let authTokenInMemory: string | null = null;

export function setAuthToken(token: string | null): void {
  authTokenInMemory = token;
}

export function getAuthToken(): string | null {
  return authTokenInMemory;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (authTokenInMemory) {
    headers.set('Authorization', `Bearer ${authTokenInMemory}`);
  }
  if (options.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError(
      data?.error || `Request failed (${res.status})`,
      res.status,
      data?.code,
    );
  }

  return data as T;
}

export interface AuthStatusResponse {
  adminClaimed: boolean;
  envAdminConfigured: boolean;
  unclaimedOfficers: Array<{
    officer_id: string;
    name: string;
    email: string;
    zone: string;
    badge_code: string;
  }>;
  geminiConfigured: boolean;
}

export interface DashboardPayload {
  kpis: PlatformKpis;
  recentReports: CivicReport[];
  issues: PhysicalIssue[];
  officers: FieldOfficer[];
  config: SystemConfig;
  notifications: NotificationItem[];
  mapSummary: {
    features: MapPointFeature[];
    unlocatedCount: number;
    invalidCount: number;
  };
  hasDemoSeedData: boolean;
}

export interface MapDataPayload {
  mode: MapMode;
  features: MapPointFeature[];
  filteredCount: number;
  totalLocatedCount: number;
  unlocatedCount: number;
  invalidCount: number;
  heatmapCells: HeatmapCell[];
  cellSizeMeters: number;
  appliedFilters: MapFilterState;
}

export interface AnalyticsPayload {
  kpis: PlatformKpis;
  severityDistribution: Record<'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN', number>;
  priorityDistribution: Record<'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNDETERMINED', number>;
  statusCounts: Record<string, number>;
  resolutionRatePercent: number;
  officerWorkload: Array<{
    officer_id: string;
    name: string;
    zone: string;
    availability: FieldOfficer['availability'];
    active_task_count: number;
    completed_task_count: number;
    avg_resolution_hours: number | null;
  }>;
  hasDemoSeedData: boolean;
}

export function buildMapQueryString(
  filters: MapFilterState,
  mode: MapMode,
  zoom: number,
): string {
  const params = new URLSearchParams();
  params.set('mode', mode);
  params.set('zoom', String(Math.round(zoom)));
  if (filters.categories.length) params.set('categories', filters.categories.join(','));
  if (filters.severities.length) params.set('severities', filters.severities.join(','));
  if (filters.priorities.length) params.set('priorities', filters.priorities.join(','));
  if (filters.verificationStatuses.length) {
    params.set('verificationStatuses', filters.verificationStatuses.join(','));
  }
  if (filters.operationalStatuses.length) {
    params.set('operationalStatuses', filters.operationalStatuses.join(','));
  }
  if (filters.assignedOfficerId) params.set('assignedOfficerId', filters.assignedOfficerId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.searchQuery.trim()) params.set('searchQuery', filters.searchQuery.trim());
  if (filters.unresolvedOnly) params.set('unresolvedOnly', 'true');
  return params.toString();
}

export const api = {
  getHealth: () =>
    apiFetch<{ status: string; geminiConfigured: boolean; timestamp: string }>('/api/health'),

  getAuthStatus: () => apiFetch<AuthStatusResponse>('/api/auth/status'),

  claimAdmin: (body: { name: string; email: string; password: string }) =>
    apiFetch<{ token: string; user: UserAccount }>('/api/auth/claim-admin', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  claimOfficer: (body: { officerId: string; password: string }) =>
    apiFetch<{ token: string; user: UserAccount }>('/api/auth/claim-officer', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string; expectedRole?: UserRole }) =>
    apiFetch<{ token: string; user: UserAccount }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  registerCitizen: (body: { name: string; email: string; password: string }) =>
    apiFetch<{ token: string; user: UserAccount }>('/api/auth/citizen-register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getMe: () => apiFetch<{ user: UserAccount }>('/api/auth/me'),

  getDashboard: () => apiFetch<DashboardPayload>('/api/dashboard'),

  getMapData: (filters: MapFilterState, mode: MapMode, zoom: number) =>
    apiFetch<MapDataPayload>(`/api/map/data?${buildMapQueryString(filters, mode, zoom)}`),

  getAnalytics: () => apiFetch<AnalyticsPayload>('/api/analytics'),

  trackReport: (reference: string) =>
    apiFetch<{ report: CivicReport; issue: PhysicalIssue | null }>(
      `/api/reports/track/${encodeURIComponent(reference)}`,
    ),

  submitReport: (
    payload: {
      category: CivicCategory;
      images: string[];
      description: string;
      additionalInfo: string;
      locationLabel: string;
      latitude: number | null;
      longitude: number | null;
      accuracyMeters: number | null;
      locationSource: string;
      locationMeaning: string;
      confirmedByUser: boolean;
      reporterName?: string;
    },
    idempotencyKey: string,
  ) =>
    apiFetch<{ report: CivicReport; issue: PhysicalIssue | null; aiError: string | null }>(
      '/api/reports',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        idempotencyKey,
      },
    ),

  rerunAnalysis: (reportId: string) =>
    apiFetch<{ report: CivicReport; issue: PhysicalIssue | null; aiError: string | null }>(
      `/api/reports/${encodeURIComponent(reportId)}/analyze`,
      { method: 'POST' },
    ),

  verifyIssue: (
    issueId: string,
    payload: {
      action: HumanOverrideRecord['action'];
      reason: string;
      newCategory?: CivicCategory;
      newSeverityScore?: number;
      geographicalImportanceScore?: number;
    },
  ) =>
    apiFetch<{ issue: PhysicalIssue }>(`/api/issues/${encodeURIComponent(issueId)}/verify`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateIssueLocation: (
    issueId: string,
    payload: {
      latitude: number;
      longitude: number;
      locationLabel: string;
      accuracyMeters?: number;
    },
  ) =>
    apiFetch<{ issue: PhysicalIssue }>(`/api/issues/${encodeURIComponent(issueId)}/location`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  assignIssue: (issueId: string, payload: { officerId: string; dueAt?: string }) =>
    apiFetch<{ issue: PhysicalIssue; officers: FieldOfficer[] }>(
      `/api/issues/${encodeURIComponent(issueId)}/assign`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  fieldUpdateIssue: (
    issueId: string,
    payload: {
      stage: 'ACCEPT' | 'START_INSPECTION' | 'IN_PROGRESS' | 'SUBMIT_RESOLUTION' | 'REQUEST_REASSESSMENT';
      note: string;
      evidenceDataUrl?: string;
    },
  ) =>
    apiFetch<{ issue: PhysicalIssue }>(
      `/api/issues/${encodeURIComponent(issueId)}/field-update`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  resolveIssue: (issueId: string, payload: { note: string }) =>
    apiFetch<{ issue: PhysicalIssue }>(`/api/issues/${encodeURIComponent(issueId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  reopenIssue: (issueId: string, payload: { reason: string }) =>
    apiFetch<{ issue: PhysicalIssue }>(`/api/issues/${encodeURIComponent(issueId)}/reopen`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createOfficer: (payload: {
    name: string;
    email: string;
    password: string;
    zone: string;
    badgeCode?: string;
  }) =>
    apiFetch<{ officer: FieldOfficer }>('/api/officers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateOfficer: (
    officerId: string,
    payload: { availability?: FieldOfficer['availability']; zone?: string },
  ) =>
    apiFetch<{ officer: FieldOfficer }>(`/api/officers/${encodeURIComponent(officerId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getUsers: () => apiFetch<{ users: UserAccount[] }>('/api/users'),

  updateUser: (userId: string, payload: { status?: 'ACTIVE' | 'SUSPENDED'; role?: UserRole }) =>
    apiFetch<{ user: UserAccount }>(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  markNotificationRead: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    }),

  getAuditLogs: () => apiFetch<{ auditLogs: AuditEntry[] }>('/api/audit-logs'),

  updateConfig: (payload: Partial<SystemConfig>) =>
    apiFetch<{ config: SystemConfig }>('/api/config', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

export function formatRelativeTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const diffSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function formatIstTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCategoryLabel(category: CivicCategory): string {
  if (category === 'POTHOLE') return 'Pothole';
  if (category === 'GARBAGE_OR_WASTE') return 'Garbage / Waste';
  return 'Other Civic Candidate';
}

export type { AiAnalysisRun };
