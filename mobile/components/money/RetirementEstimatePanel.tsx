import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
import AlertModal from '../AlertModal';
import moneyService from '../../services/moneyService';
import { RetirementEstimateRecord } from '../../types/money';
import { RETIREMENT_ESTIMATE_RULES } from '../../content/retirementEstimateRules';
import { onMoneyChange, formatMoneyDisplay } from '../../utils/moneyInput';
import {
  EarningsPeriod,
  RetirementInputs,
  VALUATION_YEAR,
  blankInputs,
  calculateRetirement,
  normalizeInputs,
} from '../../utils/retirementEstimate';

type PeriodForm = {
  label: string;
  fromYear: string;
  toYear: string;
  annualIncome: string;
  note: string;
};

type FormState = {
  name: string;
  birthYear: string;
  cppStartAge: string;
  oasStartAge: string;
  yearsInCanada: string;
  earnToCppStart: boolean;
  lappAnnual: string;
  otherTaxableAnnual: string;
  cppMonthlyOverride: string;
  periods: PeriodForm[];
};

function textNum(value: number | null | undefined): string {
  return value == null ? '' : String(value);
}

function textMoney(value: number | null | undefined): string {
  if (value == null) return '';
  return formatMoneyDisplay(value);
}

function yearNum(value: string): number | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  const n = Number(digits.slice(0, 4));
  return n >= 1900 && n <= 2200 ? n : null;
}

