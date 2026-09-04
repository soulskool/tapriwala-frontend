'use client';

import { useEffect } from 'react';

import { useAppDispatch } from '../hooks';
import { socketConnectRequested, socketDisconnectRequested } from './socket-middleware';

/**
 * Opens the realtime connection for whichever screen is mounted.
 *
 * Staff screens open in `staff` mode and send no credential of their own — the
 * httpOnly session cookie rides along with the handshake. A guest's phone
 * passes its table QR token, which is the whole of its identity.
 *
 * Whichever arrives, the server pins the socket to the right rooms at
 * handshake: a customer socket cannot join another table's room even if it
 * asks, so the client never has to police that itself.
 *
 * All event handling lives in `socket-middleware`. This hook owns only the
 * connection's lifetime.
 */
export function useSocketSync(
  credential: { staff: true; tableCode?: never } | { staff?: false; tableCode: string | null },
) {
  const dispatch = useAppDispatch();
  const isStaff = credential.staff === true;
  const tableCode = credential.tableCode ?? null;

  useEffect(() => {
    if (isStaff) {
      dispatch(socketConnectRequested({ mode: 'staff' }));
    } else if (tableCode) {
      dispatch(socketConnectRequested({ mode: 'customer', tableCode }));
    } else {
      // The QR has not resolved yet — stay disconnected rather than opening an
      // unauthenticated socket the server would reject.
      return;
    }

    return () => {
      dispatch(socketDisconnectRequested());
    };
  }, [dispatch, isStaff, tableCode]);
}
