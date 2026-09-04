'use client';

import { useEffect, useRef } from 'react';

import type { KdsTicket } from '@/lib/types';

/**
 * Sounds an alert when a ticket the board has not seen before arrives.
 *
 * Requirement 4.3: a new round must announce itself, because nobody is
 * watching a mounted tablet continuously in a working kitchen.
 *
 * The tone is synthesised with the Web Audio API rather than shipped as an
 * audio file — one less request, and nothing to 404 on a device that loaded
 * the page over a flaky connection.
 */
export function useNewTicketChime(tickets: KdsTicket[], enabled: boolean): void {
  const seenRef = useRef<Set<string> | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const ids = tickets.map((ticket) => ticket.roundId);

    // First render: adopt whatever is already on the board without chiming.
    // Otherwise reloading the tablet mid-service would fire once per open
    // ticket, which is the opposite of useful.
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }

    const seen = seenRef.current;
    const arrived = ids.filter((id) => !seen.has(id));
    ids.forEach((id) => seen.add(id));

    // Drop ids that have left the board so the set cannot grow all shift.
    for (const id of seen) {
      if (!ids.includes(id)) seen.delete(id);
    }

    if (arrived.length === 0 || !enabled) return;

    playChime(contextRef);
  }, [tickets, enabled]);

  useEffect(() => {
    return () => {
      void contextRef.current?.close();
      contextRef.current = null;
    };
  }, []);
}

function playChime(contextRef: { current: AudioContext | null }): void {
  try {
    // Created lazily: browsers refuse to start an AudioContext before a user
    // gesture, and the kitchen's first tap on the board is what unlocks it.
    contextRef.current ??= new AudioContext();
    const context = contextRef.current;
    if (context.state === 'suspended') void context.resume();

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(1174, context.currentTime + 0.12);

    // Short envelope, no click on release.
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.45);
  } catch {
    // Audio is a nicety; a browser that refuses it must not break the board.
  }
}
