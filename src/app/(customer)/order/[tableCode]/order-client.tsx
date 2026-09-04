'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { OrderStatusPanel } from '@/components/customer/order-status-panel';
import { ServiceRequestBar } from '@/components/customer/service-request-bar';
import { CartDrawer } from '@/components/menu/cart-drawer';
import { MenuCategoryTabs } from '@/components/menu/menu-category-tabs';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { Button } from '@/components/ui/button';
import { ConnectionDot } from '@/components/ui/connection-dot';
import { EmptyState } from '@/components/ui/feedback';
import { useCart } from '@/hooks/use-cart';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { SESSION_STATUS, type ServiceRequestType } from '@/lib/constants';
import type { MenuCategory, MenuItem, ResolvedTable } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { apiErrorMessage } from '@/store/api/base-query';
import {
  useMenuQuery,
  useOrderStatusQuery,
  usePlaceOrderMutation,
  useRaiseServiceRequestMutation,
  useResolveTableQuery,
} from '@/store/api/customer-api';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';
import { useSocketSync } from '@/store/socket/use-socket-sync';

interface OrderClientProps {
  tableCode: string;
  initialTable: ResolvedTable;
  initialMenu: MenuCategory[];
}

/**
 * Everything interactive on a guest's phone.
 *
 * The server already rendered the table header and the menu; this takes over
 * for the cart, live status and service requests. The server's copy is used as
 * the rendered value until the client's own fetch resolves, so there is never a
 * spinner where a menu already was.
 */
