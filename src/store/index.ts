import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

import { adminApi } from './api/admin-api';
import { authApi } from './api/auth-api';
import { billingApi } from './api/billing-api';
import { customerApi } from './api/customer-api';
import { kitchenApi } from './api/kitchen-api';
import { menuApi } from './api/menu-api';
import { serviceRequestApi } from './api/service-request-api';
import { sessionApi } from './api/session-api';
import { tableApi } from './api/table-api';
import authReducer from './slices/auth-slice';
import cartReducer from './slices/cart-slice';
import uiReducer from './slices/ui-slice';
import { socketMiddleware } from './socket/socket-middleware';

/**
 * One store per browser tab.
 *
 * Built by a factory rather than a module singleton because Next renders on
 * the server too — a shared store instance would leak one request's data into
 * the next.
 */

/** One `createApi` per domain, so tag invalidation stays scoped and files stay small. */
const apis = [
  authApi,
  customerApi,
  menuApi,
  tableApi,
  sessionApi,
  kitchenApi,
  serviceRequestApi,
  billingApi,
  adminApi,
] as const;

export function makeStore() {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      cart: cartReducer,
      ui: uiReducer,
      [authApi.reducerPath]: authApi.reducer,
      [customerApi.reducerPath]: customerApi.reducer,
      [menuApi.reducerPath]: menuApi.reducer,
      [tableApi.reducerPath]: tableApi.reducer,
      [sessionApi.reducerPath]: sessionApi.reducer,
      [kitchenApi.reducerPath]: kitchenApi.reducer,
      [serviceRequestApi.reducerPath]: serviceRequestApi.reducer,
      [billingApi.reducerPath]: billingApi.reducer,
      [adminApi.reducerPath]: adminApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(...apis.map((api) => api.middleware), socketMiddleware),
  });

  // Powers `refetchOnReconnect` / `refetchOnFocus` — the behaviour a kitchen
  // tablet relies on after it drops off the Wi-Fi.
  setupListeners(store.dispatch);

  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
