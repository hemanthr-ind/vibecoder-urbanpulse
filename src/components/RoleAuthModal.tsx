import React, { useState } from 'react';
import { Lock, ShieldCheck, UserCheck, Wrench, X } from 'lucide-react';
import { api, ApiError, type AuthStatusResponse } from '../api/client';
import type { UserAccount, UserRole } from '../shared/types';

export function RoleAuthModal({
  targetRole,
  authStatus,
  onClose,
  onAuthenticated,
}: {
  targetRole: UserRole;
  authStatus: AuthStatusResponse | null;
  onClose: () => void;
  onAuthenticated: (token: string, user: UserAccount) => void;
}) {
  const isAdminUnclaimed =
    targetRole === 'ADMIN' && authStatus && !authStatus.adminClaimed;
  const unclaimedOfficers = authStatus?.unclaimedOfficers ?? [];

  const [mode, setMode] = useState<'LOGIN' | 'CLAIM_ADMIN' | 'CLAIM_OFFICER' | 'CITIZEN_REGISTER'>(
    isAdminUnclaimed ? 'CLAIM_ADMIN' : 'LOGIN',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedOfficerId, setSelectedOfficerId] = useState(
    unclaimedOfficers[0]?.officer_id ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'CLAIM_ADMIN') {
        const res = await api.claimAdmin({ name, email, password });
        onAuthenticated(res.token, res.user);
      } else if (mode === 'CLAIM_OFFICER') {
        const res = await api.claimOfficer({
          officerId: selectedOfficerId,
          password,
        });
        onAuthenticated(res.token, res.user);
      } else if (mode === 'CITIZEN_REGISTER') {
        const res = await api.registerCitizen({ name, email, password });
        onAuthenticated(res.token, res.user);
      } else {
        const res = await api.login({
          email,
          password,
          expectedRole: targetRole,
        });
        onAuthenticated(res.token, res.user);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-[#07111F]/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0C1929] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#20C8E8]/35 bg-[#20C8E8]/15 text-[#20C8E8]">
              {targetRole === 'ADMIN' ? (
                <ShieldCheck className="h-5 w-5" />
              ) : targetRole === 'FIELD_OFFICER' ? (
                <Wrench className="h-5 w-5" />
              ) : (
                <UserCheck className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-[#F4F7FC]">
                {mode === 'CLAIM_ADMIN'
                  ? 'Initialize Administrator Account'
                  : mode === 'CLAIM_OFFICER'
                    ? 'Activate Field Officer Account'
                    : mode === 'CITIZEN_REGISTER'
                      ? 'Create Citizen Account'
                      : targetRole === 'ADMIN'
                        ? 'Administrator Sign In'
                        : targetRole === 'FIELD_OFFICER'
                          ? 'Field Officer Sign In'
                          : 'Citizen Sign In'}
              </h2>
              <p className="text-xs text-[#9AADC1]">
                Server-verified RBAC · Session held securely in memory
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#9AADC1] hover:bg-white/10 hover:text-white"
            aria-label="Close authentication modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode switchers where applicable */}
        {targetRole === 'FIELD_OFFICER' && unclaimedOfficers.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-[#07111F] p-1 border border-white/10">
            <button
              type="button"
              onClick={() => {
                setMode('LOGIN');
                setError(null);
              }}
              className={`rounded-lg py-1.5 text-xs font-medium transition ${
                mode === 'LOGIN' ? 'bg-[#13273B] text-[#20C8E8]' : 'text-[#9AADC1]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('CLAIM_OFFICER');
                setError(null);
              }}
              className={`rounded-lg py-1.5 text-xs font-medium transition ${
                mode === 'CLAIM_OFFICER' ? 'bg-[#13273B] text-[#20C997]' : 'text-[#9AADC1]'
              }`}
            >
              First-Time Activation
            </button>
          </div>
        )}

        {targetRole === 'CITIZEN' && (
          <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-[#07111F] p-1 border border-white/10">
            <button
              type="button"
              onClick={() => {
                setMode('LOGIN');
                setError(null);
              }}
              className={`rounded-lg py-1.5 text-xs font-medium transition ${
                mode === 'LOGIN' ? 'bg-[#13273B] text-[#20C8E8]' : 'text-[#9AADC1]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('CITIZEN_REGISTER');
                setError(null);
              }}
              className={`rounded-lg py-1.5 text-xs font-medium transition ${
                mode === 'CITIZEN_REGISTER' ? 'bg-[#13273B] text-[#20C997]' : 'text-[#9AADC1]'
              }`}
            >
              Register
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {mode === 'CLAIM_ADMIN' && (
            <div className="rounded-xl border border-[#20C8E8]/30 bg-[#20C8E8]/10 p-3 text-xs text-[#F4F7FC]/90">
              No administrator password has been configured yet. Create the primary Tumakuru
              Municipal Administrator credentials below to unlock command workflows.
            </div>
          )}

          {mode === 'CLAIM_OFFICER' && (
            <div>
              <label className="block text-xs font-medium text-[#9AADC1] mb-1">
                Select Unclaimed Officer Roster Profile
              </label>
              <select
                value={selectedOfficerId}
                onChange={(e) => setSelectedOfficerId(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-sm text-[#F4F7FC] focus:border-[#20C8E8] focus:outline-none"
              >
                {unclaimedOfficers.map((o) => (
                  <option key={o.officer_id} value={o.officer_id}>
                    {o.name} · {o.badge_code} ({o.zone})
                  </option>
                ))}
              </select>
            </div>
          )}

          {(mode === 'CLAIM_ADMIN' || mode === 'CITIZEN_REGISTER') && (
            <div>
              <label className="block text-xs font-medium text-[#9AADC1] mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Rakesh Kulkarni"
                className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-sm text-[#F4F7FC] focus:border-[#20C8E8] focus:outline-none"
              />
            </div>
          )}

          {mode !== 'CLAIM_OFFICER' && (
            <div>
              <label className="block text-xs font-medium text-[#9AADC1] mb-1">
                Official / Account Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={
                  targetRole === 'FIELD_OFFICER'
                    ? 'karthik.officer@tumakuru.civic'
                    : 'name@tumakuru.civic'
                }
                className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-sm text-[#F4F7FC] focus:border-[#20C8E8] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#9AADC1] mb-1">
              {mode === 'CLAIM_ADMIN' || mode === 'CLAIM_OFFICER' || mode === 'CITIZEN_REGISTER'
                ? 'Set Password (min 6 characters)'
                : 'Password'}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#9AADC1]" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-white/15 bg-[#07111F] pl-9 pr-3 py-2 text-sm text-[#F4F7FC] focus:border-[#20C8E8] focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-[#FF515A]/45 bg-[#FF515A]/15 px-3 py-2 text-xs text-[#FF9BA0]">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-[#9AADC1] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-[#20C8E8] px-5 py-2 text-xs font-semibold text-[#07111F] hover:bg-[#4cd6f1] disabled:opacity-50 transition"
            >
              {loading
                ? 'Verifying...'
                : mode === 'CLAIM_ADMIN'
                  ? 'Initialize & Enter Command'
                  : mode === 'CLAIM_OFFICER'
                    ? 'Activate & Sign In'
                    : mode === 'CITIZEN_REGISTER'
                      ? 'Create Account'
                      : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
