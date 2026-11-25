import React, { useMemo, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import {
  api,
  ApiError,
  formatCategoryLabel,
  formatIstTimestamp,
  type AnalyticsPayload,
} from '../api/client';
import {
  CivicImage,
  PriorityBadge,
  SeverityBadge,
  StatusBadge,
  VerificationBadge,
} from '../components/UiBadges';
import type { CivicReport, PhysicalIssue } from '../shared/types';

export function AdminAiAnalysisPage({
  reports,
  issues,
  onRefresh,
  onOpenReport,
  onNotify,
}: {
  reports: CivicReport[];
  issues: PhysicalIssue[];
  onRefresh: () => Promise<void>;
  onOpenReport: (report: CivicReport | null, issue: PhysicalIssue | null) => void;
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const issueMap = useMemo(
    () => new Map(issues.map((i) => [i.physical_issue_id, i])),
    [issues],
  );

  const handleRerun = async (reportId: string) => {
    setBusyId(reportId);
    try {
      const res = await api.rerunAnalysis(reportId);
      await onRefresh();
      onNotify(
        res.aiError
          ? `AI returned warning: ${res.aiError}`
          : 'Gemini vision analysis completed.',
        res.aiError ? 'info' : 'success',
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Re-analysis failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
            AI Visual Intelligence Workspace
          </h1>
          <p className="text-xs text-[#9AADC1]">
            Operating in VISION_ONLY mode (`gemini-4-hydrogen`). Detector confidence & bounding boxes remain null unless a dedicated detector is connected.
          </p>
        </div>
        <span className="rounded-lg border border-[#20C8E8]/35 bg-[#20C8E8]/10 px-3 py-1 font-mono text-xs text-[#20C8E8]">
          {reports.length} analysis records
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {reports.map((rep) => {
          const ai = rep.ai_analysis;
          const iss = rep.physical_issue_id
            ? issueMap.get(rep.physical_issue_id) ?? null
            : null;
          return (
            <div
              key={rep.report_id}
              className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 flex flex-col md:flex-row gap-4"
            >
              <CivicImage
                src={rep.evidence_assets[0]?.url}
                alt={rep.report_reference}
                className="h-28 w-full md:w-36 rounded-xl shrink-0 border border-white/10"
              />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-[#20C8E8]" />
                    <span className="font-mono text-xs font-bold text-[#20C8E8]">
                      {rep.report_reference}
                    </span>
                    <span className="text-xs font-semibold text-[#F4F7FC]">
                      {ai?.image_assessment.relevance_status ?? 'PENDING'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === rep.report_id}
                      onClick={() => handleRerun(rep.report_id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#20C8E8]/40 bg-[#20C8E8]/15 px-2.5 py-1 text-[11px] font-medium text-[#20C8E8] disabled:opacity-50"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {busyId === rep.report_id ? 'Running...' : 'Re-run AI'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenReport(rep, iss)}
                      className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-[#F4F7FC]"
                    >
                      Inspect JSON
                    </button>
                  </div>
                </div>

                <p className="text-xs text-[#9AADC1]">
                  {ai?.image_assessment.relevance_reason || 'No analysis summary yet.'}
                </p>

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[#9AADC1]">
                    Mode: {ai?.analysis_mode ?? 'VISION_ONLY'}
                  </span>
                  <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[#9AADC1]">
                    Quality: {ai?.image_assessment.image_quality_status ?? 'N/A'}
                  </span>
                  {iss && <SeverityBadge severity={iss.severity_label} score={iss.severity_score} />}
                  <VerificationBadge status={rep.human_verification_status} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminVerificationQueuePage({
  issues,
  reports,
  onRefresh,
  onOpenReport,
  onNotify,
}: {
  issues: PhysicalIssue[];
  reports: CivicReport[];
  onRefresh: () => Promise<void>;
  onOpenReport: (report: CivicReport | null, issue: PhysicalIssue | null) => void;
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [filterMode, setFilterMode] = useState<'PENDING' | 'ALL'>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);

  const reportMap = useMemo(
    () => new Map(reports.map((r) => [r.report_id, r])),
    [reports],
  );

  const queue = useMemo(() => {
    return issues.filter((i) => {
      if (filterMode === 'ALL') return true;
      return (
        i.current_issue_status === 'PENDING_VERIFICATION' ||
        i.human_verification_status === 'REVIEW_REQUIRED' ||
        i.human_verification_status === 'REVIEW_RECOMMENDED' ||
        i.human_verification_status === 'NOT_REVIEWED' ||
        i.human_verification_status === 'UNCERTAIN'
      );
    });
  }, [issues, filterMode]);

  const quickVerify = async (
    issueId: string,
    action: 'CONFIRM' | 'ESCALATE' | 'REJECT' | 'MARK_UNCERTAIN',
    reason: string,
  ) => {
    setBusyId(issueId);
    try {
      await api.verifyIssue(issueId, { action, reason });
      await onRefresh();
      onNotify(`Verification updated (${action}).`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Verification failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck className="h-5 w-5 text-[#20C8E8]" />
          <div>
            <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
              Human Verification Queue
            </h1>
            <p className="text-xs text-[#9AADC1]">
              Confirm, override, escalate, or request evidence without overwriting original AI model outputs.
            </p>
          </div>
        </div>
        <div className="flex rounded-xl border border-white/15 bg-[#07111F] p-0.5">
          <button
            type="button"
            onClick={() => setFilterMode('PENDING')}
            className={`rounded-lg px-3 py-1 text-xs font-medium ${
              filterMode === 'PENDING' ? 'bg-[#20C8E8] text-[#07111F]' : 'text-[#9AADC1]'
            }`}
          >
            Needs Review ({issues.filter((i) => i.current_issue_status === 'PENDING_VERIFICATION' || i.human_verification_status !== 'VERIFIED').length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('ALL')}
            className={`rounded-lg px-3 py-1 text-xs font-medium ${
              filterMode === 'ALL' ? 'bg-[#20C8E8] text-[#07111F]' : 'text-[#9AADC1]'
            }`}
          >
            All Issues ({issues.length})
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {queue.map((iss) => {
          const rep = reportMap.get(iss.associated_report_ids[0]) ?? null;
          return (
            <div
              key={iss.physical_issue_id}
              className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <CivicImage
                  src={rep?.evidence_assets[0]?.url}
                  alt={iss.physical_issue_id}
                  className="h-20 w-24 rounded-xl shrink-0 border border-white/10"
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#20C8E8]">
                      {iss.physical_issue_id}
                    </span>
                    <span className="text-xs font-semibold text-[#F4F7FC]">
                      {formatCategoryLabel(iss.canonical_category)}
                    </span>
                    <SeverityBadge severity={iss.severity_label} score={iss.severity_score} />
                    <VerificationBadge status={iss.human_verification_status} />
                  </div>
                  <p className="text-xs text-[#F4F7FC]/90">{iss.canonical_summary}</p>
                  <p className="text-[11px] text-[#9AADC1]">
                    {iss.authoritative_location?.human_readable_label ??
                      rep?.location_label ??
                      'Unlocated'} · {formatIstTimestamp(iss.first_reported_at)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyId === iss.physical_issue_id}
                  onClick={() =>
                    quickVerify(iss.physical_issue_id, 'CONFIRM', 'Verified via Verification Queue.')
                  }
                  className="rounded-xl bg-[#20C997] px-3 py-1.5 text-xs font-semibold text-[#07111F] disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  disabled={busyId === iss.physical_issue_id}
                  onClick={() =>
                    quickVerify(iss.physical_issue_id, 'ESCALATE', 'Escalated for safety priority.')
                  }
                  className="rounded-xl bg-[#FF515A] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Escalate
                </button>
                <button
                  type="button"
                  onClick={() => onOpenReport(rep, iss)}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-[#F4F7FC]"
                >
                  Override / Assign
                </button>
              </div>
            </div>
          );
        })}
        {queue.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#0C1929]/70 p-8 text-center text-xs text-[#9AADC1]">
            All queued issues have been verified.
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminPriorityManagementPage({
  issues,
  reports,
  onOpenReport,
}: {
  issues: PhysicalIssue[];
  reports: CivicReport[];
  onOpenReport: (report: CivicReport | null, issue: PhysicalIssue | null) => void;
}) {
  const reportMap = useMemo(
    () => new Map(reports.map((r) => [r.report_id, r])),
    [reports],
  );

  const ranked = useMemo(
    () =>
      [...issues].sort(
        (a, b) => (b.priority_assessment.score ?? -1) - (a.priority_assessment.score ?? -1),
      ),
    [issues],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4">
        <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
          5-Factor Priority Ranking Engine
        </h1>
        <p className="text-xs text-[#9AADC1] mt-0.5">
          Formula: (Visual Severity × 35%) + (Public Impact × 25%) + (Geographical Importance × 15%) + (Corroboration × 15%) + (Age × 10%). Requires ≥60% weight coverage; missing factors are never zeroed.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0C1929]/80">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-[#07111F]/70 text-[11px] uppercase tracking-wider text-[#9AADC1]">
            <tr>
              <th className="px-4 py-3">Issue</th>
              <th className="px-3 py-3">Priority</th>
              <th className="px-3 py-3">Severity</th>
              <th className="px-3 py-3">Impact</th>
              <th className="px-3 py-3">Geo</th>
              <th className="px-3 py-3">Corrob</th>
              <th className="px-3 py-3">Age</th>
              <th className="px-3 py-3">Coverage</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {ranked.map((iss) => {
              const p = iss.priority_assessment;
              const rep = reportMap.get(iss.associated_report_ids[0]) ?? null;
              return (
                <tr
                  key={iss.physical_issue_id}
                  onClick={() => onOpenReport(rep, iss)}
                  className="hover:bg-white/5 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#20C8E8]">
                        {iss.physical_issue_id}
                      </span>
                      {iss.safety_review_flag && (
                        <ShieldAlert className="h-3.5 w-3.5 text-[#FF515A]" />
                      )}
                    </div>
                    <div className="text-[11px] text-[#9AADC1] truncate max-w-[240px]">
                      {iss.canonical_summary}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <PriorityBadge label={p.label} score={p.score} provisional={p.is_provisional} />
                  </td>
                  <td className="px-3 py-3 font-mono">{p.factor_scores.severity ?? '—'}</td>
                  <td className="px-3 py-3 font-mono">{p.factor_scores.public_impact ?? '—'}</td>
                  <td className="px-3 py-3 font-mono">{p.factor_scores.geographical_importance ?? '—'}</td>
                  <td className="px-3 py-3 font-mono">{p.factor_scores.independent_corroboration ?? '—'}</td>
                  <td className="px-3 py-3 font-mono">{p.factor_scores.time_unresolved ?? '—'}</td>
                  <td className="px-3 py-3 font-mono">
                    {(p.available_weight_coverage * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={iss.current_issue_status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminAnalyticsPage({ analytics }: { analytics: AnalyticsPayload | null }) {
  if (!analytics) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-8 text-center text-xs text-[#9AADC1]">
        Loading live analytics...
      </div>
    );
  }

  const maxCat = Math.max(
    1,
    analytics.kpis.potholeIssues,
    analytics.kpis.garbageIssues,
    analytics.kpis.otherCivicCandidates,
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <TrendingUp className="h-5 w-5 text-[#20C997]" />
          <div>
            <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
              Analytics & Operational Insights
            </h1>
            <p className="text-xs text-[#9AADC1]">
              Aggregated strictly from canonical backend issue records across Tumakuru.
            </p>
          </div>
        </div>
        {analytics.hasDemoSeedData && (
          <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-[#9AADC1]">
            Includes Demonstration Seed Dataset
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AADC1]">
            Issues by Category
          </h2>
          {[
            { label: 'Potholes', val: analytics.kpis.potholeIssues, color: '#FF515A' },
            { label: 'Garbage / Waste', val: analytics.kpis.garbageIssues, color: '#20C997' },
            { label: 'Other Civic', val: analytics.kpis.otherCivicCandidates, color: '#FF963D' },
          ].map((row) => (
            <div key={row.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>{row.label}</span>
                <span className="font-mono font-bold">{row.val}</span>
              </div>
              <div className="h-2 rounded-full bg-[#07111F] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(row.val / maxCat) * 100}%`,
                    backgroundColor: row.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AADC1]">
            Severity Distribution
          </h2>
          {(
            [
              { k: 'CRITICAL', color: '#FF3B47' },
              { k: 'HIGH', color: '#FF515A' },
              { k: 'MODERATE', color: '#377DFF' },
              { k: 'LOW', color: '#20C997' },
              { k: 'UNKNOWN', color: '#7E93AA' },
            ] as const
          ).map((item) => {
            const count = analytics.severityDistribution[item.k];
            const pct =
              analytics.kpis.uniquePhysicalIssues > 0
                ? (count / analytics.kpis.uniquePhysicalIssues) * 100
                : 0;
            return (
              <div key={item.k} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{item.k}</span>
                  <span className="font-mono">{count}</span>
                </div>
                <div className="h-2 rounded-full bg-[#07111F] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AADC1]">
              Resolution Rate
            </h2>
            <div className="mt-4 font-display text-4xl font-bold text-[#20C997] tabular-nums">
              {analytics.resolutionRatePercent}%
            </div>
            <p className="mt-1 text-xs text-[#9AADC1]">
              {analytics.kpis.resolvedIssues} resolved of {analytics.kpis.uniquePhysicalIssues} physical issues
            </p>
          </div>
          <div className="mt-4 rounded-xl border border-white/10 bg-[#07111F]/70 p-3 flex items-center gap-2 text-xs text-[#9AADC1]">
            <CheckCircle2 className="h-4 w-4 text-[#20C997]" />
            <span>{analytics.kpis.unlocatedReports} unlocated report(s) flagged for review</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AADC1]">
          Field Officer Workload
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {analytics.officerWorkload.map((off) => (
            <div
              key={off.officer_id}
              className="rounded-xl border border-white/10 bg-[#07111F]/70 p-3 flex items-center justify-between"
            >
              <div>
                <div className="text-sm font-semibold text-[#F4F7FC]">{off.name}</div>
                <div className="text-xs text-[#9AADC1]">{off.zone}</div>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="text-[#20C8E8]">{off.active_task_count} active</div>
                <div className="text-[#20C997]">{off.completed_task_count} completed</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
