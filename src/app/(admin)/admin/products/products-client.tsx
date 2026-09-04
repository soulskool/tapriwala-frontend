'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { KITCHEN_STATIONS, KITCHEN_STATION_VALUES } from '@/lib/constants';
import type { Product } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { apiErrorMessage, apiFieldErrors } from '@/store/api/base-query';
import {
  useCreateProductMutation,
  useDeleteProductImageMutation,
  useListProductsQuery,
  useSetAvailabilityMutation,
  useUpdateProductMutation,
  useUploadProductImageMutation,
} from '@/store/api/menu-api';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';

type Draft = Partial<Product> & { productCode?: string };

/** The API's hard maximum for one page (`APP_CONSTANTS.MAX_PAGE_SIZE`). */
const PAGE_SIZE = 100;

const EMPTY_DRAFT: Draft = {
  productCode: '',
  posName: '',
  displayName: '',
  category: '',
  price: 0,
  taxPercent: 5,
  kitchenStation: KITCHEN_STATIONS.KITCHEN,
};

/**
 * The menu, as ownership maintains it.
 *
 * Two different "off" switches, and they are not interchangeable:
 *   • `isAvailable` — 86'd for today. Kitchen and billing can flip it.
 *   • `isActive`    — retired for good. Admin only.
 * Conflating them is how a permanently deleted item comes back tomorrow.
 */
