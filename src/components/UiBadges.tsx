import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Construction,
  HelpCircle,
  Trash2,
} from 'lucide-react';
import { getSeverityVisualToken } from '../shared/geospatial';
import type {
  CivicCategory,
  HumanVerificationStatus,
  OperationalIssueStatus,
  PriorityLabel,
  SeverityLabel,
} from '../shared/types';

export function SeverityBadge({
  severity,
  score,
}: {
  severity: SeverityLabel;
  score?: number | null;
}) {
  const token = getSeverityVisualToken(severity);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap tabular-nums"
      style={{
        backgroundColor: token.fillRgba,
        borderColor: token.borderHex,
        color: '#F4F7FC',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: token.hex }}
      />
      <span>{severity}</span>
      {score !== null && score !== undefined && <span className="font-mono opacity-90">{score}</span>}
    </span>
  );
}

export function PriorityBadge({
  label,
  score,
  provisional,
}: {
  label: PriorityLabel;
  score?: number | null;
  provisional?: boolean;
}) {
  const styles: Record<PriorityLabel, string> = {
    CRITICAL: 'bg-[#FF515A]/20 text-[#FF8A90] border-[#FF515A]/45',
    HIGH: 'bg-[#FF963D]/20 text-[#FFB46E] border-[#FF963D]/45',
    MODERATE: 'bg-[#377DFF]/20 text-[#86B0FF] border-[#377DFF]/45',
    LOW: 'bg-[#20C997]/20 text-[#66E3BD] border-[#20C997]/45',
    UNDETERMINED: 'bg-slate-500/20 text-slate-300 border-slate-400/35',
    PROVISIONAL_UNDETERMINED: 'bg-slate-500/20 text-slate-300 border-slate-400/35',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap tabular-nums ${styles[label]}`}
    >
      <span>{label === 'PROVISIONAL_UNDETERMINED' ? 'UNDETERMINED' : label}</span>
      {score !== null && score !== undefined && <span className="font-mono">{score.toFixed(0)}</span>}
      {provisional && <span className="text-[10px] opacity-80">PROV</span>}
    </span>
  );
}

export function StatusBadge({ status }: { status: OperationalIssueStatus }) {
  const map: Record<OperationalIssueStatus, string> = {
    PENDING_VERIFICATION: 'bg-amber-500/15 text-amber-300 border-amber-400/35',
    VERIFIED: 'bg-[#20C8E8]/15 text-[#7AE4F8] border-[#20C8E8]/35',
    ASSIGNED: 'bg-[#377DFF]/15 text-[#8EB7FF] border-[#377DFF]/35',
    IN_PROGRESS: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40',
    RESOLUTION_SUBMITTED: 'bg-teal-500/20 text-teal-200 border-teal-400/40',
    RESOLVED: 'bg-[#20C997]/20 text-[#68E7BE] border-[#20C997]/45',
    REOPENED: 'bg-orange-500/20 text-orange-200 border-orange-400/40',
    REJECTED: 'bg-slate-500/20 text-slate-300 border-slate-400/35',
    NEEDS_ADDITIONAL_EVIDENCE: 'bg-rose-500/15 text-rose-200 border-rose-400/35',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${map[status]}`}
    >
      {status === 'RESOLVED' ? (
        <CheckCircle2 className="h-3 w-3 shrink-0" />
      ) : (
        <Clock className="h-3 w-3 shrink-0 opacity-80" />
      )}
      <span>{status.replaceAll('_', ' ')}</span>
    </span>
  );
}

export function VerificationBadge({ status }: { status: HumanVerificationStatus }) {
  const isOk = status === 'VERIFIED' || status === 'CORRECTED';
  const isBad = status === 'REJECTED' || status === 'NEEDS_MORE_EVIDENCE';
  const cls = isOk
    ? 'bg-[#20C997]/15 text-[#6CE6C0] border-[#20C997]/35'
    : isBad
      ? 'bg-[#FF515A]/15 text-[#FF8C92] border-[#FF515A]/35'
      : 'bg-amber-500/15 text-amber-200 border-amber-400/35';
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export function CategoryIcon({
  category,
  className = 'h-4 w-4',
}: {
  category: CivicCategory;
  className?: string;
}) {
  if (category === 'POTHOLE') {
    return <Construction className={`${className} text-[#FF757C]`} />;
  }
  if (category === 'GARBAGE_OR_WASTE') {
    return <Trash2 className={`${className} text-[#20C997]`} />;
  }
  return <AlertTriangle className={`${className} text-[#FF963D]`} />;
}

export function CivicImage({
  src,
  alt,
  className = '',
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [errored, setErrored] = React.useState(false);

  if (!src || errored) {
    return (
      <div
        className={`flex items-center justify-center bg-[#0C1929] border border-white/10 text-[#9AADC1] ${className}`}
      >
        <HelpCircle className="h-5 w-5 opacity-60" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className={`object-cover bg-[#0C1929] ${className}`}
    />
  );
}