export function OrderClient({ tableCode, initialTable, initialMenu }: OrderClientProps) {
  const dispatch = useAppDispatch();

  // The same code opens the socket, which is what pins this phone to its own
  // table's room and nobody else's.
  useSocketSync({ tableCode });

  const { data: resolved = initialTable } = useResolveTableQuery(tableCode);
  const { data: menu = initialMenu } = useMenuQuery(tableCode);
  const { data: orderStatus } = useOrderStatusQuery(tableCode, {
    // A guest watching their food arrive should see it move even if a socket
    // event is missed on flaky Wi-Fi.
    pollingInterval: 60_000,
  });

  const [placeOrder, { isLoading: isPlacing }] = usePlaceOrderMutation();
  const [raiseRequest] = useRaiseServiceRequestMutation();
  const [pendingRequest, setPendingRequest] = useState<ServiceRequestType | null>(null);

  const cart = useCart(tableCode);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const categories = useMemo(() => menu.map((group) => group.category), [menu]);
  const [activeCategory, setActiveCategory] = useState(categories[0] ?? '');

  const counts = useMemo(
    () => Object.fromEntries(menu.map((group) => [group.category, group.items.length])),
    [menu],
  );

  /** Section elements, so a chip tap can scroll to the matching heading. */
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const searchTerm = debouncedSearch.trim().toLowerCase();
  const isSearching = searchTerm.length > 0;

  /** Search spans the whole menu and collapses it to one flat list of hits. */
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return menu
      .flatMap((group) => group.items)
      .filter((item) => item.displayName.toLowerCase().includes(searchTerm));
  }, [menu, isSearching, searchTerm]);

  /**
   * Highlight the chip for whichever section is under the top of the screen.
   *
   * The observer's top margin pulls the trigger line just below the sticky chip
   * bar, so a heading counts as "current" when the guest can actually see it
   * rather than when it is still hidden behind the bar.
   */
  useEffect(() => {
    if (isSearching || categories.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const category = visible?.target.getAttribute('data-category');
        if (category) setActiveCategory(category);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );

    for (const category of categories) {
      const node = sectionRefs.current[category];
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [categories, isSearching]);

  /** Chip tap: scroll the section into view. The observer updates the highlight. */
  function jumpToCategory(category: string) {
    setActiveCategory(category);
    sectionRefs.current[category]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const rounds = orderStatus?.rounds ?? [];
  const session = resolved.session;
  const billRequested = session?.status === SESSION_STATUS.BILL_REQUESTED;

  /** The table is settling a previous group's bill — do not join that bill. */
  const blockedReason = resolved.warning ?? null;

  function handleAdd(item: MenuItem) {
    cart.add(item);
  }

  function handleSetQuantity(item: MenuItem, quantity: number) {
    const index = cart.lines.findIndex(
      (line) => line.productCode === item.productCode && line.specialInstructions === '',
    );
    if (index >= 0) cart.setQuantity(index, quantity);
    else if (quantity > 0) cart.add(item, quantity);
  }

  async function handlePlaceOrder() {
    if (cart.isEmpty || isPlacing) return;

    try {
      const placed = await placeOrder({
        tableCode,
        items: cart.toOrderItems(),
        // Sent with the round so a double-tap or a retry after dropped Wi-Fi
        // returns the original order instead of cooking it twice.
        idempotencyKey: cart.idempotencyKey,
      }).unwrap();

      cart.markSubmitted();
      setCartOpen(false);
      dispatch(toastPushed(`Order sent to the kitchen · KOT ${placed.kotId}`, 'success'));
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not place the order'), 'error'));
    }
  }

  async function handleServiceRequest(type: ServiceRequestType) {
    setPendingRequest(type);
    try {
      await raiseRequest({ tableCode, type }).unwrap();
      dispatch(
        toastPushed(
          type === 'bill' ? 'Bill requested — someone is on their way' : 'Staff have been notified',
          'success',
        ),
      );
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not send that request'), 'error'));
    } finally {
      setPendingRequest(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 px-4 pt-4 pb-32">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-ink-muted text-sm">Table</p>
          <h1 className="text-3xl font-bold tracking-tight">{resolved.table.code}</h1>
          <p className="text-ink-muted text-sm">{resolved.table.zone}</p>
        </div>
        <ConnectionDot className="text-ink-muted mt-1" />
      </header>

      {blockedReason ? (
        <p
          role="alert"
          className="rounded-card border-status-pending/40 bg-status-pending-soft text-status-pending-ink border px-4 py-3 text-sm"
        >
          {blockedReason}
        </p>
      ) : null}

      {billRequested ? (
        <p className="rounded-card border-status-bill/30 bg-status-bill-soft text-status-bill-ink border px-4 py-3 text-sm">
          🧾 Your bill has been requested. A staff member is on their way.
        </p>
      ) : null}

      <ServiceRequestBar
        onRequest={(type) => void handleServiceRequest(type)}
        pending={pendingRequest}
        canRequestBill={Boolean(session)}
      />

      <OrderStatusPanel rounds={rounds} runningTotal={orderStatus?.totals?.total ?? null} />

      <section aria-label="Menu" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Menu</h2>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search the menu"
          aria-label="Search the menu"
          className="min-h-touch border-line bg-surface w-full rounded-xl border px-4 text-base"
        />

        {!isSearching ? (
          <div className="sticky top-0 z-20">
            <MenuCategoryTabs
              categories={categories}
              active={activeCategory}
              onChange={jumpToCategory}
              counts={counts}
            />
          </div>
        ) : null}

        {isSearching ? (
          searchResults.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="Nothing matches that"
              description="Try a different word, or ask a staff member."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {searchResults.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  quantity={cart.quantityOf(item.productCode)}
                  onAdd={handleAdd}
                  onSetQuantity={handleSetQuantity}
                />
              ))}
            </ul>
          )
        ) : (
          /*
           * Every category on one page.
           *
           * `menu-section` carries `content-visibility: auto`, so the browser
           * skips laying out the sections that are off-screen. That keeps a
           * 300-item menu as cheap to open as a 30-item one on a cheap phone,
           * while still letting the guest scroll the whole thing.
           */
          menu.map((group) => (
            <section
              key={group.category}
              data-category={group.category}
              ref={(node) => {
                sectionRefs.current[group.category] = node;
              }}
              aria-labelledby={`category-${group.category.replace(/\s+/g, '-')}`}
              className="menu-section scroll-mt-20"
            >
              <h3
                id={`category-${group.category.replace(/\s+/g, '-')}`}
                className="text-ink-muted mb-2 flex items-baseline gap-2 text-sm font-bold tracking-wide uppercase"
              >
                {group.category}
                <span className="text-ink-muted/70 tabular-nums">{group.items.length}</span>
              </h3>

              <ul className="mb-5 flex flex-col gap-2">
                {group.items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    quantity={cart.quantityOf(item.productCode)}
                    onAdd={handleAdd}
                    onSetQuantity={handleSetQuantity}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </section>

      {/* Sticky basket. Always reachable by a thumb, never covers a menu row. */}
      {!cart.isEmpty ? (
        <div className="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="flex-1">
              <p className="text-ink-muted text-sm">
                {cart.totals.itemCount} {cart.totals.itemCount === 1 ? 'item' : 'items'}
              </p>
              <p className="font-bold tabular-nums">
                {formatCurrency(cart.totals.estimatedSubtotal)}
              </p>
            </div>
            <Button size="lg" onClick={() => setCartOpen(true)}>
              View order
            </Button>
          </div>
        </div>
      ) : null}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={cart.lines}
        estimatedSubtotal={cart.totals.estimatedSubtotal}
        itemCount={cart.totals.itemCount}
        isSubmitting={isPlacing}
        onSetQuantity={cart.setQuantity}
        onSetInstructions={cart.setInstructions}
        onPlaceOrder={() => void handlePlaceOrder()}
        blockedReason={blockedReason}
      />
    </main>
  );
}
