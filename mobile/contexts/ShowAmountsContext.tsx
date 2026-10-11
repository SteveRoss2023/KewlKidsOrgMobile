import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { formatCurrency } from '../utils/moneyInput';

type ShowAmountsContextValue = {
  showAmounts: boolean;
  toggleShowAmounts: () => void;
  /** Format a money value, or ***** when amounts are hidden. */
  displayMoney: (value: number | string | null | undefined, empty?: string) => string;
};

const ShowAmountsContext = createContext<ShowAmountsContextValue | undefined>(undefined);

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) ? null : n;
}

export function ShowAmountsProvider({ children }: { children: React.ReactNode }) {
  const [showAmounts, setShowAmounts] = useState(false);

  const toggleShowAmounts = useCallback(() => {
    setShowAmounts((prev) => !prev);
  }, []);

  const displayMoney = useCallback(
    (value: number | string | null | undefined, empty = '—') => {
      const n = toNumber(value);
      if (n == null) return empty;
      if (!showAmounts) return '*****';
      return formatCurrency(n);
    },
    [showAmounts]
  );

  const value = useMemo(
    () => ({ showAmounts, toggleShowAmounts, displayMoney }),
    [showAmounts, toggleShowAmounts, displayMoney]
  );

  return (
    <ShowAmountsContext.Provider value={value}>{children}</ShowAmountsContext.Provider>
  );
}

export function useShowAmounts(): ShowAmountsContextValue {
  const ctx = useContext(ShowAmountsContext);
  if (!ctx) {
    throw new Error('useShowAmounts must be used within ShowAmountsProvider');
  }
  return ctx;
}
