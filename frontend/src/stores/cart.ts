import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '../api/types';

export interface CartLine {
  product: Product;
  qty: number;
  discount: number;
}

interface CartState {
  lines: CartLine[];
  customerId: number | null;
  add: (product: Product, qty?: number) => void;
  setQty: (productId: number, qty: number) => void;
  setDiscount: (productId: number, discount: number) => void;
  remove: (productId: number) => void;
  setCustomer: (id: number | null) => void;
  clear: () => void;
}

/**
 * Panier de caisse. Il ne contient aucun texte traduit : changer de langue
 * ne fait que re-rendre les libellés, le panier en cours est conservé
 * (et survit même à un rechargement grâce à la persistance locale).
 */
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      customerId: null,
      add: (product, qty = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.product.id === product.id);
          if (existing) {
            return { lines: s.lines.map((l) => (l.product.id === product.id ? { ...l, qty: round3(l.qty + qty), product } : l)) };
          }
          return { lines: [...s.lines, { product, qty, discount: 0 }] };
        }),
      setQty: (productId, qty) =>
        set((s) => ({
          lines: qty <= 0 ? s.lines.filter((l) => l.product.id !== productId) : s.lines.map((l) => (l.product.id === productId ? { ...l, qty: round3(qty) } : l)),
        })),
      setDiscount: (productId, discount) =>
        set((s) => ({ lines: s.lines.map((l) => (l.product.id === productId ? { ...l, discount: Math.max(0, discount) } : l)) })),
      remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.product.id !== productId) })),
      setCustomer: (customerId) => set({ customerId }),
      clear: () => set({ lines: [], customerId: null }),
    }),
    { name: 'baqala.cart' },
  ),
);

const round3 = (n: number) => Math.round(n * 1000) / 1000;
