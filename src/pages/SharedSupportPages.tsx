import React, { useMemo, useState } from 'react';
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Megaphone,
  Search,
  User,
} from 'lucide-react';
import { api, formatIstTimestamp } from '../api/client';
import { CivicImage, StatusBadge } from '../components/UiBadges';
import type {
  CivicReport,
  NotificationItem,
  PhysicalIssue,
  UserAccount,
  UserRole,
} from '../shared/types';

export function CommunityUpdatesPage({
  reports,
  issues,
  onOpenReport,
}: {
  reports: CivicReport[];
  issues: PhysicalIssue[];
  onOpenReport: (report: CivicReport | null, issue: PhysicalIssue | null) => void;
}) {
  const issueMap = useMemo(
    () => new Map(issues.map((i) => [i.physical_issue_id, i])),
    [issues],
  );
  const highlights = issues.filter(
    (i) => i.current_issue_status === 'RESOLVED' || i.current_issue_status === 'IN_PROGRESS',
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4 flex items-center gap-2.5">
        <Megaphone className="h-5 w-5 text-[#20C997]" />
        <div>
          <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
            Tumakuru Community Updates
          </h1>
          <p className="text-xs text-[#9AADC1]">
            Verified repairs in progress and recently closed civic works across city corridors.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {highlights.map((iss) => {
          const rep = reports.find((r) => r.report_id === iss.associated_report_ids[0]) ?? null;
          return (
            <div
              key={iss.physical_issue_id}
              onClick={() => onOpenReport(rep, iss)}
              className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 flex items-center gap-4 cursor-pointer hover:border-[#20C8E8]/40"
            >
              <CivicImage
                src={rep?.evidence_assets[0]?.url}
                alt={iss.physical_issue_id}
                className="h-16 w-20 rounded-xl border border-white/10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-[#20C8E8]">
                    {iss.physical_issue_id}
                  </span>
                  <StatusBadge status={iss.current_issue_status} />
                </div>
                <p className="text-sm font-medium text-[#F4F7FC] mt-1">
                  {iss.canonical_summary}
                </p>
                <p className="text-xs text-[#9AADC1] mt-0.5">
                  {iss.authoritative_location?.human_readable_label ?? 'Tumakuru'} · Updated{' '}
                  {formatIstTimestamp(iss.last_updated_at)}
                </p>
              </div>
            </div>
          );
        })}
        {highlights.length === 0 && issueMap.size === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#0C1929]/70 p-6 text-center text-xs text-[#9AADC1]">
            No updates published yet.
          </div>
        )}
      </div>
    </div>
  );
}

