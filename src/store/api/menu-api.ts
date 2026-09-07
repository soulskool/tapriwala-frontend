import { createApi } from '@reduxjs/toolkit/query/react';

import type { ApiEnvelope, MenuCategory, Paginated, Product } from '@/lib/types';
import { baseQuery, unwrap, unwrapPaginated } from './base-query';

/**
 * `/products` and `/products/menu` do not agree on the id field.
 *
 * `/products/menu` is a hand-built projection and returns `id`. `/products` is
 * the admin list and returns the raw Mongoose document, which is keyed `_id`.
 * `Product` declares `id`, so nothing failed to compile — `product.id` was
 * simply `undefined` at runtime on every row of the Product Master.
 *
 * That was not cosmetic. `handleSave` branches on `editing.id` to choose
 * update-or-create, so "Edit" silently became "Create" and collided with the
 * unique product code; image upload and delete addressed `undefined`; the
 * availability toggle had no id to send; and React warned about missing keys.
 *
 * Normalised here rather than at each call site so the type is true for every
 * consumer, present and future.
 */
type RawProduct = Product & { _id?: string };

function withId(product: RawProduct): Product {
  const { _id, ...rest } = product;
  return { ...rest, id: product.id ?? _id ?? '' };
}

/**
 * The menu, for staff screens and for admin's Product Master.
 *
 * The customer's copy of the menu lives in `customer-api` instead: it comes
 * from a different, tokenless endpoint that strips POS names and hides 86'd
 * items entirely, and mixing the two would eventually leak one into the other.
 */
export const menuApi = createApi({
  reducerPath: 'menuApi',
  baseQuery,
  tagTypes: ['Menu', 'Product'],
  endpoints: (builder) => ({
    /** Grouped by category — what the waiter's item picker renders. */
    staffMenu: builder.query<MenuCategory[], void>({
      query: () => '/products/menu',
      transformResponse: (response: { data: { categories: MenuCategory[] } }) =>
        response.data.categories,
      providesTags: ['Menu'],
    }),

    listProducts: builder.query<
      Paginated<Product>,
      {
        search?: string;
        category?: string;
        includeInactive?: boolean;
        page?: number;
        limit?: number;
      } | void
    >({
      query: (params) => ({ url: '/products', params: params ?? undefined }),
      transformResponse: (response: ApiEnvelope<RawProduct[]>): Paginated<Product> => {
        const page = unwrapPaginated(response);
        return { ...page, items: page.items.map(withId) };
      },
      providesTags: ['Product'],
    }),

    categories: builder.query<string[], void>({
      query: () => '/products/categories',
      transformResponse: unwrap<string[]>,
      providesTags: ['Menu'],
    }),

    /**
     * The 86 toggle — kitchen and billing can both reach it.
     *
     * Optimistic on purpose: a cook who has just run out of sandwiches taps
     * this and walks away, and the toggle must look done immediately. The
     * socket broadcast that follows repaints every other device.
     */
    setAvailability: builder.mutation<Product, { id: string; isAvailable: boolean }>({
      query: ({ id, isAvailable }) => ({
        url: `/products/${id}/availability`,
        method: 'PATCH',
        body: { isAvailable },
      }),
      transformResponse: unwrap<Product>,
      async onQueryStarted({ id, isAvailable }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          menuApi.util.updateQueryData('listProducts', undefined, (draft) => {
            const product = draft.items.find((item) => item.id === id);
            if (product) product.isAvailable = isAvailable;
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ['Menu', 'Product'],
    }),

    createProduct: builder.mutation<Product, Partial<Product>>({
      query: (body) => ({ url: '/products', method: 'POST', body }),
      transformResponse: unwrap<Product>,
      invalidatesTags: ['Menu', 'Product'],
    }),

    updateProduct: builder.mutation<Product, { id: string; body: Partial<Product> }>({
      query: ({ id, body }) => ({ url: `/products/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<Product>,
      invalidatesTags: ['Menu', 'Product'],
    }),

    /**
     * Menu photo upload. Multipart, so no JSON `Content-Type` header — letting
     * the browser set it is what produces the multipart boundary.
     */
    uploadProductImage: builder.mutation<Product, { id: string; file: File }>({
      query: ({ id, file }) => {
        const form = new FormData();
        form.append('image', file);
        return { url: `/products/${id}/image`, method: 'POST', body: form };
      },
      transformResponse: unwrap<Product>,
      invalidatesTags: ['Menu', 'Product'],
    }),

    deleteProductImage: builder.mutation<Product, string>({
      query: (id) => ({ url: `/products/${id}/image`, method: 'DELETE' }),
      transformResponse: unwrap<Product>,
      invalidatesTags: ['Menu', 'Product'],
    }),

    /** Flags duplicate codes and zero prices before go-live. Admin only. */
    auditCatalogue: builder.query<Record<string, unknown>, void>({
      query: () => '/products/audit',
      transformResponse: unwrap<Record<string, unknown>>,
    }),
  }),
});

export const {
  useStaffMenuQuery,
  useListProductsQuery,
  useCategoriesQuery,
  useSetAvailabilityMutation,
  useCreateProductMutation,
  useUpdateProductMutation,
  useUploadProductImageMutation,
  useDeleteProductImageMutation,
  useAuditCatalogueQuery,
} = menuApi;
