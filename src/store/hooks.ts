import { useDispatch, useSelector, useStore } from 'react-redux';

import type { AppDispatch, AppStore, RootState } from './index';

/**
 * Typed Redux hooks.
 *
 * Always use these instead of the bare react-redux ones — they carry the store
 * types, which is what keeps `state.auth.user` from silently becoming `any`.
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();