export function NotificationsPage({
  notifications,
  onRefresh,
}: {
  notifications: NotificationItem[];
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Bell className="h-5 w-5 text-[#20C8E8]" />
          <div>
            <h1 className="font-display text-lg font-bold text-[#F4F7FC]">Notifications</h1>
            <p className="text-xs text-[#9AADC1]">
              Role-scoped alerts for submissions, verifications, dispatches, and resolutions.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await api.markNotificationRead('all');
            await onRefresh();
          }}
          className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-[#F4F7FC]"
        >
          <CheckCheck className="h-3.5 w-3.5 text-[#20C997]" />
          Mark All Read
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/80 divide-y divide-white/10">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#9AADC1]">
            No notifications for your active role.
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.notification_id}
              onClick={async () => {
                if (!n.read) {
                  await api.markNotificationRead(n.notification_id);
                  await onRefresh();
                }
              }}
              className={`p-4 flex items-start justify-between gap-3 cursor-pointer ${
                n.read ? 'opacity-70' : 'bg-[#20C8E8]/5'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  {!n.read && <span className="h-2 w-2 rounded-full bg-[#20C8E8]" />}
                  <span className="text-xs font-semibold text-[#F4F7FC]">{n.title}</span>
                </div>
                <p className="text-xs text-[#9AADC1] mt-1">{n.message}</p>
              </div>
              <span className="font-mono text-[10px] text-[#9AADC1] whitespace-nowrap">
                {formatIstTimestamp(n.created_at)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const FAQS = [
  {
    q: 'How does UrbanPulse AI classify civic photographs without fabricating detector scores?',
    a: 'UrbanPulse AI operates in VISION_ONLY mode using Gemini visual reasoning. Because no separate bounding-box detector is attached, raw detector confidence and bounding boxes remain null (NOT_PROVIDED_BY_DETECTOR). Visual Severity (0–100) and Public Impact (0–100) are assessed separately from evidence visible in the photo.',
  },
  {
    q: 'What do the map marker colors and shapes represent?',
    a: 'By default, marker color encodes Severity: Green (Low 0–24), Blue (Moderate 25–49), Red (High 50–74), Red with critical pulse (Critical 75–100), and Neutral Grey (Unknown / pending category rubric). Green never means Resolved—issue status is shown on the status badge and popup. Marker icons identify category (Pothole, Garbage/Waste, Other Civic).',
  },
  {
    q: 'How does the 5-factor Priority formula handle missing context?',
    a: 'Priority weights Visual Severity (35%), Public Impact (25%), Geographical Importance (15%), Independent Corroboration (15%), and Time Unresolved (10%). Missing factors are never converted to 0. If available factor coverage is 60%–99%, a PROVISIONAL score is calculated over available weights; below 60%, priority is UNDETERMINED.',
  },
  {
    q: 'Can switching the top role selector grant Admin or Field Officer permissions?',
    a: 'No. Citizens can browse public maps and submit reports without escalating privileges. Administrator and Field Officer workspaces enforce server-side password authentication and Bearer token validation on every privileged API call.',
  },
];

export function HelpCentrePage({ activeRole }: { activeRole: UserRole }) {
  const [query, setQuery] = useState('');
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [supportSent, setSupportSent] = useState(false);

  const visibleFaqs = FAQS.filter(
    (f) =>
      !query.trim() ||
      f.q.toLowerCase().includes(query.toLowerCase()) ||
      f.a.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <HelpCircle className="h-5 w-5 text-[#20C8E8]" />
          <div>
            <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
              UrbanPulse AI Help Centre ({activeRole.replaceAll('_', ' ')})
            </h1>
            <p className="text-xs text-[#9AADC1]">
              Documentation for reporting, GIS map semantics, severity/priority scoring, and field verification.
            </p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#9AADC1]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help topics (e.g. heatmap, priority, GPS, VISION_ONLY)..."
            className="w-full rounded-xl border border-white/15 bg-[#07111F] pl-9 pr-3 py-2 text-xs text-white"
          />
        </div>
      </div>

      <div className="space-y-2">
        {visibleFaqs.map((item, idx) => (
          <div
            key={item.q}
            className="rounded-2xl border border-white/10 bg-[#0C1929]/80 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left text-xs font-semibold text-[#F4F7FC]"
            >
              <span>{item.q}</span>
              {openIdx === idx ? (
                <ChevronUp className="h-4 w-4 text-[#20C8E8] shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#9AADC1] shrink-0" />
              )}
            </button>
            {openIdx === idx && (
              <div className="border-t border-white/10 px-4 py-3 text-xs text-[#9AADC1] leading-relaxed">
                {item.a}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSupportSent(true);
        }}
        className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 space-y-3"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AADC1]">
          Contact Tumakuru Civic Support Desk
        </h2>
        {supportSent ? (
          <p className="text-xs text-[#20C997]">
            Support inquiry logged for municipal review.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              required
              placeholder="Describe your issue or ward feedback..."
              className="flex-1 min-w-[220px] rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#20C8E8] px-4 py-2 text-xs font-semibold text-[#07111F]"
            >
              Send Inquiry
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export function ProfilePage({
  activeRole,
  currentUser,
  onOpenAuth,
  onLogout,
}: {
  activeRole: UserRole;
  currentUser: UserAccount | null;
  onOpenAuth: (role: UserRole) => void;
  onLogout: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#0C1929]/85 p-6 space-y-4">
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#20C8E8]/35 bg-[#20C8E8]/15 text-[#20C8E8]">
          <User className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
            {currentUser?.name ?? 'Public Guest User'}
          </h1>
          <p className="text-xs text-[#9AADC1]">
            Active Role: <span className="font-mono text-[#20C8E8]">{activeRole}</span>
            {currentUser?.email ? ` · ${currentUser.email}` : ''}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#07111F]/70 p-4 text-xs text-[#9AADC1] space-y-1.5">
        <p>Jurisdiction: Tumakuru, Karnataka, India (Asia/Kolkata)</p>
        <p>Authentication: Server-signed HMAC-SHA256 session token (held in memory only)</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {currentUser ? (
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-[#FF515A]/45 bg-[#FF515A]/15 px-4 py-2 text-xs font-semibold text-[#FF9DA2]"
          >
            Sign Out
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenAuth('CITIZEN')}
            className="rounded-xl bg-[#20C8E8] px-4 py-2 text-xs font-semibold text-[#07111F]"
          >
            Sign In / Register Citizen Account
          </button>
        )}
      </div>
    </div>
  );
}
