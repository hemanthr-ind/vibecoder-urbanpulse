import React, { useMemo } from 'react';
import {
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Construction,
  FileText,
  Flame,
  HelpCircle,
  MapPin,
  PlusCircle,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  formatCategoryLabel,
  formatRelativeTime,
  type DashboardPayload,
} from '../api/client';
import { CityMap } from '../components/CityMap';
import { CivicImage, PriorityBadge, SeverityBadge, StatusBadge } from '../components/UiBadges';
import { filterMapFeatures } from '../shared/geospatial';
import type {
  CivicReport,
  MapFilterState,
  MapPointFeature,
  PhysicalIssue,
  UserAccount,
  UserRole,
} from '../shared/types';

export function HomeOverview({
  dashboard,
  activeRole,
  currentUser,
  filters,
  onFiltersChange,
  selectedFeatureId,
  onSelectFeature,
  onOpenReport,
  onNavigate,
}: {
  dashboard: DashboardPayload;
  activeRole: UserRole;
  currentUser: UserAccount | null;
  filters: MapFilterState;
  onFiltersChange: (next: MapFilterState) => void;
  selectedFeatureId: string | null;
  onSelectFeature: (feature: MapPointFeature | null) => void;
  onOpenReport: (report: CivicReport | null, issue: PhysicalIssue | null) => void;
  onNavigate: (page: string) => void;
}) {
  const { kpis, recentReports, issues, officers, mapSummary, hasDemoSeedData } = dashboard;

  const filteredFeatures = useMemo(
    () => filterMapFeatures(mapSummary.features, filters),
    [mapSummary.features, filters],
  );

  const issueById = useMemo(
    () => new Map(issues.map((i) => [i.physical_issue_id, i])),
    [issues],
  );

  const featureByReportId = useMemo(
    () => new Map(mapSummary.features.map((f) => [f.primary_report_id, f])),
    [mapSummary.features],
  );

  const priorityAlerts = useMemo(
    () =>
      issues
        .filter(
          (i) =>
            (i.severity_label === 'CRITICAL' || i.safety_review_flag) &&
            i.current_issue_status !== 'RESOLVED' &&
            i.current_issue_status !== 'REJECTED',
        )
        .slice(0, 3),
    [issues],
  );

  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const displayName =
    currentUser?.name ||
    (activeRole === 'ADMIN'
      ? 'Municipal Administrator'
      : activeRole === 'FIELD_OFFICER'
        ? 'Field Officer'
        : 'Tumakuru Citizen');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
      {/* LEFT WORKSPACE (~33%): Compact Overview & Report Activity */}
      <div className="lg:col-span-4 flex flex-col gap-3.5 lg:h-[calc(100vh-92px)] lg:overflow-y-auto pr-0.5">
        {/* A. Welcome Section */}
        <section className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4 backdrop-blur-xl shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#20C8E8]">
                {activeRole === 'ADMIN'
                  ? 'Municipal Command'
                  : activeRole === 'FIELD_OFFICER'
                    ? 'Field Operations'
                    : 'Civic Intelligence Portal'}
              </p>
              <h1 className="mt-0.5 font-display text-lg font-bold text-[#F4F7FC]">
                Welcome, {displayName}
              </h1>
              <p className="text-xs text-[#9AADC1] mt-0.5">
                {todayFormatted} · Tumakuru Smart City Grid
              </p>
            </div>
            {hasDemoSeedData && (
              <span
                title="Preloaded Tumakuru records are demonstration baseline data"
                className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-[#9AADC1] whitespace-nowrap"
              >
                Includes Sample Data
              </span>
            )}
          </div>
          <p className="mt-2.5 text-xs text-[#F4F7FC]/85">
            {kpis.criticalIssues > 0
              ? `${kpis.criticalIssues} critical issue(s) active across Tumakuru corridors. ${kpis.pendingVerification} item(s) awaiting human review.`
              : `Operations nominal. ${kpis.pendingIssues} active issue(s) monitored across Tumakuru.`}
          </p>
        </section>

        {/* B. Compact Civic Statistics */}
        <section className="grid grid-cols-2 gap-2.5">
          {[
            {
              label: 'Total Reports',
              value: kpis.totalReportsSubmitted,
              sub: `${kpis.uniquePhysicalIssues} unique issues`,
              icon: FileText,
              accent: 'text-[#20C8E8] border-[#20C8E8]/25 bg-[#20C8E8]/10',
            },
            {
              label: 'Pending Issues',
              value: kpis.pendingIssues,
              sub: `${kpis.pendingVerification} need review`,
              icon: Clock,
              accent: 'text-[#FF963D] border-[#FF963D]/25 bg-[#FF963D]/10',
            },
            {
              label: 'Critical Issues',
              value: kpis.criticalIssues,
              sub: `${kpis.highPriorityIssues} high+ priority`,
              icon: AlertOctagon,
              accent: 'text-[#FF515A] border-[#FF515A]/25 bg-[#FF515A]/10',
            },
            {
              label: 'Resolved Issues',
              value: kpis.resolvedIssues,
              sub: 'Closed & verified',
              icon: CheckCircle2,
              accent: 'text-[#20C997] border-[#20C997]/25 bg-[#20C997]/10',
            },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.label}
                className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-3 backdrop-blur-md shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#9AADC1]">{kpi.label}</span>
                  <span className={`rounded-lg border p-1 ${kpi.accent}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="mt-1.5 font-display text-2xl font-bold text-[#F4F7FC] tabular-nums">
                  {kpi.value}
                </div>
                <div className="text-[10px] text-[#9AADC1]/85">{kpi.sub}</div>
              </div>
            );
          })}
        </section>

        {/* C. Issue Categories */}
        <section className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-3.5 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AADC1]">
              Issue Categories
            </h2>
            {mapSummary.unlocatedCount > 0 && (
              <span className="text-[10px] text-[#FF963D]">
                {mapSummary.unlocatedCount} unlocated
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: 'Potholes', count: kpis.potholeIssues, icon: Construction, color: 'text-[#FF757C]' },
              { label: 'Garbage / Waste', count: kpis.garbageIssues, icon: Trash2, color: 'text-[#20C997]' },
              { label: 'Other Candidates', count: kpis.otherCivicCandidates, icon: MapPin, color: 'text-[#FF963D]' },
              { label: 'Uncertain', count: kpis.uncertainReports, icon: HelpCircle, color: 'text-[#9AADC1]' },
            ].map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.label}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#07111F]/65 px-2.5 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${cat.color}`} />
                    <span className="truncate text-[11px] text-[#F4F7FC]">{cat.label}</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#F4F7FC] tabular-nums">
                    {cat.count}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* D. Recent Reports (with visible thumbnails & map highlight on click) */}
        <section className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-3.5 backdrop-blur-md space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AADC1]">
              Recent Reports
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#20C8E8] hover:underline"
            >
              View All
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-2">
            {recentReports.slice(0, 6).map((rep) => {
              const linkedIssue = rep.physical_issue_id
                ? issueById.get(rep.physical_issue_id) ?? null
                : null;
              const linkedFeature = featureByReportId.get(rep.report_id) ?? null;
              const isSelected =
                selectedFeatureId === linkedFeature?.feature_id ||
                selectedFeatureId === rep.report_id;

              return (
                <div
                  key={rep.report_id}
                  onClick={() => {
                    if (linkedFeature) {
                      onSelectFeature(linkedFeature);
                    } else {
                      onOpenReport(rep, linkedIssue);
                    }
                  }}
                  className={`group flex items-center gap-3 rounded-xl border p-2.5 cursor-pointer transition ${
                    isSelected
                      ? 'border-[#20C8E8] bg-[#20C8E8]/12'
                      : 'border-white/10 bg-[#07111F]/65 hover:border-white/25'
                  }`}
                >
                  <CivicImage
                    src={rep.evidence_assets[0]?.url}
                    alt={rep.description || rep.report_reference}
                    className="h-14 w-14 rounded-lg shrink-0 border border-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-mono text-[11px] font-semibold text-[#20C8E8]">
                        {rep.report_reference}
                      </span>
                      <span className="text-[10px] text-[#9AADC1] whitespace-nowrap">
                        {formatRelativeTime(rep.submitted_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs font-semibold text-[#F4F7FC] truncate">
                        {formatCategoryLabel(
                          linkedIssue?.canonical_category ?? rep.user_selected_category,
                        )}
                      </span>
                      {linkedIssue && (
                        <PriorityBadge
                          label={linkedIssue.priority_assessment.label}
                          score={linkedIssue.priority_assessment.score}
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-[11px] text-[#9AADC1] truncate">
                        {rep.location_label}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenReport(rep, linkedIssue);
                        }}
                        className="text-[10px] font-medium text-[#20C8E8] hover:underline shrink-0"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* E. Priority Alerts & Quick Actions */}
        {priorityAlerts.length > 0 && (
          <section className="rounded-2xl border border-[#FF515A]/30 bg-[#FF515A]/10 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FF9DA2]">
              <Flame className="h-4 w-4 text-[#FF515A]" />
              <span>Priority Safety Alerts</span>
            </div>
            {priorityAlerts.map((iss) => {
              const rep =
                recentReports.find((r) => r.report_id === iss.associated_report_ids[0]) ?? null;
              return (
                <button
                  key={iss.physical_issue_id}
                  type="button"
                  onClick={() => onOpenReport(rep, iss)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#07111F]/80 px-3 py-2 text-left hover:border-[#FF515A]/50"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#F4F7FC] truncate">
                      {iss.canonical_summary}
                    </div>
                    <div className="text-[10px] text-[#9AADC1] truncate">
                      {iss.authoritative_location?.human_readable_label ?? 'Tumakuru'}
                    </div>
                  </div>
                  <SeverityBadge severity={iss.severity_label} score={iss.severity_score} />
                </button>
              );
            })}
          </section>
        )}

        <section className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-3.5 flex flex-wrap gap-2">
          {activeRole === 'CITIZEN' && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('report')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#20C8E8] px-3 py-2 text-xs font-semibold text-[#07111F]"
              >
                <PlusCircle className="h-4 w-4" />
                Report Issue
              </button>
              <button
                type="button"
                onClick={() => onNavigate('track')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-[#F4F7FC]"
              >
                <Search className="h-4 w-4 text-[#20C997]" />
                Track Report
              </button>
            </>
          )}
          {activeRole === 'ADMIN' && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('verification')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#20C8E8] px-3 py-2 text-xs font-semibold text-[#07111F]"
              >
                <ClipboardCheck className="h-4 w-4" />
                Verification Queue
              </button>
              <button
                type="button"
                onClick={() => onNavigate('map')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-[#F4F7FC]"
              >
                <Flame className="h-4 w-4 text-[#FF515A]" />
                Severity Heatmap
              </button>
            </>
          )}
          {activeRole === 'FIELD_OFFICER' && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#20C997] px-3 py-2 text-xs font-semibold text-[#07111F]"
              >
                <Wrench className="h-4 w-4" />
                Assigned Tasks
              </button>
              <button
                type="button"
                onClick={() => onNavigate('map')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-[#F4F7FC]"
              >
                <MapPin className="h-4 w-4 text-[#20C8E8]" />
                Route Map
              </button>
            </>
          )}
        </section>
      </div>

      {/* RIGHT WORKSPACE (~67%): Primary Interactive GIS Live City Map */}
      <div className="lg:col-span-8 h-[520px] lg:h-[calc(100vh-92px)]">
        <CityMap
          features={filteredFeatures}
          unlocatedCount={mapSummary.unlocatedCount}
          filters={filters}
          onFiltersChange={onFiltersChange}
          officers={officers}
          selectedFeatureId={selectedFeatureId}
          onSelectFeature={onSelectFeature}
          onViewFullReport={(reportId, issueId) => {
            const rep = recentReports.find((r) => r.report_id === reportId) ?? null;
            const iss = issueId ? issueById.get(issueId) ?? null : null;
            onOpenReport(rep, iss);
          }}
          allowHeatmap={false}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