function parseNum(value: string): number | null {
  const trimmed = value.trim().replace(/[$,]/g, '');
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function sortPeriods(periods: PeriodForm[]): PeriodForm[] {
  return [...periods].sort((a, b) => {
    const ay = parseNum(a.fromYear);
    const by = parseNum(b.fromYear);
    if (ay == null && by == null) return 0;
    if (ay == null) return 1;
    if (by == null) return -1;
    return ay - by;
  });
}

function toForm(name: string, inputs: RetirementInputs): FormState {
  return {
    name,
    birthYear: textNum(inputs.birthYear),
    cppStartAge: textNum(inputs.cppStartAge),
    oasStartAge: textNum(inputs.oasStartAge),
    yearsInCanada: textNum(inputs.yearsInCanada),
    earnToCppStart: inputs.earnToCppStart,
    lappAnnual: textMoney(inputs.lappAnnual),
    otherTaxableAnnual: textMoney(inputs.otherTaxableAnnual),
    cppMonthlyOverride: textMoney(inputs.cppMonthlyOverride),
    periods: sortPeriods(
      inputs.periods.map((period) => ({
        label: period.label || '',
        fromYear: textNum(period.fromYear),
        toYear: textNum(period.toYear),
        annualIncome: textMoney(period.annualIncome),
        note: period.note || '',
      }))
    ),
  };
}

function periodAfter(periods: PeriodForm[]): { period: PeriodForm; error: string } {
  for (let index = periods.length - 1; index >= 0; index -= 1) {
    const toYear = yearNum(periods[index].toYear);
    if (toYear == null) continue;
    return {
      period: { ...emptyPeriod(), fromYear: String(toYear + 1) },
      error: '',
    };
  }
  return {
    period: emptyPeriod(),
    error: 'Enter a 4-digit End year on the earnings period above. The next period starts the year after that.',
  };
}

function formatYearRanges(years: number[]): string {
  if (years.length === 0) return '';
  const parts: string[] = [];
  let start = years[0];
  let prev = years[0];
  for (let i = 1; i <= years.length; i += 1) {
    const year = years[i];
    if (year === prev + 1) {
      prev = year;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
    start = year;
    prev = year;
  }
  return parts.join(', ');
}

function coverageError(form: FormState): string {
  const birth = parseNum(form.birthYear);
  const cppAge = parseNum(form.cppStartAge);
  if (birth == null || cppAge == null) {
    return 'Enter a birth year and a CPP start age before saving.';
  }
  if (cppAge < 60 || cppAge > 70) {
    return 'CPP start age must be from 60 to 70.';
  }
  const first = Math.max(birth + 18, 1966);
  const last = birth + cppAge - 1;
  if (last < first) return 'CPP start age is not after age 18.';
  const covered = new Set<number>();
  form.periods.forEach((period) => {
    const from = yearNum(period.fromYear);
    const to = yearNum(period.toYear);
    if (from == null || to == null) return;
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    for (let year = start; year <= end; year += 1) covered.add(year);
  });
  if (form.earnToCppStart) {
    for (let year = Math.max(first, VALUATION_YEAR); year <= last; year += 1) covered.add(year);
  }
  const missing: number[] = [];
  for (let year = first; year <= last; year += 1) {
    if (!covered.has(year)) missing.push(year);
  }
  if (missing.length === 0) return '';
  return `Earnings periods must cover every year from age 18 through the year before CPP starts (${first}–${last}). Missing ${formatYearRanges(missing)}.`;
}

function toInputs(form: FormState): RetirementInputs {
  return normalizeInputs({
    birthYear: parseNum(form.birthYear),
    cppStartAge: parseNum(form.cppStartAge),
    oasStartAge: parseNum(form.oasStartAge),
    yearsInCanada: parseNum(form.yearsInCanada),
    earnToCppStart: form.earnToCppStart,
    lappAnnual: parseNum(form.lappAnnual),
    otherTaxableAnnual: parseNum(form.otherTaxableAnnual),
    cppMonthlyOverride: parseNum(form.cppMonthlyOverride),
    periods: form.periods.map(
      (period): EarningsPeriod => ({
        label: period.label.trim(),
        fromYear: parseNum(period.fromYear),
        toYear: parseNum(period.toYear),
        annualIncome: parseNum(period.annualIncome),
        note: period.note.trim(),
      })
    ),
  });
}

function emptyPeriod(): PeriodForm {
  return { label: '', fromYear: '', toYear: '', annualIncome: '', note: '' };
}

export default function RetirementEstimatePanel() {
  const { colors } = useTheme();
  const { displayMoney } = useShowAmounts();
  const { width: windowWidth } = useWindowDimensions();
  const phone = windowWidth < 520;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [records, setRecords] = useState<RetirementEstimateRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [savedForm, setSavedForm] = useState<FormState>(() => toForm('New estimate', blankInputs()));
  const [form, setForm] = useState<FormState>(() => toForm('New estimate', blankInputs()));
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const periodListRef = useRef<ScrollView>(null);

  const applyRecord = useCallback((record: RetirementEstimateRecord | null) => {
    if (!record) {
      const next = toForm('New estimate', blankInputs());
      next.periods = [emptyPeriod()];
      setSelectedId(null);
      setSavedForm(next);
      setForm(next);
      return;
    }
    const next = toForm(record.name, normalizeInputs(record.inputs));
    setSelectedId(record.id);
    setSavedForm(next);
    setForm(next);
  }, []);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const rows = await moneyService.getRetirementEstimates();
      setRecords(rows);
      setSelectedId((current) =>
        current != null && rows.some((row) => row.id === current) ? current : null
      );
    } catch (err: any) {
      setError(err?.message || 'Could not load estimates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const result = useMemo(() => calculateRetirement(toInputs(form)), [form]);

  const updatePeriod = (index: number, patch: Partial<PeriodForm>) => {
    setForm((current) => ({
      ...current,
      periods: current.periods.map((period, i) => (i === index ? { ...period, ...patch } : period)),
    }));
  };

  const save = async (asNew: boolean) => {
    const name = form.name.trim();
    if (!name) {
      setError('Enter a name before saving.');
      return;
    }
    const coverage = coverageError(form);
    if (coverage) {
      setError(coverage);
      setStatus('');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const inputs = toInputs(form);
      const saved =
        !asNew && selectedId != null
          ? await moneyService.updateRetirementEstimate(selectedId, name, inputs)
          : await moneyService.createRetirementEstimate(name, inputs);
      const rows = await moneyService.getRetirementEstimates();
      setRecords(rows);
      applyRecord(rows.find((row) => row.id === saved.id) || saved);
      setEditing(false);
      setDetailOpen(true);
      setStatus('Saved.');
    } catch (err: any) {
      setError(err?.message || 'Could not save this estimate');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const id = pendingDeleteId;
    if (id == null) return;
    setPendingDeleteId(null);
    setSaving(true);
    setError('');
    try {
      await moneyService.deleteRetirementEstimate(id);
      const rows = await moneyService.getRetirementEstimates();
      setRecords(rows);
      const next = rows.find((row) => row.id !== id) || rows[0] || null;
      applyRecord(next);
      setEditing(false);
      setStatus('');
    } catch (err: any) {
      setError(err?.message || 'Could not delete this estimate');
    } finally {
      setSaving(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setEditing(false);
    setStatus('');
    setError('');
  };

  const card = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.card, card, styles.tableCard]}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Estimates</Text>
          <TouchableOpacity
            onPress={() => {
              applyRecord(null);
              setEditing(true);
              setDetailOpen(true);
              setStatus('');
              setError('');
            }}
            style={[styles.smallBtn, { borderColor: colors.border }]}
          >
            <FontAwesome name="plus" size={12} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '600' }}>New</Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : records.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>No saved estimates yet.</Text>
        ) : (
          records.map((record) => {
            const selected = record.id === selectedId;
            return (
              <View
                key={record.id}
                style={[
                  styles.estimateRow,
                  { borderTopColor: colors.border },
                  selected && { backgroundColor: colors.primary + '22' },
                ]}
              >
                <TouchableOpacity
                  style={styles.estimateName}
                  onPress={() => {
                    if (record.id === selectedId && detailOpen) {
                      closeDetail();
                      return;
                    }
                    applyRecord(record);
                    setEditing(false);
                    setDetailOpen(true);
                    setStatus('');
                    setError('');
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: selected ? '700' : '500' }} numberOfLines={1}>
                    {record.name}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.estimateAction}
                  accessibilityLabel={`Edit ${record.name}`}
                  onPress={() => {
                    applyRecord(record);
                    setEditing(true);
                    setDetailOpen(true);
                    setStatus('');
                    setError('');
                  }}
                >
                  <FontAwesome name="pencil" size={14} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.estimateAction}
                  accessibilityLabel={`Delete ${record.name}`}
                  onPress={() => setPendingDeleteId(record.id)}
                >
                  <FontAwesome name="trash" size={14} color={colors.error || '#c0392b'} />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>

      {error && !editing ? <Text style={[styles.error, { color: colors.error || '#c0392b' }]}>{error}</Text> : null}
      {status ? <Text style={[styles.hint, { color: colors.primary }]}>{status}</Text> : null}

      {detailOpen ? (
      <>
        {!editing ? (
        <View style={[styles.card, card, styles.tightCard]}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{form.name || 'Estimate'}</Text>
            <TouchableOpacity onPress={closeDetail} accessibilityLabel="Close estimate">
              <FontAwesome name="times" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.factGrid}>
            <Fact label="Birth year" value={form.birthYear || '—'} colors={colors} />
            <Fact label="CPP start" value={form.cppStartAge || '—'} colors={colors} />
            <Fact label="OAS start" value={form.oasStartAge || '—'} colors={colors} />
            <Fact label="Years in Canada" value={form.yearsInCanada || '—'} colors={colors} />
            <Fact label="LAPP / yr" value={form.lappAnnual ? displayMoney(parseNum(form.lappAnnual)) : '—'} colors={colors} />
            <Fact label="Other income" value={form.otherTaxableAnnual ? displayMoney(parseNum(form.otherTaxableAnnual)) : '—'} colors={colors} />
            <Fact label="CPP override / mo" value={form.cppMonthlyOverride ? displayMoney(parseNum(form.cppMonthlyOverride)) : '—'} colors={colors} />
            <Fact label="Ceiling until CPP" value={form.earnToCppStart ? 'Yes' : 'No'} colors={colors} />
          </View>
          <Accordion key={selectedId ?? 'view'} title="Earnings periods" colors={colors}>
            <View style={[styles.periodLine, styles.periodHead, { borderBottomColor: colors.primary, backgroundColor: colors.primary + '18' }]}>
              <Text style={[styles.periodHeadText, { color: colors.primary }]}>Start</Text>
              <Text style={[styles.periodHeadText, { color: colors.primary }]}>End</Text>
              <Text style={[styles.periodHeadIncome, { color: colors.primary }]}>Income</Text>
            </View>
            <ScrollView style={styles.periodScroll} nestedScrollEnabled>
              {form.periods.map((period, index) => (
                <View
                  key={`view-period-${index}`}
                  style={[
                    styles.periodLine,
                    styles.periodViewRow,
                    { borderTopColor: colors.border },
                    index % 2 === 1 && { backgroundColor: colors.primary + '0c' },
                  ]}
                >
                  <Text style={[styles.periodYear, { color: colors.text }]}>{period.fromYear || '—'}</Text>
                  <Text style={[styles.periodYear, { color: colors.text }]}>{period.toYear || '—'}</Text>
                  <Text style={[styles.periodIncome, { color: colors.primary, fontWeight: '600' }]}>
                    {period.annualIncome ? displayMoney(parseNum(period.annualIncome)) : '—'}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Accordion>
        </View>
        ) : null}

        {editing ? (
        <View style={[styles.card, card, styles.tightCard]}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Edit estimate</Text>
            <TouchableOpacity onPress={closeDetail} accessibilityLabel="Close estimate">
              <FontAwesome name="times" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Field label="Name" value={form.name} onChangeText={(name) => setForm((current) => ({ ...current, name }))} colors={colors} />
          <View style={styles.trio}>
            <Field inRow label="Birth year" value={form.birthYear} onChangeText={(birthYear) => setForm((c) => ({ ...c, birthYear }))} colors={colors} keyboard="numeric" />
            <Field inRow label="CPP start" value={form.cppStartAge} onChangeText={(cppStartAge) => setForm((c) => ({ ...c, cppStartAge }))} colors={colors} keyboard="numeric" />
            <Field inRow label="OAS start" value={form.oasStartAge} onChangeText={(oasStartAge) => setForm((c) => ({ ...c, oasStartAge }))} colors={colors} keyboard="numeric" />
          </View>
          <View style={styles.trio}>
            <Field inRow label="Years in Canada" value={form.yearsInCanada} onChangeText={(yearsInCanada) => setForm((c) => ({ ...c, yearsInCanada }))} colors={colors} keyboard="numeric" />
            <Field inRow money label="LAPP / yr" value={form.lappAnnual} onChangeText={(lappAnnual) => setForm((c) => ({ ...c, lappAnnual }))} colors={colors} />
            <Field inRow money label="Other income" value={form.otherTaxableAnnual} onChangeText={(otherTaxableAnnual) => setForm((c) => ({ ...c, otherTaxableAnnual }))} colors={colors} />
          </View>
          <View style={styles.trio}>
            <Field inRow money label="CPP override / mo" value={form.cppMonthlyOverride} onChangeText={(cppMonthlyOverride) => setForm((c) => ({ ...c, cppMonthlyOverride }))} colors={colors} />
            <View style={[styles.switchRow, styles.fieldInRow]}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Ceiling until CPP starts</Text>
              <Switch
                value={form.earnToCppStart}
                onValueChange={(earnToCppStart) => setForm((current) => ({ ...current, earnToCppStart }))}
              />
            </View>
          </View>
          <View style={[styles.periodCard, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Earnings periods</Text>
          <View style={[styles.periodLine, styles.periodHead, { borderBottomColor: colors.primary, backgroundColor: colors.primary + '18' }]}>
            <Text style={[styles.periodHeadText, { color: colors.primary }]}>Start</Text>
            <Text style={[styles.periodHeadText, { color: colors.primary }]}>End</Text>
            <Text style={[styles.periodHeadIncome, { color: colors.primary }]}>Income</Text>
            <View style={styles.trashBtn} />
          </View>
          <ScrollView
            ref={periodListRef}
            style={styles.periodScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
          {form.periods.map((period, index) => (
            <View key={`period-${index}`}>
              <View style={styles.periodLine}>
                <TextInput
                  value={period.fromYear}
                  onChangeText={(fromYear) => updatePeriod(index, { fromYear })}
                  keyboardType="numeric"
                  style={[styles.yearInput, { color: colors.text, borderColor: colors.border }]}
                />
                <TextInput
                  value={period.toYear}
                  onChangeText={(toYear) => updatePeriod(index, { toYear })}
                  keyboardType="numeric"
                  style={[styles.yearInput, { color: colors.text, borderColor: colors.border }]}
                />
                <TextInput
                  value={period.annualIncome}
                  onChangeText={(annualIncome) => updatePeriod(index, { annualIncome: onMoneyChange(annualIncome) })}
                  keyboardType="numeric"
                  placeholder="$0.00"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.incomeInput, { color: colors.text, borderColor: colors.border }]}
                />
                <TouchableOpacity
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      periods: current.periods.filter((_, i) => i !== index),
                    }))
                  }
                  accessibilityLabel="Remove period"
                  style={styles.trashBtn}
                >
                  <FontAwesome name="trash" size={14} color={colors.error || '#c0392b'} />
                </TouchableOpacity>
              </View>
              <TextInput
                value={period.note}
                onChangeText={(note) => updatePeriod(index, { note })}
                placeholder="Note"
                placeholderTextColor={colors.textSecondary}
                style={[styles.noteInput, { color: colors.text, borderColor: colors.border }]}
              />
            </View>
          ))}
          </ScrollView>
          <TouchableOpacity
            onPress={() => {
              const next = periodAfter(form.periods);
              if (next.error) {
                setError(next.error);
                return;
              }
              setError('');
              setForm((current) => ({ ...current, periods: [...current.periods, next.period] }));
              setTimeout(() => periodListRef.current?.scrollToEnd({ animated: true }), 50);
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Add period</Text>
          </TouchableOpacity>
          </View>
          {error ? <Text style={[styles.error, { color: colors.error || '#c0392b' }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <Action label="Save" disabled={saving} onPress={() => void save(false)} colors={colors} primary />
            <Action label="Save as new" disabled={saving} onPress={() => void save(true)} colors={colors} />
            <Action
              label="Discard"
              disabled={saving}
              onPress={() => {
                if (selectedId == null) {
                  const first = records[0];
                  applyRecord(first || null);
                } else {
                  setForm(savedForm);
                }
                setEditing(false);
                setStatus('');
              }}
              colors={colors}
            />
          </View>
        </View>
      ) : null}

      {(selectedId != null || editing) && result.snapshots.length === 0 ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {editing
            ? 'Enter a birth year, CPP and OAS start ages, and years in Canada to see gross and net amounts.'
            : 'This estimate is missing a birth year, start age, or years in Canada.'}
        </Text>
      ) : null}
      {(selectedId != null || editing) &&
        result.snapshots.map((snapshot) => (
          <View key={snapshot.title} style={[styles.card, card, styles.tightCard]}>
            <Text style={[styles.sectionTitle, phone ? styles.sectionTitlePhone : null, { color: colors.text }]}>
              {snapshot.title}
            </Text>
            <View style={[styles.tableHead, { backgroundColor: colors.primary + '12' }]}>
              <Text style={[styles.cellLabel, { color: colors.textSecondary }]}> </Text>
              <Text style={[styles.cell, { color: colors.textSecondary }]}>Gross/mo</Text>
              <Text style={[styles.cell, { color: colors.textSecondary }]}>Gross/yr</Text>
              <Text style={[styles.cell, { color: colors.success }]}>Net/mo</Text>
              <Text style={[styles.cell, { color: colors.success }]}>Net/yr</Text>
            </View>
            {snapshot.lines.map((line) => {
              const labelColor =
                line.key === 'cpp' ? colors.primary
                : line.key === 'oas' ? colors.success
                : line.key === 'lapp' ? colors.warning
                : colors.text;
              return (
              <View
                key={line.key}
                style={[
                  styles.tableRow,
                  { borderTopColor: colors.border },
                  line.key === 'total' && { backgroundColor: colors.primary + '16' },
                ]}
              >
                <Text style={[styles.cellLabel, { color: labelColor, fontWeight: line.key === 'total' ? '700' : '600' }]}>
                  {line.label}
                </Text>
                <Text style={[styles.cell, { color: colors.text }]}>{displayMoney(line.grossMonthly)}</Text>
                <Text style={[styles.cell, { color: colors.text }]}>{displayMoney(line.grossAnnual)}</Text>
                <Text style={[styles.cell, { color: colors.success, fontWeight: '600' }]}>{displayMoney(line.netMonthly)}</Text>
                <Text style={[styles.cell, { color: colors.success, fontWeight: '600' }]}>{displayMoney(line.netAnnual)}</Text>
              </View>
              );
            })}
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              OAS recovery tax {displayMoney(snapshot.clawbackAnnual)} a year. Income tax {displayMoney(snapshot.taxAnnual)} a year.
            </Text>
            {snapshot.age < 75 ? (
              <Text style={[styles.hint, { color: colors.textSecondary }]} numberOfLines={1}>
                Increases, 5-yr avg: CPP 3.6%/yr, OAS 3.8%/yr, in 2026 dollars.
              </Text>
            ) : null}
          </View>
        ))}

      </>
      ) : null}

      <Accordion title="Notes" colors={colors}>
        {result.notes.map((note) => (
          <Text key={note} style={[styles.note, { color: colors.textSecondary }]}>
            {note}
          </Text>
        ))}
      </Accordion>

      <Accordion title="How this works" colors={colors}>
        {RETIREMENT_ESTIMATE_RULES.map((section) => (
          <View key={section.heading} style={styles.ruleBlock}>
            <Text style={[styles.ruleHeading, { color: colors.text }]}>{section.heading}</Text>
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={[styles.note, { color: colors.textSecondary }]}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </Accordion>

      <AlertModal
        visible={pendingDeleteId != null}
        type="warning"
        title="Delete estimate"
        message="This removes the saved estimate from your account. Income streams are not changed."
        showCancel
        confirmText="Delete"
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => void remove()}
      />
    </ScrollView>
  );
}

function Fact({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: { text: string; textSecondary: string };
}) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Accordion({
  title,
  colors,
  children,
  open: openProp,
  onToggle,
}: {
  title: string;
  colors: { text: string; textSecondary: string; border: string; surface: string };
  children: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        onPress={() => {
          if (onToggle) onToggle();
          else setInnerOpen((current) => !current);
        }}
        style={styles.sectionHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        <FontAwesome name={open ? 'chevron-down' : 'chevron-right'} size={12} color={colors.textSecondary} />
      </TouchableOpacity>
      {open ? children : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  colors,
  keyboard = 'default',
  inRow,
  money,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: { text: string; textSecondary: string; border: string; surface: string };
  keyboard?: 'default' | 'numeric' | 'decimal-pad';
  inRow?: boolean;
  money?: boolean;
}) {
  return (
    <View style={inRow ? styles.fieldInRow : styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(text) => onChangeText(money ? onMoneyChange(text) : text)}
        keyboardType={money ? 'decimal-pad' : keyboard}
        placeholder={money ? '$0.00' : undefined}
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
        ]}
      />
    </View>
  );
}

function Action({
  label,
  onPress,
  disabled,
  colors,
  primary,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  colors: { primary: string; text: string; border: string; error?: string };
  primary?: boolean;
  danger?: boolean;
}) {
  const backgroundColor = primary ? colors.primary : 'transparent';
  const color = primary ? '#fff' : danger ? colors.error || '#c0392b' : colors.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.action, { backgroundColor, borderColor: primary ? colors.primary : colors.border, opacity: disabled ? 0.6 : 1 }]}
    >
      <Text style={{ color, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { padding: 10, gap: 8, paddingBottom: 28 },
  loader: { marginVertical: 8 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, gap: 8 },
  tightCard: { gap: 6, paddingVertical: 8 },
  tableCard: { gap: 0, paddingBottom: 4 },
  trio: { flexDirection: 'row', gap: 8 },
  field: { gap: 2 },
  fieldInRow: { flex: 1, minWidth: 0, gap: 2 },
  fieldLabel: { fontSize: 11 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2, paddingBottom: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionTitlePhone: { fontSize: 14 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  hint: { fontSize: 12, lineHeight: 16 },
  estimateHead: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 4 },
  estimateRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, minHeight: 36 },
  estimateName: { flex: 1, paddingVertical: 6, paddingRight: 8 },
  estimateAction: { width: 44, alignItems: 'center', justifyContent: 'center' },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { width: '47%', gap: 1 },
  periodHeadText: { width: 72, fontSize: 11, fontWeight: '700' },
  periodHeadIncome: { flex: 1, fontSize: 11, fontWeight: '700' },
  periodHead: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4, paddingVertical: 4, marginBottom: 2, borderRadius: 4 },
  periodViewRow: { borderTopWidth: StyleSheet.hairlineWidth, minHeight: 28 },
  periodYear: { width: 72, fontSize: 14 },
  periodIncome: { flex: 1, fontSize: 14 },
  periodLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  periodScroll: { maxHeight: 220 },
  periodCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8, gap: 4 },
  yearInput: {
    width: 72,
    minWidth: 72,
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 14,
  },
  incomeInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 14,
  },
  noteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  trashBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  tableHead: { flexDirection: 'row', gap: 4, paddingHorizontal: 4, paddingVertical: 4, borderRadius: 4 },
  tableRow: { flexDirection: 'row', gap: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4, paddingHorizontal: 4, paddingBottom: 2 },
  cellLabel: { width: 44, fontSize: 12 },
  cell: { flex: 1, fontSize: 11 },
  note: { fontSize: 13, lineHeight: 18 },
  ruleBlock: { gap: 6 },
  ruleHeading: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  error: { fontSize: 13 },
});
