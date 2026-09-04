import { createApi } from '@reduxjs/toolkit/query/react';

import type { AuthUser, LoginResponse } from '@/lib/types';
import { baseQuery, unwrap } from './base-query';

/**
 * Staff PIN login.
 *
 * Devices are shared (one waiter phone, one kitchen tablet), so login is
 * deliberately low friction — phone plus 4-digit PIN — while every write the
 * device makes is still attributed to whoever tapped it.
 */
export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery,
  tagTypes: ['Me'],
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, { phone: string; pin: string }>({
      query: (credentials) => ({ url: '/auth/login', method: 'POST', body: credentials }),
      transformResponse: unwrap<LoginResponse>,
      invalidatesTags: ['Me'],
    }),

    /** Called on boot so a reloaded tab restores its role UI without a re-login. */
    me: builder.query<AuthUser, void>({
      query: () => '/auth/me',
      transformResponse: unwrap<AuthUser>,
      providesTags: ['Me'],
    }),

    logout: builder.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Me'],
    }),
  }),
});

export const { useLoginMutation, useMeQuery, useLazyMeQuery, useLogoutMutation } = authApi;
