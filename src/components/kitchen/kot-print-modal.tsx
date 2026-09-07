'use client';

import { useEffect, useState } from 'react';

import { KotSheet, buildKotText, type KotData } from '@/components/kitchen/kot-sheet';
import { Button } from '@/components/ui/button';
import { IconPrint } from '@/components/ui/icons';
import { Modal } from '@/components/ui/modal';
import { OrderTypePill } from '@/components/ui/order-type-pill';

/**
 * "How will this KOT print?" — then print it.
 *
 * The preview exists because the paper is the only part of this system nobody
 * can undo. A cook who sends the wrong ticket has already wasted the food by
 * the time anyone notices, so the sheet is shown before it is committed, in
 * exactly the characters that will come out of the printer: the preview and
 * the paper are both `buildKotText` of the same ticket, not two renderers that
 * can drift apart.
 */
export function KotPrintModal({
  kot,
  open,
  onClose,
}: {
  /** Null while nothing is selected — the modal renders closed. */
  kot: KotData | null;
  open: boolean;
  onClose: () => void;
}) {
  /*
   * The sheet is mounted only while printing.
   *
   * `@media print` shows `.kot-sheet` unconditionally, so leaving one in the
   * DOM would put a kitchen ticket on the paper the counter is trying to print
   * a bill onto. Mounting it for the duration of the print call is what keeps
   * "print" on this screen meaning only this ticket.
   */
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;

    // One frame for React to paint the sheet before the browser freezes the
    // page to rasterise it. Without this the print job catches an empty div.
    const frame = requestAnimationFrame(() => {
      window.print();
      setPrinting(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [printing]);

  if (!kot) return null;

  return (
    <>
      {printing ? <KotSheet kot={kot} /> : null}

      <Modal
        open={open}
        onClose={onClose}
        title={`KOT ${kot.kotId} · Table ${kot.tableCode}`}
        description="This is exactly what the printer will produce. Items and quantities only — no prices go to the kitchen."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => setPrinting(true)}>
              <IconPrint aria-hidden className="mr-1.5 inline size-4" /> Print KOT
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <OrderTypePill orderType={kot.orderType} />
            {kot.isAddOn ? (
              <span className="bg-brand-500 rounded-md px-1.5 py-0.5 text-xs font-black text-white">
                ADD-ON R{kot.roundNumber}
              </span>
            ) : null}
          </div>

          {/*
           * Rendered on a paper-coloured strip at roughly the roll's width, so
           * the preview reads as a preview of paper rather than as a code
           * block. Fixed colours, not theme tokens: the printer has one ink.
           */}
          <div className="bg-surface-sunken overflow-x-auto rounded-lg p-3">
            <pre className="mx-auto w-max bg-white px-3 py-4 font-mono text-[0.8rem] leading-snug whitespace-pre text-black shadow-sm">
              {buildKotText(kot)}
            </pre>
          </div>
        </div>
      </Modal>
    </>
  );
}
