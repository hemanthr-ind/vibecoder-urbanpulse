import React, { useMemo, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import {
  api,
  ApiError,
  formatCategoryLabel,
  formatIstTimestamp,
  formatRelativeTime,
} from '../api/client';
import {
  CivicImage,
  PriorityBadge,
  SeverityBadge,
  StatusBadge,
  VerificationBadge,
} from '../components/UiBadges';
import type { CivicCategory, CivicReport, PhysicalIssue } from '../shared/types';

export function AllReportsPage({
  reports,
  issues,
  mode,
  currentUserId,
  initialTrackRef = '',
  onOpenReport,
}: {
  reports: CivicReport[];
  issues: PhysicalIssue[];
  mode: 'ALL' | 'MINE' | 'TRACK';
  currentUserId?: string;
  initialTrackRef?: string;
  onOpenReport: (report: CivicReport | null, issue: PhysicalIssue | null) => void;
}) {
  const [search, setSearch] = useState(initialTrackRef);
  const [catFilter, setCatFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedReportId, setSelectedReportId] = useState<string>(reports[0]?.report_id ?? '');

  const [trackInput, setTrackInput] = useState(initialTrackRef);
  const [trackedResult, setTrackedResult] = useState<{
    report: CivicReport;
    issue: PhysicalIssue | null;
  } | null>(() => {
    if (!initialTrackRef) return null;
    const match = reports.find(
      (r) =>
        r.report_reference.toLowerCase() === initialTrackRef.toLowerCase() ||
        r.report_id.toLowerCase() === initialTrackRef.toLowerCase(),
    );
    if (!match) return null;
    const iss = match.physical_issue_id
      ? issues.find((i) => i.physical_issue_id === match.physical_issue_id) ?? null
      : null;
    return { report: match, issue: iss };
  });
  const [trackError, setTrackError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);

  const issueMap = useMemo(
    () => new Map(issues.map((i) => [i.physical_issue_id, i])),
    [issues],
  );

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (mode === 'MINE' && currentUserId && r.submitted_by_user_id !== currentUserId) {
        return false;
      }
      if (catFilter && r.user_selected_category !== (catFilter as CivicCategory)) return false;
      if (statusFilter && r.operational_status !== statusFilter) return false;
      if (q) {
        const hay = [
          r.report_reference,
          r.report_id,
          r.location_label,
          r.description,
          r.user_selected_category,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, mode, currentUserId, catFilter, statusFilter, search]);

  const activeReport =
    filteredReports.find((r) => r.report_id === selectedReportId) ?? filteredReports[0] ?? null;
  const activeIssue = activeReport?.physical_issue_id
    ? issueMap.get(activeReport.physical_issue_id) ?? null
    : null;

  const handleTrackLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackInput.trim()) return;
    setTracking(true);
    setTrackError(null);
    try {
      const res = await api.trackReport(trackInput.trim());
      setTrackedResult(res);
    } catch (err) {
      setTrackedResult(null);
      setTrackError(err instanceof ApiError ? err.message : 'Report reference not found.');
    } finally {
      setTracking(false);
    }
  };

  if (mode === 'TRACK') {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-5 backdrop-blur-xl shadow-xl">
          <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
            Track Civic Report Status
          </h1>
          <p className="text-xs text-[#9AADC1] mt-0.5">
            Enter your Reference ID (for example, <span className="font-mono text-[#20C8E8]">UP-TMK-1001</span>) to inspect live AI assessment and municipal lifecycle progress.
          </p>
          <form onSubmit={handleTrackLookup} className="mt-4 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#9AADC1]" />
              <input
                type="text"
                value={trackInput}
                onChange={(e) => setTrackInput(e.target.value)}
                placeholder="Enter Reference ID (e.g. UP-TMK-1001)"
                className="w-full rounded-xl border border-white/15 bg-[#07111F] pl-9 pr-3 py-2 text-sm font-mono text-white focus:border-[#20C8E8] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={tracking}
              className="rounded-xl bg-[#20C8E8] px-5 py-2 text-xs font-semibold text-[#07111F]"
            >
              {tracking ? 'Looking up...' : 'Track Status'}
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#9AADC1]">
            <span>Quick examples:</span>
            {reports.slice(0, 4).map((r) => (
              <button
                key={r.report_id}
                type="button"
                onClick={() => {
                  setTrackInput(r.report_reference);
                  const iss = r.physical_issue_id
                    ? issueMap.get(r.physical_issue_id) ?? null
                    : null;
                  setTrackedResult({ report: r, issue: iss });
                  setTrackError(null);
                }}
                className="font-mono text-[#20C8E8] hover:underline"
              >
                {r.report_reference}
              </button>
            ))}
          </div>
        </div>

        {trackError && (
          <div className="rounded-2xl border border-[#FF515A]/40 bg-[#FF515A]/15 p-4 text-xs text-[#FF9DA2]">
            {trackError}
          </div>
        )}

        {trackedResult && (
          <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <CivicImage
                  src={trackedResult.report.evidence_assets[0]?.url}
                  alt={trackedResult.report.report_reference}
                  className="h-20 w-20 rounded-xl border border-white/10"
                />
                <div>
                  <div className="font-mono text-sm font-bold text-[#20C8E8]">
                    {trackedResult.report.report_reference}
                  </div>
                  <h2 className="font-display text-base font-bold text-[#F4F7FC]">
                    {formatCategoryLabel(
                      trackedResult.issue?.canonical_category ??
                        trackedResult.report.user_selected_category,
                    )}
                  </h2>
                  <p className="text-xs text-[#9AADC1]">
                    {trackedResult.report.location_label}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={
                    trackedResult.issue?.current_issue_status ??
                    trackedResult.report.operational_status
                  }
                />
                {trackedResult.issue && (
                  <SeverityBadge
                    severity={trackedResult.issue.severity_label}
                    score={trackedResult.issue.severity_score}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onOpenReport(trackedResult.report, trackedResult.issue)}
                  className="rounded-xl border border-[#20C8E8]/40 bg-[#20C8E8]/15 px-3 py-1.5 text-xs font-medium text-[#20C8E8]"
                >
                  Inspect Full Report
                </button>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-2.5">
              {trackedResult.report.timeline.map((step) => (
                <div
                  key={step.event_id}
                  className="flex items-start justify-between gap-3 border-l-2 border-[#20C997]/50 pl-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-[#F4F7FC]">{step.step}</span>
                    <span className="text-[#9AADC1]"> · {step.actor_label}</span>
                    <p className="text-[#9AADC1]">{step.detail}</p>
                  </div>
                  <span className="font-mono text-[10px] text-[#9AADC1] whitespace-nowrap">
                    {formatIstTimestamp(step.occurred_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4">
        <div>
          <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
            {mode === 'MINE' ? 'My Submitted Reports' : 'All Civic Reports (Master-Detail)'}
          </h1>
          <p className="text-xs text-[#9AADC1]">
            Showing {filteredReports.length} of {reports.length} civic submission(s)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-[#9AADC1]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter ID or location..."
              className="rounded-xl border border-white/15 bg-[#07111F] pl-8 pr-3 py-1.5 text-xs text-white"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="rounded-xl border border-white/15 bg-[#07111F] px-3 py-1.5 text-xs text-white"
          >
            <option value="">All Categories</option>
            <option value="POTHOLE">Pothole</option>
            <option value="GARBAGE_OR_WASTE">Garbage / Waste</option>
            <option value="OTHER_CIVIC_CANDIDATE">Other Civic</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-white/15 bg-[#07111F] px-3 py-1.5 text-xs text-white"
          >
            <option value="">All Statuses</option>
            <option value="PENDING_VERIFICATION">Pending Verification</option>
            <option value="VERIFIED">Verified</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
      </div>

      {/* 2-Column Master-Detail Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
          {filteredReports.map((rep) => {
            const iss = rep.physical_issue_id
              ? issueMap.get(rep.physical_issue_id) ?? null
              : null;
            const isSel = activeReport?.report_id === rep.report_id;
            return (
              <div
                key={rep.report_id}
                onClick={() => setSelectedReportId(rep.report_id)}
                className={`flex items-center gap-3 rounded-2xl border p-3 cursor-pointer transition ${
                  isSel
                    ? 'border-[#20C8E8] bg-[#20C8E8]/12'
                    : 'border-white/10 bg-[#0C1929]/80 hover:border-white/25'
                }`}
              >
                <CivicImage
                  src={rep.evidence_assets[0]?.url}
                  alt={rep.report_reference}
                  className="h-16 w-16 rounded-xl shrink-0 border border-white/10"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[#20C8E8]">
                      {rep.report_reference}
                    </span>
                    <span className="text-[11px] text-[#9AADC1]">
                      {formatRelativeTime(rep.submitted_at)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#F4F7FC] truncate mt-0.5">
                    {formatCategoryLabel(iss?.canonical_category ?? rep.user_selected_category)}
                  </p>
                  <p className="text-[11px] text-[#9AADC1] truncate">{rep.location_label}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <StatusBadge status={iss?.current_issue_status ?? rep.operational_status} />
                  </div>
                </div>
              </div>
            );
          })}
          {filteredReports.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#0C1929]/70 p-6 text-center text-xs text-[#9AADC1]">
              No matching civic reports found.
            </div>
          )}
        </div>

        <div className="lg:col-span-7">
          {activeReport ? (
            <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="font-mono text-xs font-bold text-[#20C8E8]">
                    {activeReport.report_reference}
                  </span>
                  <h2 className="font-display text-lg font-bold text-[#F4F7FC]">
                    {activeIssue?.canonical_summary || activeReport.description}
                  </h2>
                  <p className="text-xs text-[#9AADC1] flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3.5 w-3.5 text-[#20C997]" />
                    {activeReport.location_label}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenReport(activeReport, activeIssue)}
                  className="rounded-xl bg-[#20C8E8] px-4 py-2 text-xs font-semibold text-[#07111F]"
                >
                  Open Full Action Drawer
                </button>
              </div>

              <CivicImage
                src={activeReport.evidence_assets[0]?.url}
                alt={activeReport.report_reference}
                className="h-64 w-full rounded-xl border border-white/10"
              />

              <div className="flex flex-wrap gap-2">
                {activeIssue && (
                  <>
                    <SeverityBadge
                      severity={activeIssue.severity_label}
                      score={activeIssue.severity_score}
                    />
                    <PriorityBadge
                      label={activeIssue.priority_assessment.label}
                      score={activeIssue.priority_assessment.score}
                      provisional={activeIssue.priority_assessment.is_provisional}
                    />
                  </>
                )}
                <StatusBadge
                  status={activeIssue?.current_issue_status ?? activeReport.operational_status}
                />
                <VerificationBadge
                  status={
                    activeIssue?.human_verification_status ??
                    activeReport.human_verification_status
                  }
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-[#07111F]/70 p-3.5 text-xs space-y-1.5">
                <div className="font-semibold text-[#F4F7FC]">AI Summary</div>
                <p className="text-[#9AADC1]">
                  {activeReport.ai_analysis?.image_assessment.relevance_reason ||
                    'Pending AI analysis.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-[#0C1929]/70 p-10 text-center text-xs text-[#9AADC1]">
              Select a report from the list to inspect evidence and lifecycle status.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
