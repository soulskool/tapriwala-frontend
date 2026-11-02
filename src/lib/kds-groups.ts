import { ITEM_STATUS } from '@/lib/constants';
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
  /** The paying table's code. A table has one open session at a time. */
  key: string;
  /** The table that pays: its own card, or the one a bill was moved to. */
  tableCode: string;
  /** The paying table's zone; blank when only moved tables have food on the board. */
  zone: string;
  /** Tables whose bill moved here and that have rounds on this card. */
  includes: string[];
  /** Oldest round first, so the add-ons read top to bottom in order. */
  tickets: KdsTicket[];
}

/**
 * Groups tickets by the table that pays.
 *
 * A table whose bill was moved ("M3 → L5") has its rounds on the paying
 * table's card, so the pass sees one party's food together. Each round still
 * says whose order it is (see the card), and stays its own cooking job.
 *
 * Cards keep the queue's order (oldest first), placed by their oldest round —
 * so a table that has waited longest stays top-left even after an add-on
 * arrives, instead of jumping to the back of the board.
 */
export function groupTicketsByTable(tickets: KdsTicket[]): KdsTableGroup[] {
  const groups = new Map<string, KdsTableGroup>();

  for (const ticket of tickets) {
    const payer = ticket.billWithTableCode ?? ticket.tableCode;
    const own = payer === ticket.tableCode;
    let group = groups.get(payer);
    if (!group) {
      group = { key: payer, tableCode: payer, zone: '', includes: [], tickets: [] };
      groups.set(payer, group);
    }
    group.tickets.push(ticket);
    if (own) group.zone = ticket.zone;
    else if (!group.includes.includes(ticket.tableCode)) group.includes.push(ticket.tableCode);
  }

  for (const group of groups.values()) {
    // By time, not round number: two tables' "R1"s share a card now.
    group.tickets.sort(
      (a, b) => a.placedAt.localeCompare(b.placedAt) || a.roundNumber - b.roundNumber,
    );
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
