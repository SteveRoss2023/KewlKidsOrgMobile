import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
import moneyService from '../../services/moneyService';
import {
  IncomeFrequency,
  IncomeOccurrence,
  IncomeStream,
  IncomeStreamType,
} from '../../types/money';
import { forFamily } from '../../utils/familyScope';
import AuthService from '../../services/authService';
import { STORAGE_KEYS, storage } from '../../utils/storage';
import {
  canUseMoneyDemoPortfolio,
  withDemoIncome,
} from '../../utils/moneyDemoPortfolio';
import DonutChart from '../expenses/charts/DonutChart';
import MonthIncomeBars from './charts/MonthIncomeBars';
import TooltipButton from '../TooltipButton';
import { useIsWideLayout } from '../../hooks/useIsWideLayout';
import {
  isPhoneMoneyLayout,
  phoneMoneyCaption,
  phoneMoneyCell,
  phoneMoneyGrid,
  phoneMoneyValueStyle,
} from '../expenses/phoneMoneyLayout';

function monthTitle(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function defaultIncomeMonthIndex(
  y: number,
  rows: { total: number }[],
  now: Date
): number {
  if (y === now.getFullYear()) return now.getMonth();
  for (let i = 11; i >= 0; i--) {
    if (rows[i]?.total > 0) return i;
  }
  return 11;
}

const STREAM_COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#db2777',
  '#7c3aed',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
];

function streamColor(streamId: number): string {
  return STREAM_COLORS[Math.abs(streamId) % STREAM_COLORS.length];
}

const STREAM_TYPE_LABELS: Record<IncomeStreamType, string> = {
  employment: 'Employment',
  pension: 'Pension',
  other: 'Other',
};

const FREQ_LABELS: Record<IncomeFrequency, string> = {
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  third_last_biz: 'Monthly (CPP/OAS)',
  second_last_biz: 'Monthly (LAPP)',
  one_time: 'One-time',
};

function formatShortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m) return ymd;
  const dt = new Date(y, m - 1, d || 1);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function occAmount(o: IncomeOccurrence): number {
  return Number(o.actual_amount ?? o.estimated_amount ?? 0) || 0;
}

/** Open-ended streams: list/generate through Dec 31 of the selected Overview year. */
function openEndedHorizonEnd(year: number): string {
  return `${year}-12-31`;
}

function maxOccurrenceYear(occs: IncomeOccurrence[]): number {
  let max = 0;
  for (const o of occs) {
    const y = parseInt(String(o.due_date).slice(0, 4), 10);
    if (!Number.isNaN(y) && y > max) max = y;
  }
  return max;
}

/** Survive tab remounts so we don't re-POST generate_occurrences every visit. */
const ensuredIncomeScheduleKeys = new Set<string>();

type IncomeBoardCache = {
  streams: IncomeStream[];
  occurrences: IncomeOccurrence[];
  demoPortfolio: boolean;
  year: number;
  boardTab: 'overview' | 'streams';
  selectedMonthIndex: number;
};

/** Keep last Income payload so YTD/Accounts ↔ Income doesn't cold-reload. */
const incomeBoardCache = new Map<number, IncomeBoardCache>();

/** Drop cached Income boards after stream/payment mutations. */
export function invalidateIncomeBoardCache(familyId?: number | null) {
  if (familyId == null) {
    incomeBoardCache.clear();
    return;
  }
  incomeBoardCache.delete(familyId);
}

/** Payments for Streams management: all loaded pays for the stream (honor end_date). */
function paymentsForStream(
  stream: IncomeStream,
  allOccs: IncomeOccurrence[]
): IncomeOccurrence[] {
  const all = allOccs.filter((o) => o.stream === stream.id);
  if (stream.end_date) {
    return all.filter((o) => o.due_date <= stream.end_date!);
  }
  return all;
}

interface IncomeDashboardProps {
  refreshKey?: number;
  onAddStream?: () => void;
  onEditStream?: (stream: IncomeStream) => void;
  onEditOccurrence?: (occ: IncomeOccurrence) => void;
  onDeleteStream?: (stream: IncomeStream) => void;
  onDeleteOccurrence?: (occ: IncomeOccurrence) => void;
}