export function ProductsClient() {
  const dispatch = useAppDispatch();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [showInactive, setShowInactive] = useState(false);

  /**
   * Paged, and searched server-side.
   *
   * This used to ask for `limit: 200` and filter in the browser. The API caps a
   * page at 100, so with a 300-item catalogue the page silently showed the
   * first hundred products and the search box only ever searched those — an
   * item that existed simply could not be found. Paging honestly and letting
   * Mongo do the search is the fix; `PAGE_SIZE` is the API's real maximum.
   */
  const [page, setPage] = useState(1);
  const products = useListProductsQuery({
    includeInactive: showInactive,
    search: debouncedSearch.trim() || undefined,
    page,
    limit: PAGE_SIZE,
  });

  const [createProduct, { isLoading: isCreating }] = useCreateProductMutation();
  const [updateProduct, { isLoading: isUpdating }] = useUpdateProductMutation();
  const [setAvailability] = useSetAvailabilityMutation();
  const [uploadImage, { isLoading: isUploading }] = useUploadProductImageMutation();
  const [deleteImage] = useDeleteProductImageMutation();

  const [editing, setEditing] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageTargetId, setImageTargetId] = useState<string | null>(null);

  // The server has already applied the search and the inactive filter.
  const visible = products.data?.items ?? [];
  const pagination = products.data?.pagination;

  async function handleSave() {
    if (!editing) return;
    setFormError(null);

    try {
      if (editing.id) {
        const { id, ...body } = editing;
        await updateProduct({ id, body }).unwrap();
        dispatch(toastPushed('Item updated', 'success'));
      } else {
        await createProduct(editing).unwrap();
        dispatch(toastPushed('Item added to the menu', 'success'));
      }
      setEditing(null);
    } catch (error) {
      setFormError(error);
    }
  }

  async function handleImagePicked(file: File) {
    if (!imageTargetId) return;
    try {
      await uploadImage({ id: imageTargetId, file }).unwrap();
      dispatch(toastPushed('Photo uploaded', 'success'));
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not upload that photo'), 'error'));
    } finally {
      setImageTargetId(null);
    }
  }

  if (products.isLoading) return <LoadingBlock label="Loading the menu…" />;
  if (products.isError) {
    return (
      <ErrorState
        message={apiErrorMessage(products.error, 'Could not load the menu')}
        onRetry={() => void products.refetch()}
      />
    );
  }

  const fieldErrors = apiFieldErrors(formError);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Menu</h1>
        <span className="text-ink-muted text-sm tabular-nums">
          {pagination ? `${pagination.total} items` : `${visible.length} items`}
        </span>

        <input
          type="search"
          value={search}
          onChange={(event) => {
            // Reset the page here rather than in an effect watching the search:
            // page 4 of a freshly filtered list is almost always empty.
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search name, POS name or code"
          aria-label="Search the menu"
          className="min-h-touch border-line bg-surface min-w-56 flex-1 rounded-xl border px-4"
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => {
              setShowInactive(event.target.checked);
              setPage(1);
            }}
            className="size-4"
          />
          Show retired
        </label>

        <Button onClick={() => setEditing({ ...EMPTY_DRAFT })}>+ Add item</Button>
      </header>

      {visible.length === 0 ? (
        <EmptyState icon="📋" title="No items match" />
      ) : (
        <div className="rounded-card border-line bg-surface overflow-x-auto border">
          <table className="w-full min-w-[52rem] text-left">
            <thead className="border-line bg-surface-muted text-ink-muted border-b text-sm">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Photo
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Code
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Item
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Category
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Price
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Station
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Available
                </th>
                <th scope="col" className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr
                  key={product.id}
                  className={cn('border-line border-b', !product.isActive && 'opacity-50')}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setImageTargetId(product.id);
                        fileInputRef.current?.click();
                      }}
                      title="Upload a photo"
                      className="border-line bg-surface-sunken block size-12 overflow-hidden rounded-lg border"
                    >
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt=""
                          width={48}
                          height={48}
                          className="size-12 object-cover"
                        />
                      ) : (
                        <span className="text-lg">＋</span>
                      )}
                    </button>
                  </td>

                  <td className="px-3 py-2">
                    <span className="bg-surface-sunken rounded px-1.5 py-0.5 font-mono text-sm font-bold">
                      {product.productCode}
                    </span>
                  </td>

                  <td className="px-3 py-2">
                    <p className="font-medium">{product.displayName}</p>
                    <p className="text-ink-muted text-sm">{product.posName}</p>
                  </td>

                  <td className="px-3 py-2 text-sm">{product.category}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(product.price)}
                  </td>
                  <td className="px-3 py-2 text-sm">{product.kitchenStation}</td>

                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        void setAvailability({
                          id: product.id,
                          isAvailable: !product.isAvailable,
                        })
                      }
                      className={cn(
                        'min-h-9 rounded-full px-3 text-sm font-semibold',
                        product.isAvailable
                          ? 'bg-status-ready-soft text-status-ready-ink'
                          : 'bg-status-cancelled-soft text-status-cancelled-ink',
                      )}
                    >
                      {product.isAvailable ? 'On menu' : "86'd"}
                    </button>
                  </td>

                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditing(product)}
                        className="border-line hover:bg-surface-sunken min-h-9 rounded-lg border px-2.5 text-sm"
                      >
                        Edit
                      </button>
                      {product.imageUrl ? (
                        <button
                          type="button"
                          onClick={() => void deleteImage(product.id)}
                          title="Remove photo"
                          className="border-line text-ink-muted hover:border-status-cancelled min-h-9 rounded-lg border px-2.5 text-sm"
                        >
                          🗑
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
       * Paging controls.
       *
       * Shown whenever there is more than one page, and the range is spelled
       * out rather than left implied: an admin who sees "1-100 of 321" knows
       * the other 221 exist. That is exactly what the old silent cap hid.
       */}
      {pagination && pagination.totalPages > 1 ? (
        <nav aria-label="Menu pages" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-muted text-sm tabular-nums">
            {(pagination.page - 1) * pagination.limit + 1}&ndash;
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={!pagination.hasPrevPage || products.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <span className="text-ink-muted text-sm tabular-nums">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={!pagination.hasNextPage || products.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}

      {/* One shared input for every row's photo button. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleImagePicked(file);
        }}
      />

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit item' : 'Add item'}
        description="Product code is what the legacy POS matches on — it cannot be changed after items have been ordered against it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              isLoading={isCreating || isUpdating || isUploading}
              onClick={() => void handleSave()}
            >
              Save
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Product code"
              required
              value={editing.productCode ?? ''}
              disabled={Boolean(editing.id)}
              onChange={(event) => setEditing({ ...editing, productCode: event.target.value })}
              error={fieldErrors.productCode}
            />
            <TextField
              label="POS name"
              required
              hint="Exactly as the billing software expects it"
              value={editing.posName ?? ''}
              onChange={(event) => setEditing({ ...editing, posName: event.target.value })}
              error={fieldErrors.posName}
            />
            <TextField
              label="Display name"
              required
              hint="What guests see"
              value={editing.displayName ?? ''}
              onChange={(event) => setEditing({ ...editing, displayName: event.target.value })}
              error={fieldErrors.displayName}
            />
            <TextField
              label="Category"
              required
              value={editing.category ?? ''}
              onChange={(event) => setEditing({ ...editing, category: event.target.value })}
              error={fieldErrors.category}
            />
            <TextField
              label="Price"
              type="number"
              min={0}
              step="0.01"
              required
              value={String(editing.price ?? 0)}
              onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })}
              error={fieldErrors.price}
            />
            <TextField
              label="Tax %"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={String(editing.taxPercent ?? 0)}
              onChange={(event) =>
                setEditing({ ...editing, taxPercent: Number(event.target.value) })
              }
              error={fieldErrors.taxPercent}
            />
            <SelectField
              label="Kitchen station"
              value={editing.kitchenStation ?? KITCHEN_STATIONS.KITCHEN}
              onChange={(event) =>
                setEditing({
                  ...editing,
                  kitchenStation: event.target.value as Product['kitchenStation'],
                })
              }
              options={KITCHEN_STATION_VALUES.map((station) => ({
                value: station,
                label: station,
              }))}
            />
            <div className="sm:col-span-2">
              <TextAreaField
                label="Description"
                value={editing.description ?? ''}
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              />
            </div>

            {formError && Object.keys(fieldErrors).length === 0 ? (
              <p role="alert" className="text-status-cancelled-ink text-sm sm:col-span-2">
                {apiErrorMessage(formError, 'Could not save that item')}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
