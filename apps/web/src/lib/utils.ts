import clsx, { type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDate(date: string | Date | null | undefined, withTime = false): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export function deadlineLabel(date: string): { text: string; urgent: boolean; past: boolean } {
  const ms = new Date(date).getTime() - Date.now();
  if (ms < 0) return { text: 'Deadline passed', urgent: false, past: true };
  const h = Math.floor(ms / 3600_000);
  if (h < 48) return { text: h < 1 ? 'Closes within the hour' : `${h}h left`, urgent: true, past: false };
  const d = Math.floor(h / 24);
  return { text: `${d} days left`, urgent: false, past: false };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export const YEAR_LABELS: Record<number, string> = {
  1: '1st year',
  2: '2nd year',
  3: '3rd year',
  4: '4th year',
  5: '5th year',
  6: 'Postgraduate',
};

export function yearLabel(y: number | undefined | null) {
  return y ? YEAR_LABELS[y] ?? `Year ${y}` : '';
}

export function scoreTone(score: number): 'accent' | 'primary' | 'warn' | 'muted' {
  if (score >= 75) return 'accent';
  if (score >= 50) return 'primary';
  if (score >= 25) return 'warn';
  return 'muted';
}

export const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'Pending approval',
  open: 'Open',
  rejected: 'Not approved',
  closed: 'Closed',
  expired: 'Expired',
  removed: 'Removed',
  pending: 'Pending',
  accepted: 'Accepted',
  withdrawn: 'Withdrawn',
};

export const TYPE_LABEL: Record<string, string> = {
  hackathon: 'Hackathon',
  project: 'Project',
  research: 'Research',
  competition: 'Competition',
};
