import React, { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ClipboardList,
  Clock,
  Navigation,
  Wrench,
} from 'lucide-react';
import { formatCategoryLabel, formatIstTimestamp } from '../api/client';
import { CivicImage, PriorityBadge, SeverityBadge, StatusBadge } from '../components/UiBadges';
import { haversineDistanceMeters, TUMAKURU_CONTEXT } from '../shared/geospatial';
import type {
  CivicReport,
  FieldOfficer,
  PhysicalIssue,
  UserAccount,
} from '../shared/types';

export function FieldOfficerTasksPage({
  mode,
  issues,
  reports,
  officers,
  currentUser,
  onOpenReport,
}: {
  mode: 'ACTIVE' | 'HISTORY';
  issues: PhysicalIssue[];
  reports: CivicReport[];
  officers: FieldOfficer[];
  currentUser: UserAccount | null;
  onOpenReport: (report: CivicReport | null, issue: PhysicalIssue | null) => void;
}) {
  const [sortBy, setSortBy] = useState<'PRIORITY' | 'DISTANCE'>('PRIORITY');

  const officerProfile = useMemo(
    () => officers.find((o) => o.user_id === currentUser?.user_id) ?? null,
    [officers, currentUser?.user_id],
  );

  const reportMap = useMemo(
    () => new Map(reports.map((r) => [r.report_id, r])),
    [reports],
  );

  const filteredIssues = useMemo(() => {
    const mineOrAll = issues.filter((i) => {
      if (officerProfile && i.assigned_officer_id && i.assigned_officer_id !== officerProfile.officer_id) {
        return false;
      }
      if (mode === 'ACTIVE') {
        return (
          i.current_issue_status !== 'RESOLVED' &&
          i.current_issue_status !== 'REJECTED'
        );
      }
      return (
        i.current_issue_status === 'RESOLVED' ||
        i.current_issue_status === 'RESOLUTION_SUBMITTED'
      );
    });

    return [...mineOrAll].sort((a, b) => {
      if (sortBy === 'DISTANCE') {
        const distA = a.authoritative_location?.latitude
          ? haversineDistanceMeters(
              TUMAKURU_CONTEXT.defaultCenter.lat,
              TUMAKURU_CONTEXT.defaultCenter.lng,
              a.authoritative_location.latitude,
              a.authoritative_location.longitude!,
            )
          : Number.MAX_SAFE_INTEGER;
        const distB = b.authoritative_location?.latitude
          ? haversineDistanceMeters(
              TUMAKURU_CONTEXT.defaultCenter.lat,
              TUMAKURU_CONTEXT.defaultCenter.lng,
              b.authoritative_location.latitude,
              b.authoritative_location.longitude!,
            )
          : Number.MAX_SAFE_INTEGER;
        return distA - distB;
      }
      return (b.priority_assessment.score ?? -1) - (a.priority_assessment.score ?? -1);
    });
  }, [issues, officerProfile, mode, sortBy]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {mode === 'ACTIVE' ? (
            <ClipboardList className="h-5 w-5 text-[#20C997]" />
          ) : (
            <Clock className="h-5 w-5 text-[#20C8E8]" />
          )}
          <div>
            <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
              {mode === 'ACTIVE' ? 'Assigned Field Tasks' : 'Completed Task History'}
            </h1>
            <p className="text-xs text-[#9AADC1]">
              {officerProfile
                ? `${officerProfile.name} (${officerProfile.badge_code}) · ${officerProfile.zone}`
                : 'Showing Tumakuru field assignments'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#9AADC1]">Sort by:</span>
          <div className="inline-flex rounded-xl border border-white/15 bg-[#07111F] p-0.5">
            <button
              type="button"
              onClick={() => setSortBy('PRIORITY')}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                sortBy === 'PRIORITY' ? 'bg-[#20C8E8] text-[#07111F]' : 'text-[#9AADC1]'
              }`}
            >
              Priority
            </button>
            <button
              type="button"
              onClick={() => setSortBy('DISTANCE')}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                sortBy === 'DISTANCE' ? 'bg-[#20C8E8] text-[#07111F]' : 'text-[#9AADC1]'
              }`}
            >
              Distance
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filteredIssues.map((iss) => {
          const rep = reportMap.get(iss.associated_report_ids[0]) ?? null;
          const distKm =
            iss.authoritative_location?.latitude !== null &&
            iss.authoritative_location?.latitude !== undefined &&
            iss.authoritative_location?.longitude !== null &&
            iss.authoritative_location?.longitude !== undefined
              ? (
                  haversineDistanceMeters(
                    TUMAKURU_CONTEXT.defaultCenter.lat,
                    TUMAKURU_CONTEXT.defaultCenter.lng,
                    iss.authoritative_location.latitude,
                    iss.authoritative_location.longitude,
                  ) / 1000
                ).toFixed(2)
              : null;

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
                    <PriorityBadge
                      label={iss.priority_assessment.label}
                      score={iss.priority_assessment.score}
                      provisional={iss.priority_assessment.is_provisional}
                    />
                    <StatusBadge status={iss.current_issue_status} />
                  </div>
                  <p className="text-xs text-[#F4F7FC]/90">{iss.canonical_summary}</p>
                  <p className="text-[11px] text-[#9AADC1]">
                    {iss.authoritative_location?.human_readable_label ?? 'Unlocated'}
                    {distKm ? ` · ${distKm} km from center` : ''} ·{' '}
                    {iss.assigned_officer_name
                      ? `Assigned: ${iss.assigned_officer_name}`
                      : 'Awaiting officer dispatch'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenReport(rep, iss)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#20C997] px-3.5 py-2 text-xs font-semibold text-[#07111F]"
                >
                  <Wrench className="h-3.5 w-3.5" />
                  Inspect & Update
                </button>
                {iss.authoritative_location?.latitude && (
                  <a
                    href={`https://www.openstreetmap.org/directions?to=${iss.authoritative_location.latitude},${iss.authoritative_location.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-[#F4F7FC]"
                  >
                    <Navigation className="h-3.5 w-3.5 text-[#20C8E8]" />
                    Route
                  </a>
                )}
              </div>
            </div>
          );
        })}

        {filteredIssues.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#0C1929]/70 p-8 text-center text-xs text-[#9AADC1]">
            No tasks in this queue right now.
          </div>
        )}
      </div>
    </div>
  );
}

export function FieldOfficerPerformancePage({
  officers,
  currentUser,
  issues,
}: {
  officers: FieldOfficer[];
  currentUser: UserAccount | null;
  issues: PhysicalIssue[];
}) {
  const officer =
    officers.find((o) => o.user_id === currentUser?.user_id) ?? officers[0] ?? null;

  const myActive = officer
    ? issues.filter(
        (i) =>
          i.assigned_officer_id === officer.officer_id &&
          i.current_issue_status !== 'RESOLVED',
      ).length
    : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-5 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/35">
          <Award className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
            Field Officer Performance
          </h1>
          <p className="text-xs text-[#9AADC1]">
            {officer ? `${officer.name} · ${officer.badge_code} (${officer.zone})` : 'Tumakuru Field Ops'}
          </p>
        </div>
      </div>

      {officer && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4">
            <div className="text-xs text-[#9AADC1]">Active Assignments</div>
            <div className="mt-1 font-display text-3xl font-bold text-[#20C8E8] tabular-nums">
              {myActive}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4">
            <div className="text-xs text-[#9AADC1]">Completed Repairs</div>
            <div className="mt-1 font-display text-3xl font-bold text-[#20C997] tabular-nums">
              {officer.completed_task_count}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4">
            <div className="text-xs text-[#9AADC1]">Avg Resolution Time</div>
            <div className="mt-1 font-display text-3xl font-bold text-[#F4F7FC] tabular-nums">
              {officer.avg_resolution_hours ? `${officer.avg_resolution_hours}h` : 'N/A'}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 flex items-center gap-2.5 text-xs text-[#9AADC1]">
        <CheckCircle2 className="h-4 w-4 text-[#20C997]" />
        <span>
          Field photo evidence uploaded during resolution is automatically attached to the linked citizen report timeline.
        </span>
      </div>
    </div>
  );
}
