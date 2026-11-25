import React, { useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  MapPin,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import {
  api,
  ApiError,
  formatCategoryLabel,
  formatIstTimestamp,
} from '../api/client';
import type {
  CivicCategory,
  CivicReport,
  FieldOfficer,
  HumanOverrideRecord,
  PhysicalIssue,
  UserRole,
} from '../shared/types';
import {
  CivicImage,
  PriorityBadge,
  SeverityBadge,
  StatusBadge,
  VerificationBadge,
} from './UiBadges';

export function ReportDetailDrawer({
  report,
  issue,
  activeRole,
  officers,
  onClose,
  onUpdated,
  onNotify,
}: {
  report: CivicReport | null;
  issue: PhysicalIssue | null;
  activeRole: UserRole;
  officers: FieldOfficer[];
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [busy, setBusy] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideCategory, setOverrideCategory] = useState<CivicCategory>(
    issue?.canonical_category ?? report?.user_selected_category ?? 'POTHOLE',
  );
  const [overrideSeverity, setOverrideSeverity] = useState<string>(
    issue?.severity_score !== null && issue?.severity_score !== undefined
      ? String(issue.severity_score)
      : '',
  );
  const [geoScoreInput, setGeoScoreInput] = useState<string>(
    issue?.geographical_importance_score !== null &&
      issue?.geographical_importance_score !== undefined
      ? String(issue.geographical_importance_score)
      : '',
  );
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>(
    issue?.assigned_officer_id ?? officers[0]?.officer_id ?? '',
  );
  const [fieldNote, setFieldNote] = useState('');
  const [fieldPhotoUrl, setFieldPhotoUrl] = useState<string | null>(null);
  const [locLat, setLocLat] = useState<string>(
    issue?.authoritative_location?.latitude !== null &&
      issue?.authoritative_location?.latitude !== undefined
      ? String(issue.authoritative_location.latitude)
      : '13.3392',
  );
  const [locLng, setLocLng] = useState<string>(
    issue?.authoritative_location?.longitude !== null &&
      issue?.authoritative_location?.longitude !== undefined
      ? String(issue.authoritative_location.longitude)
      : '77.1140',
  );
  const [locLabel, setLocLabel] = useState<string>(
    issue?.authoritative_location?.human_readable_label ??
      report?.location_label ??
      'Tumakuru',
  );

  if (!report && !issue) return null;

  const ai = report?.ai_analysis ?? null;
  const displayRef = report?.report_reference ?? issue?.physical_issue_id ?? '';
  const displaySummary =
    issue?.canonical_summary ||
    report?.description ||
    'Civic infrastructure observation';

  const handleFieldFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      onNotify('Please upload a JPG or PNG image.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setFieldPhotoUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const runAction = async (fn: () => Promise<void>, successMsg: string) => {
    setBusy(true);
    try {
      await fn();
      await onUpdated();
      onNotify(successMsg, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Operation failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[800] flex justify-end bg-[#07111F]/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/15 bg-[#0C1929] p-5 sm:p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-[#20C8E8]">
                {displayRef}
              </span>
              {issue && (
                <span className="font-mono text-xs text-[#9AADC1]">
                  · {issue.physical_issue_id}
                </span>
              )}
              {(report?.is_demo_seed || issue?.is_demo_seed) && (
                <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-[#9AADC1]">
                  Sample Data
                </span>
              )}
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-[#F4F7FC]">
              {formatCategoryLabel(
                issue?.canonical_category ?? report?.user_selected_category ?? 'POTHOLE',
              )}
            </h2>
            <p className="mt-0.5 text-xs text-[#9AADC1]">{displaySummary}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-[#9AADC1] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status Summary Strip */}
        <div className="flex flex-wrap items-center gap-2">
          {issue && (
            <>
              <SeverityBadge
                severity={issue.severity_label}
                score={issue.severity_score}
              />
              <PriorityBadge
                label={issue.priority_assessment.label}
                score={issue.priority_assessment.score}
                provisional={issue.priority_assessment.is_provisional}
              />
              <StatusBadge status={issue.current_issue_status} />
              <VerificationBadge status={issue.human_verification_status} />
            </>
          )}
          {!issue && report && (
            <>
              <StatusBadge status={report.operational_status} />
              <VerificationBadge status={report.human_verification_status} />
            </>
          )}
          {issue?.safety_review_flag && (
            <span className="inline-flex items-center gap-1 rounded-md border border-[#FF515A]/50 bg-[#FF515A]/15 px-2 py-0.5 text-[11px] font-medium text-[#FF9DA2]">
              <ShieldAlert className="h-3 w-3" />
              Safety Review
            </span>
          )}
        </div>

        {/* Evidence Gallery */}
        <div className="rounded-2xl border border-white/10 bg-[#07111F]/70 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9AADC1]">
              Visual Evidence
            </h3>
            <span className="text-[11px] text-[#9AADC1]">
              {(report?.evidence_assets.length ?? 0)} citizen ·{' '}
              {(issue?.field_evidence.length ?? 0)} field
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(report?.evidence_assets ?? []).map((asset) => (
              <div
                key={asset.evidence_id}
                className="overflow-hidden rounded-xl border border-white/10 bg-[#0C1929]"
              >
                <CivicImage
                  src={asset.url}
                  alt={asset.file_name_safe}
                  className="h-44 w-full"
                />
                <div className="px-3 py-1.5 text-[11px] text-[#9AADC1] flex justify-between">
                  <span>Citizen Submission</span>
                  <span className="font-mono">{formatIstTimestamp(asset.uploaded_at)}</span>
                </div>
              </div>
            ))}
            {(issue?.field_evidence ?? []).map((asset) => (
              <div
                key={asset.evidence_id}
                className="overflow-hidden rounded-xl border border-[#20C997]/35 bg-[#0C1929]"
              >
                <CivicImage
                  src={asset.url}
                  alt={asset.file_name_safe}
                  className="h-44 w-full"
                />
                <div className="px-3 py-1.5 text-[11px] text-[#20C997] flex justify-between">
                  <span>{asset.kind.replaceAll('_', ' ')}</span>
                  <span className="font-mono">{formatIstTimestamp(asset.uploaded_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Visual Assessment & Priority Math */}
        {ai && (
          <div className="rounded-2xl border border-white/10 bg-[#07111F]/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-[#20C8E8]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F4F7FC]">
                  AI Visual Assessment ({ai.analysis_mode})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-[#9AADC1]">
                  {ai.model_metadata.vision_model_name ?? 'No Model'}
                </span>
                {activeRole === 'ADMIN' && report && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runAction(async () => {
                        await api.rerunAnalysis(report.report_id);
                      }, 'AI vision assessment re-run completed.')
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-[#20C8E8]/40 bg-[#20C8E8]/15 px-2.5 py-1 text-[11px] font-medium text-[#20C8E8] hover:bg-[#20C8E8]/25 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Re-run AI
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-white/10 bg-[#0C1929]/70 p-2.5">
                <div className="text-[10px] text-[#9AADC1]">Relevance Gate</div>
                <div className="mt-0.5 font-semibold text-[#F4F7FC]">
                  {ai.image_assessment.relevance_status.replaceAll('_', ' ')}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0C1929]/70 p-2.5">
                <div className="text-[10px] text-[#9AADC1]">Image Quality</div>
                <div className="mt-0.5 font-semibold text-[#F4F7FC]">
                  {ai.image_assessment.image_quality_status}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0C1929]/70 p-2.5">
                <div className="text-[10px] text-[#9AADC1]">Detector BBox / Conf.</div>
                <div className="mt-0.5 font-mono text-[11px] text-[#9AADC1]">
                  N/A (Vision-Only)
                </div>
              </div>
            </div>

            <p className="text-xs text-[#9AADC1]">{ai.image_assessment.relevance_reason}</p>

            {ai.detections.map((det) => (
              <div
                key={det.detection_id}
                className="rounded-xl border border-white/10 bg-[#0C1929]/80 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#F4F7FC]">
                    {det.class_display_label}
                  </span>
                  <div className="flex items-center gap-2">
                    <SeverityBadge
                      severity={det.severity_assessment.label}
                      score={det.severity_assessment.score}
                    />
                    <span className="font-mono text-[11px] text-[#9AADC1]">
                      Impact: {det.public_impact_assessment.score ?? 'N/A'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[#F4F7FC]/85">{det.visible_description}</p>
                {det.supporting_evidence.length > 0 && (
                  <p className="text-[11px] text-[#20C997]">
                    Supporting: {det.supporting_evidence.join('; ')}
                  </p>
                )}
                {det.counter_evidence.length > 0 && (
                  <p className="text-[11px] text-[#FF963D]">
                    Counter-evidence / Limits: {det.counter_evidence.join('; ')}
                  </p>
                )}
              </div>
            ))}

            {ai.failure_summary && (
              <div className="rounded-xl border border-[#FF515A]/40 bg-[#FF515A]/10 p-2.5 text-xs text-[#FF9DA2]">
                AI Status Notice: {ai.failure_summary}
              </div>
            )}
          </div>
        )}

        {/* Priority 5-Factor Breakdown */}
        {issue && (
          <div className="rounded-2xl border border-white/10 bg-[#07111F]/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9AADC1]">
                5-Factor Priority Calculation
              </h3>
              <span className="font-mono text-[11px] text-[#20C8E8]">
                Coverage: {(issue.priority_assessment.available_weight_coverage * 100).toFixed(0)}% (
                {issue.priority_assessment.status})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              {[
                { label: 'Severity (35%)', val: issue.priority_assessment.factor_scores.severity },
                { label: 'Impact (25%)', val: issue.priority_assessment.factor_scores.public_impact },
                { label: 'Geo Imp (15%)', val: issue.priority_assessment.factor_scores.geographical_importance },
                { label: 'Corrob (15%)', val: issue.priority_assessment.factor_scores.independent_corroboration },
                { label: 'Age (10%)', val: issue.priority_assessment.factor_scores.time_unresolved },
              ].map((f) => (
                <div
                  key={f.label}
                  className="rounded-xl border border-white/10 bg-[#0C1929] p-2"
                >
                  <div className="text-[10px] text-[#9AADC1]">{f.label}</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-[#F4F7FC]">
                    {f.val !== null && f.val !== undefined ? f.val.toFixed(0) : 'NULL'}
                  </div>
                </div>
              ))}
            </div>
            <p className="font-mono text-[11px] text-[#9AADC1] break-words">
              {issue.priority_assessment.calculation_expression}
            </p>

            {issue.human_override && (
              <div className="rounded-xl border border-[#20C997]/35 bg-[#20C997]/10 p-3 text-xs space-y-1">
                <div className="font-semibold text-[#68E7BE]">
                  Human Verification Override ({issue.human_override.action})
                </div>
                <p className="text-[#F4F7FC]/90">
                  Reviewer: {issue.human_override.reviewer_name} ·{' '}
                  {formatIstTimestamp(issue.human_override.decided_at)}
                </p>
                <p className="text-[#9AADC1]">
                  Previous: {issue.human_override.previous_category} (Sev{' '}
                  {issue.human_override.previous_severity_score ?? 'N/A'}) → Current:{' '}
                  {issue.human_override.new_category} (Sev{' '}
                  {issue.human_override.new_severity_score ?? 'N/A'})
                </p>
                <p className="text-[#F4F7FC]/80">Reason: {issue.human_override.reason}</p>
              </div>
            )}
          </div>
        )}

        {/* Location Provenance */}
        <div className="rounded-2xl border border-white/10 bg-[#07111F]/70 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#20C997]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F4F7FC]">
              Geospatial & Location Provenance
            </h3>
          </div>
          {issue?.authoritative_location || report?.location_observation ? (
            (() => {
              const loc = issue?.authoritative_location ?? report!.location_observation;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#9AADC1]">Label: </span>
                    <span className="text-[#F4F7FC]">{loc.human_readable_label}</span>
                  </div>
                  <div>
                    <span className="text-[#9AADC1]">Coordinates: </span>
                    <span className="font-mono text-[#20C8E8]">
                      {loc.latitude !== null && loc.longitude !== null
                        ? `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`
                        : 'UNLOCATED'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#9AADC1]">Source / Meaning: </span>
                    <span className="text-[#F4F7FC]">
                      {loc.location_source} ({loc.location_meaning})
                    </span>
                  </div>
                  <div>
                    <span className="text-[#9AADC1]">Precision / Jurisdiction: </span>
                    <span className="text-[#F4F7FC]">
                      {loc.horizontal_accuracy_meters ? `±${loc.horizontal_accuracy_meters}m` : 'N/A'} ·{' '}
                      {loc.jurisdiction_status.replaceAll('_', ' ')}
                    </span>
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="text-xs text-[#9AADC1]">No location record attached.</p>
          )}
        </div>

        {/* Admin Controls */}
        {activeRole === 'ADMIN' && issue && (
          <div className="rounded-2xl border border-[#20C8E8]/30 bg-[#13273B]/45 p-4 space-y-3.5">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-[#20C8E8]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F4F7FC]">
                Administrator Verification & Dispatch
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-[#9AADC1] mb-1">Category</label>
                <select
                  value={overrideCategory}
                  onChange={(e) => setOverrideCategory(e.target.value as CivicCategory)}
                  className="w-full rounded-xl border border-white/15 bg-[#07111F] px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="POTHOLE">Pothole</option>
                  <option value="GARBAGE_OR_WASTE">Garbage / Waste</option>
                  <option value="OTHER_CIVIC_CANDIDATE">Other Civic Candidate</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#9AADC1] mb-1">
                  Override Severity (0–100)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={overrideSeverity}
                  onChange={(e) => setOverrideSeverity(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-white/15 bg-[#07111F] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#9AADC1] mb-1">
                  Geo Importance (0–100)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={geoScoreInput}
                  onChange={(e) => setGeoScoreInput(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-white/15 bg-[#07111F] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Verification or override note (logged in Audit Trail)..."
              className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
            />

            <div className="flex flex-wrap gap-2">
              {(
                [
                  { action: 'CONFIRM', label: 'Confirm AI', cls: 'bg-[#20C997] text-[#07111F]' },
                  {
                    action: 'CORRECT_CLASSIFICATION',
                    label: 'Apply Correction',
                    cls: 'bg-[#20C8E8] text-[#07111F]',
                  },
                  {
                    action: 'ESCALATE',
                    label: 'Escalate Critical',
                    cls: 'bg-[#FF515A] text-white',
                  },
                  {
                    action: 'REQUEST_EVIDENCE',
                    label: 'Request Evidence',
                    cls: 'bg-white/10 text-[#F4F7FC]',
                  },
                  {
                    action: 'MARK_UNCERTAIN',
                    label: 'Mark Uncertain',
                    cls: 'bg-white/10 text-[#F4F7FC]',
                  },
                  { action: 'REJECT', label: 'Reject', cls: 'bg-white/10 text-[#FF8A90]' },
                ] as Array<{ action: HumanOverrideRecord['action']; label: string; cls: string }>
              ).map((btn) => (
                <button
                  key={btn.action}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction(async () => {
                      await api.verifyIssue(issue.physical_issue_id, {
                        action: btn.action,
                        reason: overrideReason || `${btn.label} action recorded.`,
                        newCategory: overrideCategory,
                        newSeverityScore: overrideSeverity ? Number(overrideSeverity) : undefined,
                        geographicalImportanceScore: geoScoreInput
                          ? Number(geoScoreInput)
                          : undefined,
                      });
                    }, `Applied ${btn.label}.`)
                  }
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${btn.cls}`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Officer Assignment & Resolution */}
            <div className="border-t border-white/10 pt-3 flex flex-wrap items-center gap-2">
              <select
                value={selectedOfficerId}
                onChange={(e) => setSelectedOfficerId(e.target.value)}
                className="flex-1 min-w-[190px] rounded-xl border border-white/15 bg-[#07111F] px-3 py-1.5 text-xs text-white"
              >
                {officers.map((o) => (
                  <option key={o.officer_id} value={o.officer_id}>
                    {o.name} · {o.zone} ({o.active_task_count} active)
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !selectedOfficerId}
                onClick={() =>
                  runAction(async () => {
                    await api.assignIssue(issue.physical_issue_id, {
                      officerId: selectedOfficerId,
                    });
                  }, 'Assigned issue to field officer.')
                }
                className="rounded-xl bg-[#377DFF] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#528eff] disabled:opacity-50"
              >
                Assign Officer
              </button>

              {issue.current_issue_status !== 'RESOLVED' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction(async () => {
                      await api.resolveIssue(issue.physical_issue_id, {
                        note: overrideReason || 'Verified resolved by administrator.',
                      });
                    }, 'Issue marked RESOLVED.')
                  }
                  className="inline-flex items-center gap-1 rounded-xl bg-[#20C997] px-3.5 py-1.5 text-xs font-semibold text-[#07111F] disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mark Resolved
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction(async () => {
                      await api.reopenIssue(issue.physical_issue_id, {
                        reason: overrideReason || 'Reopened for field re-inspection.',
                      });
                    }, 'Issue reopened.')
                  }
                  className="rounded-xl border border-orange-400/40 bg-orange-500/20 px-3.5 py-1.5 text-xs font-semibold text-orange-200 disabled:opacity-50"
                >
                  Reopen Issue
                </button>
              )}
            </div>

            {/* Verify / Correct Coordinates */}
            <div className="border-t border-white/10 pt-3 grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={locLabel}
                onChange={(e) => setLocLabel(e.target.value)}
                placeholder="Verified address label"
                className="sm:col-span-2 rounded-xl border border-white/15 bg-[#07111F] px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="number"
                step="0.0001"
                value={locLat}
                onChange={(e) => setLocLat(e.target.value)}
                placeholder="Lat"
                className="rounded-xl border border-white/15 bg-[#07111F] px-2.5 py-1.5 text-xs font-mono text-white"
              />
              <div className="flex gap-1.5">
                <input
                  type="number"
                  step="0.0001"
                  value={locLng}
                  onChange={(e) => setLocLng(e.target.value)}
                  placeholder="Lng"
                  className="w-full rounded-xl border border-white/15 bg-[#07111F] px-2.5 py-1.5 text-xs font-mono text-white"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction(async () => {
                      await api.updateIssueLocation(issue.physical_issue_id, {
                        latitude: Number(locLat),
                        longitude: Number(locLng),
                        locationLabel: locLabel,
                      });
                    }, 'Authoritative coordinates verified and updated.')
                  }
                  className="rounded-xl border border-[#20C997]/40 bg-[#20C997]/15 px-2.5 py-1.5 text-xs font-medium text-[#68E7BE] whitespace-nowrap"
                >
                  Save Pin
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Field Officer Update Controls */}
        {activeRole === 'FIELD_OFFICER' && issue && (
          <div className="rounded-2xl border border-[#20C997]/30 bg-[#13273B]/45 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-[#20C997]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F4F7FC]">
                Field Execution & Evidence
              </h3>
            </div>
            <textarea
              rows={2}
              value={fieldNote}
              onChange={(e) => setFieldNote(e.target.value)}
              placeholder="Inspection findings, materials dispatched, or completion remarks..."
              className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-xl border border-white/15 bg-[#07111F] px-3 py-1.5 text-xs text-[#9AADC1] hover:text-white">
                {fieldPhotoUrl ? 'Photo Attached ✓' : 'Attach Field Photo (JPG/PNG)'}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleFieldFile}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await api.fieldUpdateIssue(issue.physical_issue_id, {
                      stage: 'START_INSPECTION',
                      note: fieldNote || 'Field inspection started on site.',
                      evidenceDataUrl: fieldPhotoUrl ?? undefined,
                    });
                    setFieldNote('');
                    setFieldPhotoUrl(null);
                  }, 'Task moved to IN PROGRESS.')
                }
                className="rounded-xl bg-[#377DFF] px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Start Inspection / In Progress
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await api.fieldUpdateIssue(issue.physical_issue_id, {
                      stage: 'SUBMIT_RESOLUTION',
                      note: fieldNote || 'Resolution work completed; awaiting review.',
                      evidenceDataUrl: fieldPhotoUrl ?? undefined,
                    });
                    setFieldNote('');
                    setFieldPhotoUrl(null);
                  }, 'Resolution evidence submitted.')
                }
                className="rounded-xl bg-[#20C997] px-3.5 py-1.5 text-xs font-semibold text-[#07111F] disabled:opacity-50"
              >
                Submit Resolution Evidence
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await api.fieldUpdateIssue(issue.physical_issue_id, {
                      stage: 'REQUEST_REASSESSMENT',
                      note: fieldNote || 'Site conditions differ; requesting reassessment.',
                    });
                    setFieldNote('');
                  }, 'Reassessment requested.')
                }
                className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-[#F4F7FC] disabled:opacity-50"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-[#FF963D]" />
                Request Reassessment
              </button>
            </div>
          </div>
        )}

        {/* Timeline & Notes */}
        <div className="rounded-2xl border border-white/10 bg-[#07111F]/70 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#9AADC1]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9AADC1]">
              Audit & Lifecycle Timeline
            </h3>
          </div>
          <div className="space-y-2.5">
            {(report?.timeline ?? []).map((ev) => (
              <div
                key={ev.event_id}
                className="flex items-start justify-between gap-3 border-l-2 border-[#20C8E8]/45 pl-3 text-xs"
              >
                <div>
                  <span className="font-semibold text-[#F4F7FC]">{ev.step}</span>
                  <span className="text-[#9AADC1]"> · {ev.actor_label}</span>
                  <p className="text-[#9AADC1]/90 mt-0.5">{ev.detail}</p>
                </div>
                <span className="font-mono text-[10px] text-[#9AADC1] whitespace-nowrap">
                  {formatIstTimestamp(ev.occurred_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
