import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';

import type { KitchenStation } from '@/lib/constants';

/**
 * Cross-screen UI state: toasts, socket health, and the KDS station filter.
 *
 * Deliberately small. Anything the server owns belongs in RTK Query, not here.
 */

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
}

export type ConnectionState = 'connecting' | 'online' | 'offline';

interface UiState {
  toasts: Toast[];
  /**
   * Socket health, shown as a dot in the header.
   *
   * A waiter must be able to tell "order sent" from "still sending" at a
   * glance — walking away from a table believing an order went through when
   * it did not is the single worst failure this system can have.
   */
  connection: ConnectionState;
  /** Phase 3 splits the KDS by station; the filter is already wired. */
  kitchenStationFilter: KitchenStation | 'all';
  /** Audible alert on a new KDS ticket, toggled by the kitchen. */
  kitchenSoundEnabled: boolean;
}

const initialState: UiState = {
  toasts: [],
  connection: 'connecting',
  kitchenStationFilter: 'all',
  kitchenSoundEnabled: true,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toastPushed: {
      reducer(state, action: PayloadAction<Toast>) {
        // Cap the stack: a burst of socket errors must not bury the screen.
        state.toasts = [...state.toasts.slice(-2), action.payload];
      },
      prepare(message: string, tone: ToastTone = 'info') {
        return { payload: { id: nanoid(), message, tone } };
      },
    },

    toastDismissed(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },

    connectionChanged(state, action: PayloadAction<ConnectionState>) {
      state.connection = action.payload;
    },

    kitchenStationFilterChanged(state, action: PayloadAction<KitchenStation | 'all'>) {
      state.kitchenStationFilter = action.payload;
    },

    kitchenSoundToggled(state) {
      state.kitchenSoundEnabled = !state.kitchenSoundEnabled;
    },
  },
});

export const {
  toastPushed,
  toastDismissed,
  connectionChanged,
  kitchenStationFilterChanged,
  kitchenSoundToggled,
} = uiSlice.actions;

export default uiSlice.reducer;
