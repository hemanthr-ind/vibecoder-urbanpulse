import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  History,
  Settings,
  Shield,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { api, ApiError, formatIstTimestamp } from '../api/client';
import { CivicImage, SeverityBadge, StatusBadge } from '../components/UiBadges';
import type {
  AuditEntry,
  CivicReport,
  FieldOfficer,
  PhysicalIssue,
  PriorityWeights,
  SystemConfig,
  UserAccount,
} from '../shared/types';

export function AdminOfficersPage({
  officers,
  issues,
  onRefresh,
  onNotify,
}: {
  officers: FieldOfficer[];
  issues: PhysicalIssue[];
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [zone, setZone] = useState('Tumakuru Central');
  const [assignIssueId, setAssignIssueId] = useState(
    issues.find((i) => !i.assigned_officer_id && i.current_issue_status !== 'RESOLVED')?.physical_issue_id ?? '',
  );
  const [assignOfficerId, setAssignOfficerId] = useState(officers[0]?.officer_id ?? '');
  const [busy, setBusy] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createOfficer({ name, email, password, zone });
      setName('');
      setEmail('');
      setPassword('');
      await onRefresh();
      onNotify('Field officer added to roster.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Failed to create officer.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async () => {
    if (!assignIssueId || !assignOfficerId) return;
    setBusy(true);
    try {
      await api.assignIssue(assignIssueId, { officerId: assignOfficerId });
      await onRefresh();
      onNotify(`Assigned ${assignIssueId} successfully.`, 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Assignment failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Wrench className="h-5 w-5 text-[#20C997]" />
          <div>
            <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
              Field Officer Management & Dispatch
            </h1>
            <p className="text-xs text-[#9AADC1]">
              Assign verified issues to zone officers, manage availability, or register new field staff.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Interactive Assignment Panel */}
      <div className="rounded-2xl border border-[#20C8E8]/30 bg-[#13273B]/45 p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] text-[#9AADC1] mb-1">Issue to Dispatch</label>
          <select
            value={assignIssueId}
            onChange={(e) => setAssignIssueId(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
          >
            <option value="">Select issue...</option>
            {issues
              .filter((i) => i.current_issue_status !== 'RESOLVED' && i.current_issue_status !== 'REJECTED')
              .map((i) => (
                <option key={i.physical_issue_id} value={i.physical_issue_id}>
                  {i.physical_issue_id} · {i.canonical_summary.slice(0, 48)}
                </option>
              ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] text-[#9AADC1] mb-1">Assign Field Officer</label>
          <select
            value={assignOfficerId}
            onChange={(e) => setAssignOfficerId(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
          >
            {officers.map((o) => (
              <option key={o.officer_id} value={o.officer_id}>
                {o.name} ({o.availability} · {o.active_task_count} active)
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={busy || !assignIssueId || !assignOfficerId}
          onClick={handleAssign}
          className="rounded-xl bg-[#20C8E8] px-4 py-2 text-xs font-semibold text-[#07111F] disabled:opacity-50"
        >
          Dispatch Officer
        </button>
      </div>

      {/* Officer Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {officers.map((off) => (
          <div
            key={off.officer_id}
            className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 space-y-2.5"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-xs text-[#20C8E8]">{off.badge_code}</div>
                <h2 className="font-display text-base font-bold text-[#F4F7FC]">{off.name}</h2>
                <p className="text-xs text-[#9AADC1]">{off.zone}</p>
                <p className="text-[11px] text-[#9AADC1]/80">{off.email}</p>
              </div>
              <select
                value={off.availability}
                onChange={async (e) => {
                  await api.updateOfficer(off.officer_id, {
                    availability: e.target.value as FieldOfficer['availability'],
                  });
                  await onRefresh();
                  onNotify(`Updated availability for ${off.name}.`, 'success');
                }}
                className="rounded-lg border border-white/15 bg-[#07111F] px-2.5 py-1 text-xs text-[#20C997]"
              >
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="ON_FIELD_DUTY">ON FIELD DUTY</option>
                <option value="BUSY">BUSY</option>
                <option value="OFF_DUTY">OFF DUTY</option>
              </select>
            </div>
            <div className="flex items-center gap-4 border-t border-white/10 pt-2.5 text-xs font-mono">
              <span className="text-[#20C8E8]">{off.active_task_count} Active</span>
              <span className="text-[#20C997]">{off.completed_task_count} Completed</span>
              <span className="text-[#9AADC1]">
                Avg: {off.avg_resolution_hours ? `${off.avg_resolution_hours}h` : 'N/A'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Field Officer */}
      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 space-y-3"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-[#F4F7FC]">
          <UserPlus className="h-4 w-4 text-[#20C8E8]" />
          <span>Register New Field Officer</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full Name"
            className="rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
          />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="officer@tumakuru.civic"
            className="rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Initial Password"
            className="rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="Zone"
              className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#20C997] px-4 py-2 text-xs font-semibold text-[#07111F] whitespace-nowrap"
            >
              Add
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function AdminUsersPage({
  onNotify,
}: {
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getUsers();
      setUsers(res.users);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to fetch users.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4 flex items-center gap-2.5">
        <Users className="h-5 w-5 text-[#20C8E8]" />
        <div>
          <h1 className="font-display text-lg font-bold text-[#F4F7FC]">User Management</h1>
          <p className="text-xs text-[#9AADC1]">
            Manage platform accounts, roles, and access states.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0C1929]/80">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-[#07111F]/70 text-[11px] uppercase text-[#9AADC1]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[#9AADC1]">
                  Loading user roster...
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.user_id}>
                  <td className="px-4 py-3 font-medium text-[#F4F7FC]">{u.name}</td>
                  <td className="px-4 py-3 font-mono text-[#9AADC1]">{u.email}</td>
                  <td className="px-4 py-3 font-mono text-[#20C8E8]">{u.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        u.status === 'ACTIVE'
                          ? 'bg-[#20C997]/15 text-[#20C997]'
                          : 'bg-[#FF515A]/15 text-[#FF515A]'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={async () => {
                        const next = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
                        await api.updateUser(u.user_id, { status: next });
                        await load();
                        onNotify(`Account ${u.email} set to ${next}.`, 'success');
                      }}
                      className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-[#F4F7FC]"
                    >
                      {u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminResolvedIssuesPage({
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
  const resolved = issues.filter((i) => i.current_issue_status === 'RESOLVED');
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4 flex items-center gap-2.5">
        <CheckCircle2 className="h-5 w-5 text-[#20C997]" />
        <div>
          <h1 className="font-display text-lg font-bold text-[#F4F7FC]">Resolved Issues</h1>
          <p className="text-xs text-[#9AADC1]">
            Closed civic repairs with verification history and reopen control.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {resolved.map((iss) => {
          const rep = reports.find((r) => r.report_id === iss.associated_report_ids[0]) ?? null;
          return (
            <div
              key={iss.physical_issue_id}
              className="rounded-2xl border border-white/10 bg-[#0C1929]/80 p-4 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <CivicImage
                  src={rep?.evidence_assets[0]?.url}
                  alt={iss.physical_issue_id}
                  className="h-16 w-20 rounded-xl border border-white/10"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#20C8E8]">
                      {iss.physical_issue_id}
                    </span>
                    <StatusBadge status={iss.current_issue_status} />
                    <SeverityBadge severity={iss.severity_label} score={iss.severity_score} />
                  </div>
                  <p className="text-xs text-[#F4F7FC] mt-1">{iss.canonical_summary}</p>
                  <p className="text-[11px] text-[#9AADC1]">
                    Resolved {iss.resolved_at ? formatIstTimestamp(iss.resolved_at) : ''} · Officer:{' '}
                    {iss.assigned_officer_name ?? 'Admin'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenReport(rep, iss)}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-[#F4F7FC]"
                >
                  Inspect Evidence
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await api.reopenIssue(iss.physical_issue_id, {
                      reason: 'Reopened from Resolved Issues archive.',
                    });
                    await onRefresh();
                    onNotify(`Reopened ${iss.physical_issue_id}.`, 'info');
                  }}
                  className="rounded-xl border border-orange-400/40 bg-orange-500/20 px-3 py-1.5 text-xs font-medium text-orange-200"
                >
                  Reopen
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminSystemConfigPage({
  config,
  onRefresh,
  onNotify,
}: {
  config: SystemConfig;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [weights, setWeights] = useState<PriorityWeights>(config.priority_weights);
  const [minCoverage, setMinCoverage] = useState(config.minimum_priority_factor_coverage);
  const [autoResolve, setAutoResolve] = useState(config.auto_resolve_on_field_submission);
  const [busy, setBusy] = useState(false);

  const sum =
    weights.severity +
    weights.public_impact +
    weights.geographical_importance +
    weights.independent_corroboration +
    weights.time_unresolved;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateConfig({
        priority_weights: weights,
        minimum_priority_factor_coverage: minCoverage,
        auto_resolve_on_field_submission: autoResolve,
      });
      await onRefresh();
      onNotify('System scoring weights & workflow rules saved.', 'success');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Failed to save config.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Settings className="h-5 w-5 text-[#20C8E8]" />
          <div>
            <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
              System Configuration
            </h1>
            <p className="text-xs text-[#9AADC1]">
              Configure deterministic 5-factor priority weights (must sum to 100%) and resolution rules.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              { key: 'severity', label: 'Visual Severity (%)' },
              { key: 'public_impact', label: 'Public Impact (%)' },
              { key: 'geographical_importance', label: 'Geographical Importance (%)' },
              { key: 'independent_corroboration', label: 'Corroboration (%)' },
              { key: 'time_unresolved', label: 'Age / Time Unresolved (%)' },
            ] as Array<{ key: keyof PriorityWeights; label: string }>
          ).map((item) => (
            <div key={item.key}>
              <label className="block text-xs text-[#9AADC1] mb-1">{item.label}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={weights[item.key]}
                onChange={(e) =>
                  setWeights({ ...weights, [item.key]: Number(e.target.value) })
                }
                className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 font-mono text-sm text-white"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-[#9AADC1] mb-1">
              Minimum Factor Coverage (0.40 – 1.00)
            </label>
            <input
              type="number"
              step="0.05"
              min={0.4}
              max={1}
              value={minCoverage}
              onChange={(e) => setMinCoverage(Number(e.target.value))}
              className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 font-mono text-sm text-white"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#07111F]/70 p-3 text-xs">
          <span className="text-[#9AADC1]">Current Weight Sum</span>
          <span
            className={`font-mono font-bold ${
              Math.abs(sum - 100) < 0.01 ? 'text-[#20C997]' : 'text-[#FF515A]'
            }`}
          >
            {sum}% {Math.abs(sum - 100) < 0.01 ? '(Valid)' : '(Must equal 100%)'}
          </span>
        </div>

        <label className="flex items-center gap-2.5 text-xs text-[#F4F7FC] cursor-pointer">
          <input
            type="checkbox"
            checked={autoResolve}
            onChange={(e) => setAutoResolve(e.target.checked)}
            className="accent-[#20C8E8]"
          />
          <span>
            Auto-mark RESOLVED when Field Officer submits completion evidence (off = requires Admin closure)
          </span>
        </label>

        <button
          type="submit"
          disabled={busy || Math.abs(sum - 100) >= 0.01}
          className="rounded-xl bg-[#20C8E8] px-5 py-2 text-xs font-semibold text-[#07111F] disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </form>
  );
}

export function AdminAuditLogsPage({
  onNotify,
}: {
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getAuditLogs()
      .then((res) => setLogs(res.auditLogs))
      .catch((err) =>
        onNotify(err instanceof ApiError ? err.message : 'Unable to fetch audit logs.', 'error'),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-4 flex items-center gap-2.5">
        <History className="h-5 w-5 text-[#20C8E8]" />
        <div>
          <h1 className="font-display text-lg font-bold text-[#F4F7FC]">Audit Logs</h1>
          <p className="text-xs text-[#9AADC1]">
            Immutable record of verifications, overrides, assignments, resolutions, and config updates.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/80 divide-y divide-white/10">
        {loading ? (
          <div className="p-6 text-center text-xs text-[#9AADC1]">Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#9AADC1]">No audit entries recorded yet.</div>
        ) : (
          logs.map((log) => (
            <div key={log.audit_id} className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-[#20C8E8]" />
                  <span className="font-mono font-semibold text-[#20C8E8]">{log.action}</span>
                  <span className="text-[#9AADC1]">· {log.actor_name} ({log.actor_role})</span>
                </div>
                <p className="text-[#F4F7FC]/90">{log.summary}</p>
              </div>
              <span className="font-mono text-[11px] text-[#9AADC1]">
                {formatIstTimestamp(log.occurred_at)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