export default function IncomeDashboard({
  refreshKey = 0,
  onAddStream,
  onEditStream,
  onEditOccurrence,
  onDeleteStream,
  onDeleteOccurrence,
}: IncomeDashboardProps) {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();
  const isWide = useIsWideLayout();
  const { width: windowWidth } = useWindowDimensions();
  const phoneMoney = isPhoneMoneyLayout(windowWidth);

  const now = useMemo(() => new Date(), []);
  const initialCache =
    selectedFamily != null ? incomeBoardCache.get(selectedFamily.id) : undefined;

  const [year, setYear] = useState(() => initialCache?.year ?? now.getFullYear());
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState('');
  const [streams, setStreams] = useState<IncomeStream[]>(() => initialCache?.streams ?? []);
  const [occurrences, setOccurrences] = useState<IncomeOccurrence[]>(
    () => initialCache?.occurrences ?? []
  );
  const [demoPortfolio, setDemoPortfolio] = useState(() => initialCache?.demoPortfolio ?? false);
  const [dataFamilyId, setDataFamilyId] = useState<number | null>(() =>
    initialCache && selectedFamily ? selectedFamily.id : null
  );
  const [boardTab, setBoardTab] = useState<'overview' | 'streams'>(
    () => initialCache?.boardTab ?? 'overview'
  );
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(
    () => initialCache?.selectedMonthIndex ?? now.getMonth()
  );
  const [expandedStreamIds, setExpandedStreamIds] = useState<number[]>([]);

  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;
  const ensuredYearRef = useRef('');
  const monthInitYearRef = useRef<number | null>(initialCache ? initialCache.year : null);
  const yearRef = useRef(year);
  yearRef.current = year;
  const boardTabRef = useRef(boardTab);
  boardTabRef.current = boardTab;
  const selectedMonthIndexRef = useRef(selectedMonthIndex);
  selectedMonthIndexRef.current = selectedMonthIndex;

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setStreams([]);
    setOccurrences([]);
    setError('');
    setDataFamilyId(null);
    ensuredYearRef.current = '';
    setExpandedStreamIds([]);
    setBoardTab('overview');
    monthInitYearRef.current = null;
    setLoading(true);
  }, []);

  const writeCache = useCallback(
    (
      familyId: number,
      payload: {
        streams: IncomeStream[];
        occurrences: IncomeOccurrence[];
        demoPortfolio: boolean;
      }
    ) => {
      incomeBoardCache.set(familyId, {
        ...payload,
        year: yearRef.current,
        boardTab: boardTabRef.current,
        selectedMonthIndex: selectedMonthIndexRef.current,
      });
    },
    []
  );

  const readDemoPortfolioPref = useCallback(async (): Promise<boolean> => {
    const user = await AuthService.getUserData();
    const email = user?.email || null;
    if (!canUseMoneyDemoPortfolio(email) || !email) return false;
    const key = `${STORAGE_KEYS.MONEY_DEMO_PORTFOLIO}:${email.toLowerCase()}`;
    const v = await storage.getItem(key);
    return v === '1';
  }, []);

  /**
   * Generate pays through stream end_date, or for open-ended streams through
   * the selected Overview year Dec 31.
   */
  const ensureStreamSchedules = useCallback(
    async (y: number, streamList: IncomeStream[], familyId: number) => {
      if (streamList.length === 0) return false;
      if (streamList.some((s) => s.family !== familyId)) return false;
      const openHorizonEnd = openEndedHorizonEnd(y);
      const key = `${familyId}:${openHorizonEnd}:${streamList.map((s) => s.id).join(',')}`;
      if (ensuredYearRef.current === key || ensuredIncomeScheduleKeys.has(key)) {
        ensuredYearRef.current = key;
        return false;
      }
      let createdAny = false;
      try {
        const results = await Promise.all(
          streamList.map(async (s) => {
            const until = s.end_date || openHorizonEnd;
            if (s.start_date > until) return 0;
            const res = await moneyService.generateOccurrences(s.id, until);
            return res.created;
          })
        );
        createdAny = results.some((n) => n > 0);
        ensuredYearRef.current = key;
        ensuredIncomeScheduleKeys.add(key);
      } catch {
        // ignore auto-fill errors
      }
      return createdAny;
    },
    []
  );

  const dataFamilyIdRef = useRef(dataFamilyId);
  dataFamilyIdRef.current = dataFamilyId;

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!selectedFamily) {
        clearState();
        setLoading(false);
        return;
      }
      const soft = !!opts?.soft;
      const familyId = selectedFamily.id;
      const generation = ++fetchGenerationRef.current;
      const cached = incomeBoardCache.get(familyId);
      const alreadyOnFamily = dataFamilyIdRef.current === familyId;
      if (cached) {
        setStreams(cached.streams);
        setOccurrences(cached.occurrences);
        setDemoPortfolio(cached.demoPortfolio);
        // Only restore year/tab/month on cold family entry — never while already
        // viewing this family (year changes must not fight the persist effect).
        if (!alreadyOnFamily) {
          setYear(cached.year);
          setBoardTab(cached.boardTab);
          setSelectedMonthIndex(cached.selectedMonthIndex);
          monthInitYearRef.current = cached.year;
        }
        setDataFamilyId(familyId);
        setLoading(false);
        // Tab return with warm cache: skip network (mutations clear via invalidate).
        if (soft) return;
      } else if (!soft) {
        setLoading(true);
      }
      setError('');
      try {
        const demoEnabled = await readDemoPortfolioPref();
        const horizonEnd = openEndedHorizonEnd(yearRef.current);
        // Paint from streams + payments first; schedule fill runs after (was blocking).
        const [streamListRaw, occListRaw] = await Promise.all([
          moneyService.getStreams(familyId),
          moneyService.getOccurrences(familyId, { end_date: horizonEnd }),
        ]);
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        const streamList = forFamily(streamListRaw, familyId);
        const occList = forFamily(occListRaw, familyId);
        setDemoPortfolio(demoEnabled);
        setStreams(streamList);
        setOccurrences(occList);
        setDataFamilyId(familyId);
        setLoading(false);
        writeCache(familyId, {
          streams: streamList,
          occurrences: occList,
          demoPortfolio: demoEnabled,
        });

        // Use yearRef so year navigation does not recreate `load` / re-fire focus.
        const createdAny = await ensureStreamSchedules(
          yearRef.current,
          streamList,
          familyId
        );
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        if (createdAny) {
          const refreshHorizon = openEndedHorizonEnd(yearRef.current);
          const refreshed = forFamily(
            await moneyService.getOccurrences(familyId, { end_date: refreshHorizon }),
            familyId
          );
          if (
            generation !== fetchGenerationRef.current ||
            selectedFamilyIdRef.current !== familyId
          ) {
            return;
          }
          setOccurrences(refreshed);
          writeCache(familyId, {
            streams: streamList,
            occurrences: refreshed,
            demoPortfolio: demoEnabled,
          });
        }
      } catch (err: any) {
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setError(err.message || 'Failed to load income');
        setStreams([]);
        setOccurrences([]);
        setDataFamilyId(null);
      } finally {
        if (
          generation === fetchGenerationRef.current &&
          selectedFamilyIdRef.current === familyId
        ) {
          setLoading(false);
        }
      }
    },
    [selectedFamily, clearState, readDemoPortfolioPref, ensureStreamSchedules, writeCache]
  );

  useEffect(() => {
    clearState();
    if (selectedFamily) {
      const cached = incomeBoardCache.get(selectedFamily.id);
      if (cached) {
        setStreams(cached.streams);
        setOccurrences(cached.occurrences);
        setDemoPortfolio(cached.demoPortfolio);
        setYear(cached.year);
        setBoardTab(cached.boardTab);
        setSelectedMonthIndex(cached.selectedMonthIndex);
        setDataFamilyId(selectedFamily.id);
        monthInitYearRef.current = cached.year;
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedFamily) {
        setLoading(false);
        return;
      }
      const cacheHit = incomeBoardCache.has(selectedFamily.id);
      const soft = cacheHit || dataFamilyId === selectedFamily.id;
      void load({ soft });
    }, [selectedFamily?.id, load, dataFamilyId])
  );

  const lastRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (!selectedFamily) return;
    if (refreshKey === lastRefreshKeyRef.current) return;
    lastRefreshKeyRef.current = refreshKey;
    void load({ soft: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Persist year / sub-tab / month so remount restores the same view.
  useEffect(() => {
    if (!selectedFamily || dataFamilyId !== selectedFamily.id) return;
    const prev = incomeBoardCache.get(selectedFamily.id);
    if (!prev) return;
    incomeBoardCache.set(selectedFamily.id, {
      ...prev,
      year,
      boardTab,
      selectedMonthIndex,
    });
  }, [selectedFamily, dataFamilyId, year, boardTab, selectedMonthIndex]);

  const occurrencesRef = useRef(occurrences);
  occurrencesRef.current = occurrences;

  // When Overview year moves past loaded pays, generate + fetch through that year.
  useEffect(() => {
    if (!selectedFamily || dataFamilyId !== selectedFamily.id) return;
    if (streams.length === 0) return;
    const familyId = selectedFamily.id;
    let cancelled = false;
    void (async () => {
      const localMax = maxOccurrenceYear(occurrencesRef.current);
      const createdAny = await ensureStreamSchedules(year, streams, familyId);
      if (cancelled || selectedFamilyIdRef.current !== familyId) return;
      // Refetch when new pays were created, or selected year is beyond what we have loaded.
      if (!createdAny && year <= localMax) return;
      const horizonEnd = openEndedHorizonEnd(Math.max(year, localMax));
      try {
        const refreshed = forFamily(
          await moneyService.getOccurrences(familyId, { end_date: horizonEnd }),
          familyId
        );
        if (cancelled || selectedFamilyIdRef.current !== familyId) return;
        setOccurrences(refreshed);
        writeCache(familyId, {
          streams,
          occurrences: refreshed,
          demoPortfolio,
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    year,
    selectedFamily,
    dataFamilyId,
    streams,
    demoPortfolio,
    ensureStreamSchedules,
    writeCache,
  ]);

  const streamTypeById = useMemo(() => {
    const map = new Map<number, IncomeStreamType>();
    for (const s of streams) map.set(s.id, s.stream_type);
    return map;
  }, [streams]);

  const streamNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of streams) map.set(s.id, s.name);
    return map;
  }, [streams]);

  const displayOccurrences = useMemo(() => {
    if (!demoPortfolio) return occurrences;
    return occurrences.map((o) => {
      const streamType = streamTypeById.get(o.stream);
      const estimated = withDemoIncome(o.estimated_amount, streamType, true);
      const actual =
        o.actual_amount == null
          ? null
          : withDemoIncome(o.actual_amount, streamType, true);
      return {
        ...o,
        estimated_amount: estimated ?? o.estimated_amount,
        actual_amount: actual,
      };
    });
  }, [occurrences, demoPortfolio, streamTypeById]);

  /** Overview charts/KPIs — selected year only. */
  const yearOccurrences = useMemo(() => {
    const prefix = `${year}-`;
    return displayOccurrences.filter((o) => o.due_date.startsWith(prefix));
  }, [displayOccurrences, year]);

  /** Stream estimates are not pre-boosted; occurrence rows already are via displayOccurrences. */
  const displayStreamEstimate = (s: IncomeStream) =>
    displayMoney(withDemoIncome(s.default_estimate, s.stream_type, demoPortfolio));

  const originalOccById = useMemo(() => {
    const map = new Map<number, IncomeOccurrence>();
    for (const o of occurrences) map.set(o.id, o);
    return map;
  }, [occurrences]);

  const editOcc = (o: IncomeOccurrence) => {
    onEditOccurrence?.(originalOccById.get(o.id) || o);
  };
  const deleteOcc = (o: IncomeOccurrence) => {
    onDeleteOccurrence?.(originalOccById.get(o.id) || o);
  };

  const yearMonthRows = useMemo(() => {
    const rows: {
      key: string;
      label: string;
      shortLabel: string;
      monthIndex: number;
      occs: IncomeOccurrence[];
      total: number;
    }[] = [];
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, '0')}`;
      const prefix = `${key}-`;
      const occs = yearOccurrences
        .filter((o) => o.due_date.startsWith(prefix))
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.stream - b.stream);
      let total = 0;
      for (const o of occs) total += occAmount(o);
      const dt = new Date(year, m, 1);
      rows.push({
        key,
        label: dt.toLocaleDateString('en-US', { month: 'long' }),
        shortLabel: dt.toLocaleDateString('en-US', { month: 'short' }),
        monthIndex: m,
        occs,
        total,
      });
    }
    return rows;
  }, [yearOccurrences, year]);

  useEffect(() => {
    if (loading) return;
    if (monthInitYearRef.current === year) return;
    monthInitYearRef.current = year;
    setSelectedMonthIndex(defaultIncomeMonthIndex(year, yearMonthRows, now));
  }, [loading, year, yearMonthRows, now]);

  const selectedMonth = yearMonthRows[selectedMonthIndex] || yearMonthRows[0];

  const barPoints = useMemo(
    () =>
      yearMonthRows.map((m) => ({
        monthIndex: m.monthIndex,
        label: m.shortLabel,
        income: m.total,
      })),
    [yearMonthRows]
  );

  const yearIncomeTotal = useMemo(
    () => yearMonthRows.reduce((sum, row) => sum + row.total, 0),
    [yearMonthRows]
  );

  const receivedTotal = useMemo(() => {
    let sum = 0;
    for (const o of yearOccurrences) {
      if (o.status === 'received') sum += occAmount(o);
    }
    return sum;
  }, [yearOccurrences]);

  const estimatedTotal = useMemo(() => {
    let sum = 0;
    for (const o of yearOccurrences) {
      if (o.status === 'estimated') {
        sum += Number(o.estimated_amount ?? 0) || 0;
      }
    }
    return sum;
  }, [yearOccurrences]);

  const donutSlices = useMemo(() => {
    const byStream = new Map<number, number>();
    for (const o of yearOccurrences) {
      byStream.set(o.stream, (byStream.get(o.stream) || 0) + occAmount(o));
    }
    return Array.from(byStream.entries())
      .map(([streamId, amount]) => ({
        key: String(streamId),
        label: streamNameById.get(streamId) || `Stream ${streamId}`,
        amount: Math.max(0, amount),
        color: streamColor(streamId),
      }))
      .filter((s) => s.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [yearOccurrences, streamNameById]);

  const toggleStreamExpanded = (id: number) => {
    setExpandedStreamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
      </View>
    );
  }

  const yearNav = (
    <View style={styles.yearNav}>
      <TouchableOpacity
        style={styles.navBtn}
        onPress={() => setYear((y) => y - 1)}
        accessibilityLabel="Previous year"
      >
        <FontAwesome name="chevron-left" size={16} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.yearLabel, { color: colors.text }]}>{year}</Text>
      <TouchableOpacity
        style={styles.navBtn}
        onPress={() => setYear((y) => y + 1)}
        accessibilityLabel="Next year"
      >
        <FontAwesome name="chevron-right" size={16} color={colors.text} />
      </TouchableOpacity>
      {year !== now.getFullYear() ? (
        <TouchableOpacity
          style={[styles.todayBtn, { borderColor: colors.border }]}
          onPress={() => setYear(now.getFullYear())}
        >
          <Text style={[styles.todayBtnText, { color: colors.primary }]}>This year</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderOverview = () => {
    if (streams.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {yearNav}
          <View style={styles.emptyBlock}>
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Add an income stream first, then yearly income will show here.
            </Text>
            {onAddStream ? (
              <TouchableOpacity
                style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setBoardTab('streams');
                  onAddStream();
                }}
              >
                <FontAwesome name="plus" size={14} color="#fff" />
                <Text style={styles.primaryActionText}>Add stream</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setBoardTab('streams')}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Go to Streams</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      );
    }

    const hero = (
      <View
        style={[
          styles.heroCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>
          Income · {year}
        </Text>
        <View style={[styles.heroGrid, phoneMoney && phoneMoneyGrid]}>
          <View style={phoneMoney ? phoneMoneyCell : styles.heroCell}>
            <Text
              style={[
                styles.heroCaption,
                { color: colors.textSecondary },
                phoneMoney && phoneMoneyCaption,
              ]}
              numberOfLines={1}
            >
              Year total
            </Text>
            <Text
              style={[
                styles.heroValue,
                { color: colors.primary },
                phoneMoney &&
                  phoneMoneyValueStyle(displayMoney(yearIncomeTotal), windowWidth),
              ]}
              numberOfLines={1}
            >
              {displayMoney(yearIncomeTotal)}
            </Text>
          </View>
          <View style={phoneMoney ? phoneMoneyCell : styles.heroCell}>
            <Text
              style={[
                styles.heroCaption,
                { color: colors.textSecondary },
                phoneMoney && phoneMoneyCaption,
              ]}
              numberOfLines={1}
            >Received</Text>
            <Text
              style={[
                styles.heroValue,
                { color: colors.success || '#10b981' },
                phoneMoney && phoneMoneyValueStyle(displayMoney(receivedTotal), windowWidth),
              ]}
              numberOfLines={1}
            >
              {displayMoney(receivedTotal)}
            </Text>
          </View>
          <View style={phoneMoney ? phoneMoneyCell : styles.heroCell}>
            <Text
              style={[
                styles.heroCaption,
                { color: colors.textSecondary },
                phoneMoney && phoneMoneyCaption,
              ]}
              numberOfLines={1}
            >
              Estimated
            </Text>
            <Text
              style={[
                styles.heroValue,
                { color: '#f59e0b' },
                phoneMoney && phoneMoneyValueStyle(displayMoney(estimatedTotal), windowWidth),
              ]}
              numberOfLines={1}
            >
              {displayMoney(estimatedTotal)}
            </Text>
          </View>
        </View>
      </View>
    );

    const byStreamDonut = (
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>By stream</Text>
        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
          {year} income mix
        </Text>
        {donutSlices.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No payments to chart
          </Text>
        ) : (
          <View style={styles.donutBlock}>
            <DonutChart
              slices={donutSlices}
              textColor={colors.text}
              mutedColor={colors.textSecondary}
              trackColor={colors.border}
              centerLabel={displayMoney(yearIncomeTotal)}
              centerSubLabel="Year"
            />
            <View style={styles.donutLegend}>
              {donutSlices.map((s) => (
                <View key={s.key} style={styles.donutLegendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
                  <Text style={[styles.donutLegendLabel, { color: colors.text }]}>
                    {s.label}
                  </Text>
                  <Text style={[styles.donutLegendAmt, { color: colors.textSecondary }]}>
                    {displayMoney(s.amount)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    );

    const monthlyBars = (
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Monthly income</Text>
        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
          Hover or tap a month to see values
        </Text>
        <MonthIncomeBars
          points={barPoints}
          selectedMonthIndex={selectedMonthIndex}
          onSelectMonth={setSelectedMonthIndex}
          incomeColor={colors.success || '#10b981'}
          trackColor={colors.border}
          textColor={colors.text}
          mutedColor={colors.textSecondary}
          selectedBorderColor={colors.primary}
          formatAmount={displayMoney}
        />
      </View>
    );

    const monthPayments = selectedMonth ? (
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.monthHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>
            {monthTitle(year, selectedMonth.monthIndex)}
          </Text>
          <Text style={[styles.monthAmt, { color: colors.primary }]}>
            {displayMoney(selectedMonth.total)}
          </Text>
        </View>
        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
          {selectedMonth.occs.length} payment
          {selectedMonth.occs.length === 1 ? '' : 's'}
        </Text>
        {selectedMonth.occs.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No payments this month.
          </Text>
        ) : (
          <View style={styles.monthPays}>
            {selectedMonth.occs.map((o) => {
              const color = streamColor(o.stream);
              return (
                <View
                  key={o.id}
                  style={[
                    styles.payRow,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                    },
                  ]}
                >
                  <View style={[styles.payBar, { backgroundColor: color }]} />
                  <TouchableOpacity style={styles.flex} onPress={() => editOcc(o)}>
                    <Text style={[styles.payName, { color: colors.text }]} numberOfLines={1}>
                      {o.stream_name || streamNameById.get(o.stream) || 'Stream'}
                    </Text>
                    <Text
                      style={[styles.meta, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {formatShortDate(o.due_date)} · Est {displayMoney(o.estimated_amount)}
                      {o.actual_amount != null ? (
                        <>
                          {' · Act '}
                          <Text
                            style={{
                              color: colors.success || '#10b981',
                              fontWeight: '700',
                            }}
                          >
                            {displayMoney(o.actual_amount)}
                          </Text>
                        </>
                      ) : null}
                    </Text>
                  </TouchableOpacity>
                  {onEditOccurrence ? (
                    <TooltipButton
                      tooltip="Edit payment"
                      style={styles.iconAction}
                      onPress={() => editOcc(o)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <FontAwesome name="pencil" size={12} color={colors.primary} />
                    </TooltipButton>
                  ) : null}
                  {onDeleteOccurrence ? (
                    <TooltipButton
                      tooltip="Delete payment"
                      style={styles.iconAction}
                      onPress={() => deleteOcc(o)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <FontAwesome
                        name="trash"
                        size={12}
                        color={colors.error || '#ef4444'}
                      />
                    </TooltipButton>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>
    ) : null;

    const left = (
      <>
        {yearNav}
        {hero}
        {byStreamDonut}
      </>
    );
    const right = (
      <>
        {monthlyBars}
        {monthPayments}
      </>
    );

    return (
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isWide ? (
          <View style={styles.wideRow}>
            <View style={styles.wideCol}>{left}</View>
            <View style={styles.wideCol}>{right}</View>
          </View>
        ) : (
          <>
            {left}
            {right}
          </>
        )}
      </ScrollView>
    );
  };

  const renderStreams = () => (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.streamsHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>
          Streams ({streams.length})
        </Text>
        {onAddStream ? (
          <TouchableOpacity
            style={[styles.primaryAction, { backgroundColor: colors.primary }]}
            onPress={onAddStream}
          >
            <FontAwesome name="plus" size={14} color="#fff" />
            <Text style={styles.primaryActionText}>Add stream</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={[styles.sectionHint, { color: colors.textSecondary, marginTop: -6 }]}>
        Manage paycheck and pension streams. Use Overview year to generate pays further out.
      </Text>

      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {streams.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Add a paycheck or pension stream with start/end dates.
          </Text>
        ) : (
          streams.map((s, index) => {
            const expanded = expandedStreamIds.includes(s.id);
            const color = streamColor(s.id);
            const items = paymentsForStream(s, displayOccurrences);
            return (
              <View
                key={s.id}
                style={[
                  styles.streamBlock,
                  {
                    borderTopColor: colors.border,
                    borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.streamHeader}
                  onPress={() => toggleStreamExpanded(s.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                >
                  <FontAwesome
                    name={expanded ? 'chevron-down' : 'chevron-right'}
                    size={11}
                    color={colors.textSecondary}
                  />
                  <View style={[styles.colorBar, { backgroundColor: color }]} />
                  <View style={styles.flex}>
                    <View style={styles.streamTop}>
                      <Text style={[styles.streamName, { color: colors.text }]} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Text
                        style={[
                          styles.streamAmt,
                          { color: colors.text },
                          phoneMoney &&
                            phoneMoneyValueStyle(displayStreamEstimate(s), windowWidth, 14, 0.42),
                        ]}
                        numberOfLines={1}
                      >
                        {displayStreamEstimate(s)}
                      </Text>
                    </View>
                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {STREAM_TYPE_LABELS[s.stream_type] || s.stream_type}
                      {' · '}
                      {FREQ_LABELS[s.frequency] || s.frequency}
                      {' · '}
                      {items.length} payments
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {formatShortDate(s.start_date)}
                      {' → '}
                      {s.end_date ? formatShortDate(s.end_date) : 'open'}
                    </Text>
                  </View>
                  {onEditStream ? (
                    <TooltipButton
                      tooltip={`Edit ${s.name}`}
                      style={styles.iconAction}
                      onPress={() => onEditStream(s)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <FontAwesome name="pencil" size={12} color={colors.primary} />
                    </TooltipButton>
                  ) : null}
                  {onDeleteStream ? (
                    <TooltipButton
                      tooltip={`Delete ${s.name}`}
                      style={styles.iconAction}
                      onPress={() => onDeleteStream(s)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <FontAwesome name="trash" size={12} color={colors.error || '#ef4444'} />
                    </TooltipButton>
                  ) : null}
                </TouchableOpacity>

                {expanded ? (
                  items.length === 0 ? (
                    <Text
                      style={[
                        styles.meta,
                        {
                          color: colors.textSecondary,
                          paddingHorizontal: 8,
                          paddingBottom: 8,
                        },
                      ]}
                    >
                      No payments scheduled yet.
                    </Text>
                  ) : (
                    <View style={styles.streamPays}>
                      <View
                        style={[
                          styles.streamPayHeader,
                          { borderTopColor: colors.border, backgroundColor: colors.background },
                        ]}
                      >
                        <Text
                          style={[styles.streamPayColDate, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          Date
                        </Text>
                        <Text
                          style={[styles.streamPayColAmt, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          Est
                        </Text>
                        <Text
                          style={[styles.streamPayColAmt, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          Actual
                        </Text>
                        <Text
                          style={[styles.streamPayColStatus, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          Status
                        </Text>
                        <View style={styles.streamPayColActions} />
                      </View>
                      {items.map((o) => (
                        <View
                          key={o.id}
                          style={[styles.streamPayRow, { borderTopColor: colors.border }]}
                        >
                          <TouchableOpacity
                            style={styles.streamPayColDate}
                            onPress={() => editOcc(o)}
                            accessibilityLabel={`Edit payment on ${formatShortDate(o.due_date)}`}
                          >
                            <Text
                              style={[styles.streamPayDateText, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {formatShortDate(o.due_date)}
                            </Text>
                          </TouchableOpacity>
                          <Text
                            style={[styles.streamPayColAmt, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {displayMoney(o.estimated_amount)}
                          </Text>
                          <Text
                            style={[styles.streamPayColAmt, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {o.actual_amount != null ? displayMoney(o.actual_amount) : '—'}
                          </Text>
                          <View style={styles.streamPayColStatus}>
                            <View
                              style={[
                                styles.statusBadge,
                                {
                                  backgroundColor:
                                    o.status === 'received'
                                      ? '#10b98133'
                                      : o.status === 'skipped'
                                        ? '#94a3b833'
                                        : '#f59e0b33',
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '700',
                                  color:
                                    o.status === 'received'
                                      ? '#10b981'
                                      : o.status === 'skipped'
                                        ? '#64748b'
                                        : '#f59e0b',
                                }}
                                numberOfLines={1}
                              >
                                {o.status}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.streamPayColActions}>
                            {onEditOccurrence ? (
                              <TooltipButton
                                tooltip="Edit payment"
                                style={styles.iconAction}
                                onPress={() => editOcc(o)}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <FontAwesome name="pencil" size={11} color={colors.primary} />
                              </TooltipButton>
                            ) : null}
                            {onDeleteOccurrence ? (
                              <TooltipButton
                                tooltip="Delete payment"
                                style={styles.iconAction}
                                onPress={() => deleteOcc(o)}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <FontAwesome
                                  name="trash"
                                  size={11}
                                  color={colors.error || '#ef4444'}
                                />
                              </TooltipButton>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  )
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.flex}>
      <View
        style={[
          styles.boardTabBar,
          { borderBottomColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        {(
          [
            { id: 'overview' as const, label: 'Overview', icon: 'pie-chart' as const },
            { id: 'streams' as const, label: 'Streams', icon: 'list' as const },
          ] as const
        ).map((t) => {
          const selected = boardTab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.boardTab, selected && { borderBottomColor: colors.primary }]}
              onPress={() => setBoardTab(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <FontAwesome
                name={t.icon}
                size={13}
                color={selected ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.boardTabText,
                  { color: selected ? colors.primary : colors.textSecondary },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {error ? (
        <Text style={[styles.errorBanner, { color: colors.error || '#c0392b' }]}>{error}</Text>
      ) : null}

      {loading && dataFamilyId !== selectedFamily.id ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : boardTab === 'streams' ? (
        renderStreams()
      ) : (
        renderOverview()
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  boardTabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  boardTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  boardTabText: { fontSize: 13, fontWeight: '600' },
  yearNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: -4,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  yearLabel: { flex: 1, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  todayBtnText: { fontSize: 12, fontWeight: '700' },
  errorBanner: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 40, gap: 14 },
  wideRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  wideCol: {
    flex: 1,
    minWidth: 0,
    gap: 14,
  },
  emptyBlock: { gap: 12, paddingVertical: 16, alignItems: 'flex-start' },
  streamsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionHint: { fontSize: 12, fontWeight: '500', marginTop: -4 },
  heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heroCell: { flexGrow: 1, flexBasis: '28%', minWidth: 88, gap: 2 },
  heroCaption: { fontSize: 11, fontWeight: '600' },
  heroValue: { fontSize: 16, fontWeight: '800' },
  donutBlock: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    width: '100%',
  },
  donutLegend: { width: '100%', gap: 8 },
  donutLegendRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
  },
  legendSwatch: { width: 10, height: 10, borderRadius: 2, marginTop: 3 },
  donutLegendLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  donutLegendAmt: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingTop: 1,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryActionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthAmt: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  monthPays: { gap: 6, marginTop: 4 },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: 8,
    paddingRight: 6,
    overflow: 'hidden',
  },
  payBar: { width: 4, alignSelf: 'stretch' },
  payName: { fontSize: 13, fontWeight: '600' },
  meta: { fontSize: 11, fontWeight: '500' },
  iconAction: { padding: 6 },
  streamBlock: {
    paddingTop: 8,
    gap: 4,
  },
  streamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  colorBar: { width: 4, height: 28, borderRadius: 2 },
  streamTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streamName: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600' },
  streamAmt: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  streamPays: { marginTop: 4 },
  streamPayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 2,
    gap: 4,
  },
  streamPayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 2,
    gap: 4,
  },
  streamPayColDate: {
    flex: 1.15,
    minWidth: 0,
  },
  streamPayDateText: {
    fontSize: 12,
    fontWeight: '600',
  },
  streamPayColAmt: {
    flex: 0.95,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  streamPayColStatus: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streamPayColActions: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 52,
    justifyContent: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  empty: { fontSize: 13, paddingVertical: 12 },
});
