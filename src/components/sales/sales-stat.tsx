import { cn } from '@/lib/utils';

/** One headline figure above a sales table. Render inside a `<dl>`. */
export function SalesStat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-card border-line bg-surface border px-4 py-3">
      <dt className="text-ink-muted text-sm">{label}</dt>
      <dd className={cn('font-bold tabular-nums', strong ? 'text-2xl' : 'text-xl')}>{value}</dd>
    </div>
  );
}
