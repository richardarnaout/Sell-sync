'use client';

import type { MonthEntry } from '../lib/stats';
import { Pill } from './ui';

// Sélecteur de mois global (Ventes et Analyse).
export default function MonthPills({ byMonthDesc, selectedMonth, setSelectedMonth }: {
  byMonthDesc: MonthEntry[]; selectedMonth: string | null; setSelectedMonth: (k: string | null) => void;
}) {
  if (byMonthDesc.length < 2) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-4">
      <Pill active={!selectedMonth} onClick={() => setSelectedMonth(null)}>Tous</Pill>
      {byMonthDesc.map(([k, m]) => (
        <Pill key={k} active={selectedMonth === k} onClick={() => setSelectedMonth(selectedMonth === k ? null : k)}>{m.label}</Pill>
      ))}
    </div>
  );
}
