import { ITEM_STATUS, type TableZone } from '@/lib/constants';
import type { KdsTicket } from '@/lib/types';

/**
 * The kitchen board's one-card-per-table view.
 *
 * The API still sends one ticket per round, and each round stays its own
 * cooking job inside the card — its own KOT, timer and "All ready". Only the
 * outer card is shared, so a cook reads "everything M2 is waiting on" in one
 * place instead of hunting for the add-on three cards along.
 */
export interface KdsTableGroup {
  /** The table's open session. A table has one at a time, so this is the key. */
  sessionId: string;
  tableCode: string;
  zone: TableZone;
  /** Oldest round first, so the add-ons read top to bottom in order. */
  tickets: KdsTicket[];
}

/**
 * Groups tickets by table session.
 *
 * Cards keep the queue's order (oldest first), placed by their oldest round —
 * so a table that has waited longest stays top-left even after an add-on
 * arrives, instead of jumping to the back of the board.
 */
export function groupTicketsByTable(tickets: KdsTicket[]): KdsTableGroup[] {
  const groups = new Map<string, KdsTableGroup>();

  for (const ticket of tickets) {
    const group = groups.get(ticket.sessionId);
    if (group) {
      group.tickets.push(ticket);
    } else {
      groups.set(ticket.sessionId, {
        sessionId: ticket.sessionId,
        tableCode: ticket.tableCode,
        zone: ticket.zone,
        tickets: [ticket],
      });
    }
  }

  for (const group of groups.values()) {
    group.tickets.sort((a, b) => a.roundNumber - b.roundNumber);
  }
  return [...groups.values()];
}

/** Every item that is still going out is ready (or already served). */
export function isTicketAllReady(ticket: KdsTicket): boolean {
  const live = ticket.items.filter((item) => item.status !== ITEM_STATUS.CANCELLED);
  return (
    live.length > 0 &&
    live.every((item) => item.status === ITEM_STATUS.READY || item.status === ITEM_STATUS.SERVED)
  );
}

/**
 * The round the table card's border and big timer follow: the oldest one the
 * kitchen still owes food on.
 *
 * Not simply the oldest round — once round 1 is under the pass, a card that
 * kept pulsing red for it would be shouting about food that is already cooked
 * while the add-on behind it is what is actually late.
 */
export function oldestOpenTicket(group: KdsTableGroup): KdsTicket {
  return group.tickets.find((ticket) => !isTicketAllReady(ticket)) ?? group.tickets[0]!;
}
