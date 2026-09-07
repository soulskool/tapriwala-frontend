import { IconCamera } from '@/components/ui/icons';

/**
 * A sticker that no longer resolves.
 *
 * QR tokens are rotatable — reprinting a table's sticker kills the old one —
 * so this is a normal outcome, not a crash. The guest needs a next step, not
 * a stack trace.
 */
export default function InvalidQrPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <IconCamera aria-hidden className="text-ink-muted size-12" />
      <h1 className="text-2xl font-bold">This QR code isn&apos;t working</h1>
      <p className="text-ink-muted max-w-sm">
        The sticker may have been replaced, or this table is not in service right now. Please ask a
        staff member and they will take your order.
      </p>
    </main>
  );
}
