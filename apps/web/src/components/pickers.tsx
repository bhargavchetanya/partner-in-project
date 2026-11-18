import { useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { normalizeKey } from '@pip/shared';
import { useCatalog } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Chip } from './ui';

/**
 * Skill autocomplete over the catalogue (names + aliases). Unknown names can be added as
 * free text; the server turns them into catalogue entries. Values are slugs (or raw names).
 */
export function SkillPicker({ value, onChange, placeholder = 'Search skills, e.g. React, Docker…', invalid, max = 25, exclude = [] }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; invalid?: boolean; max?: number; exclude?: string[] }) {
  const { catalog, skillName } = useCatalog();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const key = normalizeKey(q);
    if (!catalog) return [];
    const taken = new Set([...value, ...exclude]);
    const list = catalog.skills.filter((s) => !taken.has(s.slug));
    if (!key) return list.slice(0, 8);
    const scored = list
      .map((s) => {
        const names = [s.name, s.slug, ...s.aliases].map(normalizeKey);
        const exact = names.some((n) => n === key);
        const starts = names.some((n) => n.startsWith(key));
        const contains = names.some((n) => n.includes(key));
        return { s, rank: exact ? 0 : starts ? 1 : contains ? 2 : 9 };
      })
      .filter((x) => x.rank < 9)
      .sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name));
    return scored.slice(0, 8).map((x) => x.s);
  }, [q, catalog, value, exclude]);

  const exactExists = results.some((r) => normalizeKey(r.name) === normalizeKey(q));
  const add = (v: string) => {
    if (!v.trim() || value.length >= max) return;
    if (!value.includes(v)) onChange([...value, v]);
    setQ('');
    setActive(0);
    inputRef.current?.focus();
  };

  const options = [...results.map((r) => ({ key: r.slug, label: r.name, custom: false })), ...(q.trim() && !exactExists ? [{ key: q.trim(), label: `Add "${q.trim()}"`, custom: true }] : [])];

  return (
    <div className="relative">
      <div className={cn('flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border bg-elev px-2.5 py-1.5 transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary-soft', invalid ? 'border-danger' : 'border-line')}>
        {value.map((v) => (
          <Chip key={v} tone="primary" onRemove={() => onChange(value.filter((x) => x !== v))}>
            {skillName(v)}
          </Chip>
        ))}
        <div className="flex flex-1 items-center gap-1.5 min-w-[140px]">
          {value.length === 0 && <Search className="size-4 text-muted" />}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, options.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const o = options[active];
                if (o) add(o.key);
              } else if (e.key === 'Backspace' && !q && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            placeholder={value.length ? 'Add more…' : placeholder}
            className="h-8 flex-1 bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none"
            aria-label="Add skill"
          />
        </div>
      </div>
      {open && options.length > 0 && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          {options.map((o, i) => (
            <button
              type="button"
              key={o.key + i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(o.key)}
              onMouseEnter={() => setActive(i)}
              className={cn('flex w-full items-center justify-between px-3.5 py-2 text-left text-sm', i === active ? 'bg-surface-2 text-fg' : 'text-fg-2')}
            >
              <span className="flex items-center gap-2">
                {o.custom && <Plus className="size-3.5 text-primary" />}
                {o.label}
              </span>
              {!o.custom && catalog && <span className="text-[11px] text-muted">{catalog.categories.find((c) => c.slug === catalog.skills.find((s) => s.slug === o.key)?.category)?.name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Toggleable chips for a fixed list (interests, roles, years). */
export function ChipSelect({ options, value, onChange, max, invalid }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; max?: number; invalid?: boolean }) {
  return (
    <div className={cn('flex flex-wrap gap-2', invalid && 'rounded-xl ring-1 ring-danger p-2')}>
      {options.map((o) => {
        const on = value.includes(o.value);
        const disabled = !on && max !== undefined && value.length >= max;
        return (
          <button
            type="button"
            key={o.value}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[13px] font-medium transition',
              on ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg',
              disabled && 'opacity-40 cursor-not-allowed',
            )}
            aria-pressed={on}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
