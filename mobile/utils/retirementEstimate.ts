/**
 * Alberta retirement estimate in 2026 dollars.
 * Personal amounts are not stored here. See Docs/retirement-estimate-rules.md.
 */

export type EarningsPeriod = {
  label: string;
  fromYear: number | null;
  toYear: number | null;
  annualIncome: number | null;
  note: string;
};

export type RetirementInputs = {
  birthYear: number | null;
  cppStartAge: number | null;
  oasStartAge: number | null;
  yearsInCanada: number | null;
  earnToCppStart: boolean;
  lappAnnual: number | null;
  otherTaxableAnnual: number | null;
  cppMonthlyOverride: number | null;
  periods: EarningsPeriod[];
};

export type PensionLine = {
  key: 'cpp' | 'oas' | 'lapp' | 'total';
  label: string;
  grossAnnual: number;
  grossMonthly: number;
  netAnnual: number;
  netMonthly: number;
};

export type PensionSnapshot = {
  age: number;
  title: string;
  lines: PensionLine[];
  clawbackAnnual: number;
  taxAnnual: number;
};

export type RetirementEstimateResult = {
  snapshots: PensionSnapshot[];
  notes: string[];
};

export const VALUATION_YEAR = 2026;
export const YMPE_2026 = 74600;
export const YAMPE_2026 = 85000;
export const OAS_MONTHLY_65 = 762.5;
export const OAS_MONTHLY_75 = 838.75;
export const OAS_CLAWBACK_THRESHOLD = 95323;
export const MPEA_2026 = (64900 + 66600 + 68500 + 71300 + 74600) / 5;

/** Published Year's Maximum Pensionable Earnings. Years after 2026 stay at the 2026 ceiling. */
const YMPE_BY_YEAR: Record<number, number> = {
  1980: 13100, 1981: 14700, 1982: 16500, 1983: 18500, 1984: 20800, 1985: 23400,
  1986: 25800, 1987: 25900, 1988: 26500, 1989: 27700, 1990: 28900, 1991: 30500,
  1992: 32200, 1993: 33400, 1994: 34400, 1995: 34900, 1996: 35400, 1997: 35800,
  1998: 36900, 1999: 37400, 2000: 37600, 2001: 38300, 2002: 39100, 2003: 39900,
  2004: 40500, 2005: 41100, 2006: 42100, 2007: 43700, 2008: 44900, 2009: 46300,
  2010: 47200, 2011: 48300, 2012: 50100, 2013: 51100, 2014: 52500, 2015: 53600,
  2016: 54900, 2017: 55300, 2018: 55900, 2019: 57400, 2020: 58700, 2021: 61600,
  2022: 64900, 2023: 66600, 2024: 68500, 2025: 71300, 2026: 74600,
};

const FEDERAL_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 58523, rate: 0.14 },
  { upTo: 117045, rate: 0.205 },
  { upTo: 181440, rate: 0.26 },
  { upTo: 258482, rate: 0.29 },
  { upTo: Infinity, rate: 0.33 },
];

const ALBERTA_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 61200, rate: 0.08 },
  { upTo: 154259, rate: 0.1 },
  { upTo: 185111, rate: 0.12 },
  { upTo: 246813, rate: 0.13 },
  { upTo: 370220, rate: 0.14 },
  { upTo: Infinity, rate: 0.15 },
];

export function blankInputs(): RetirementInputs {
  return {
    birthYear: null,
    cppStartAge: null,
    oasStartAge: null,
    yearsInCanada: null,
    earnToCppStart: true,
    lappAnnual: null,
    otherTaxableAnnual: 0,
    cppMonthlyOverride: null,
    periods: [],
  };
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeInputs(raw: Partial<RetirementInputs> | null | undefined): RetirementInputs {
  const base = blankInputs();
  if (!raw || typeof raw !== 'object') return base;
  const periods = Array.isArray(raw.periods)
    ? raw.periods.map((period) => ({
        label: typeof period?.label === 'string' ? period.label : '',
        fromYear: numberOrNull(period?.fromYear),
        toYear: numberOrNull(period?.toYear),
        annualIncome: numberOrNull(period?.annualIncome),
        note: typeof period?.note === 'string' ? period.note : '',
      }))
    : [];
  return {
    birthYear: numberOrNull(raw.birthYear),
    cppStartAge: numberOrNull(raw.cppStartAge),
    oasStartAge: numberOrNull(raw.oasStartAge),
    yearsInCanada: numberOrNull(raw.yearsInCanada),
    earnToCppStart: raw.earnToCppStart !== false,
    lappAnnual: numberOrNull(raw.lappAnnual),
    otherTaxableAnnual: numberOrNull(raw.otherTaxableAnnual) ?? 0,
    cppMonthlyOverride: numberOrNull(raw.cppMonthlyOverride),
    periods,
  };
}

function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function ympe(year: number): number {
  if (year >= VALUATION_YEAR) return YMPE_2026;
  if (YMPE_BY_YEAR[year] != null) return YMPE_BY_YEAR[year];
  if (year < 1980) return YMPE_BY_YEAR[1980];
  return YMPE_2026;
}

function yampe(year: number): number | null {
  if (year < 2024) return null;
  if (year === 2024) return 73200;
  if (year === 2025) return 81200;
  return YAMPE_2026;
}

/** Share of a full enhanced year earned that year. 2019–2022 are the phase-in. */
function firstAdditionalPhase(year: number): number {
  if (year < 2019) return 0;
  if (year === 2019) return 0.15;
  if (year === 2020) return 0.3;
  if (year === 2021) return 0.5;
  if (year === 2022) return 0.75;
  return 1;
}

function bracketTax(income: number, brackets: { upTo: number; rate: number }[]): number {
  let tax = 0;
  let prev = 0;
  for (const bracket of brackets) {
    if (income <= prev) break;
    const slice = Math.min(income, bracket.upTo) - prev;
    tax += slice * bracket.rate;
    prev = bracket.upTo;
  }
  return tax;
}

function federalBpa(netIncome: number): number {
  const max = 16452;
  const min = 14829;
  const start = 181440;
  const end = 258482;
  if (netIncome <= start) return max;
  if (netIncome >= end) return min;
  return max - (max - min) * ((netIncome - start) / (end - start));
}

function ageCreditBase(netIncome: number, maximum: number, threshold: number): number {
  const reduced = maximum - 0.15 * Math.max(0, netIncome - threshold);
  return Math.max(0, reduced);
}

type YearRow = {
  year: number;
  income: number | null;
  ratio: number;
  secondRatio: number;
  aboveCeiling: boolean;
};

function incomeForYear(
  year: number,
  inputs: RetirementInputs,
  lastContributoryYear: number
): { income: number | null; fromPeriod: boolean } {
  let found: number | null = null;
  let fromPeriod = false;
  for (const period of inputs.periods) {
    if (period.fromYear == null || period.toYear == null || period.annualIncome == null) continue;
    const start = Math.min(period.fromYear, period.toYear);
    const end = Math.max(period.fromYear, period.toYear);
    if (year >= start && year <= end) {
      found = period.annualIncome;
      fromPeriod = true;
    }
  }
  if (found != null) return { income: found, fromPeriod };
  if (
    inputs.earnToCppStart &&
    year >= VALUATION_YEAR &&
    year <= lastContributoryYear
  ) {
    return { income: ympe(year), fromPeriod: false };
  }
  return { income: null, fromPeriod: false };
}

function buildCpp(inputs: RetirementInputs, notes: string[]): {
  monthlyAt65: number;
  aboveCeilingYears: number;
  droppedZeroYears: number;
} | null {
  const birthYear = inputs.birthYear;
  const cppStartAge = inputs.cppStartAge;
  if (birthYear == null || cppStartAge == null) return null;
  if (cppStartAge < 60 || cppStartAge > 70) {
    notes.push('CPP start age must be from 60 to 70.');
    return null;
  }

  const firstYear = Math.max(birthYear + 18, 1966);
  const lastYear = birthYear + cppStartAge - 1;
  if (lastYear < firstYear) {
    notes.push('CPP start age is not after age 18, so CPP cannot be estimated.');
    return null;
  }

  let skippedPeriods = 0;
  for (const period of inputs.periods) {
    const incomplete =
      period.annualIncome != null &&
      (period.fromYear == null || period.toYear == null);
    if (incomplete) skippedPeriods += 1;
  }
  if (skippedPeriods > 0) {
    notes.push(
      skippedPeriods === 1
        ? 'One earnings period has an amount but no from and to years, so that period is not counted yet.'
        : `${skippedPeriods} earnings periods have an amount but no from and to years, so those periods are not counted yet.`
    );
  }

  const rows: YearRow[] = [];
  let aboveCeilingYears = 0;
  for (let year = firstYear; year <= lastYear; year += 1) {
    const ceiling = ympe(year);
    const second = yampe(year);
    const { income } = incomeForYear(year, inputs, lastYear);
    const earned = income ?? 0;
    if (income != null && income > ceiling) aboveCeilingYears += 1;
    const ratio = ceiling > 0 ? Math.min(earned, ceiling) / ceiling : 0;
    let secondRatio = 0;
    if (second != null && second > ceiling) {
      const band = Math.min(Math.max(earned - ceiling, 0), second - ceiling);
      secondRatio = band / (second - ceiling);
    }
    rows.push({ year, income, ratio, secondRatio, aboveCeiling: income != null && income > ceiling });
  }

  const dropCount = Math.floor(rows.length * 0.17);
  const ranked = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.ratio - b.row.ratio || a.row.year - b.row.year);
  const dropped = new Set(ranked.slice(0, dropCount).map((item) => item.index));
  let droppedZeroYears = 0;
  dropped.forEach((index) => {
    if (rows[index].ratio === 0) droppedZeroYears += 1;
  });

  const kept = rows.filter((_, index) => !dropped.has(index));
  const ratio =
    kept.length === 0 ? 0 : kept.reduce((sum, row) => sum + row.ratio, 0) / kept.length;
  const monthlyBase = ratio * 0.25 * MPEA_2026 / 12;

  let annualFirst = 0;
  let annualSecond = 0;
  kept.forEach((row) => {
    const phase = firstAdditionalPhase(row.year);
    if (phase > 0) {
      annualFirst += phase * (1 / 480) * row.ratio * MPEA_2026;
    }
    if (row.year >= 2024) {
      annualSecond += row.secondRatio * 0.002 * (YAMPE_2026 - YMPE_2026);
    }
  });

  return {
    monthlyAt65: monthlyBase + annualFirst / 12 + annualSecond / 12,
    aboveCeilingYears,
    droppedZeroYears,
  };
}

function cppMonthlyFromAge65(monthlyAt65: number, cppStartAge: number): number {
  const months = (cppStartAge - 65) * 12;
  if (months < 0) return monthlyAt65 * (1 + 0.006 * months);
  return monthlyAt65 * (1 + 0.007 * months);
}

function oasMonthly(inputs: RetirementInputs, age: number, notes: string[]): number | null {
  if (inputs.yearsInCanada == null || inputs.oasStartAge == null) return null;
  if (inputs.oasStartAge < 65 || inputs.oasStartAge > 70) {
    notes.push('OAS start age must be from 65 to 70.');
    return null;
  }
  const years = Math.max(0, Math.min(40, inputs.yearsInCanada));
  const at65 = OAS_MONTHLY_65 * (years / 40);
  const deferMonths = (inputs.oasStartAge - 65) * 12;
  const atStart = at65 * (1 + 0.006 * deferMonths);
  return age >= 75 ? atStart * 1.1 : atStart;
}

function incomeTax(netIncome: number, lappAnnual: number): number {
  const federal = bracketTax(netIncome, FEDERAL_BRACKETS);
  const alberta = bracketTax(netIncome, ALBERTA_BRACKETS);
  const federalCredits =
    federalBpa(netIncome) * 0.14 +
    ageCreditBase(netIncome, 9208, 46432) * 0.14 +
    Math.min(2000, Math.max(0, lappAnnual)) * 0.14;
  const albertaCredits =
    22769 * 0.08 +
    ageCreditBase(netIncome, 6345, 47234) * 0.08 +
    Math.min(1753, Math.max(0, lappAnnual)) * 0.08;
  return Math.max(0, federal - federalCredits) + Math.max(0, alberta - albertaCredits);
}

function snapshotAt(args: {
  age: number;
  title: string;
  cppMonthly: number;
  oasMonthlyAmount: number;
  lappAnnual: number;
  otherAnnual: number;
}): PensionSnapshot {
  const cppAnnual = money(args.cppMonthly * 12);
  const oasAnnual = money(args.oasMonthlyAmount * 12);
  const lappAnnual = money(args.lappAnnual);
  const beforeClawback = cppAnnual + oasAnnual + lappAnnual + args.otherAnnual;
  const clawbackAnnual = money(
    Math.min(oasAnnual, Math.max(0, beforeClawback - OAS_CLAWBACK_THRESHOLD) * 0.15)
  );
  const netIncome = beforeClawback - clawbackAnnual;
  const taxAnnual = money(incomeTax(netIncome, lappAnnual));
  const pensionGross = cppAnnual + oasAnnual + lappAnnual;
  const share = (gross: number) => (pensionGross > 0 ? taxAnnual * (gross / pensionGross) : 0);
  const line = (
    key: PensionLine['key'],
    label: string,
    grossAnnual: number,
    extraDeduction: number
  ): PensionLine => {
    const netAnnual = money(grossAnnual - extraDeduction - share(grossAnnual));
    return {
      key,
      label,
      grossAnnual: money(grossAnnual),
      grossMonthly: money(grossAnnual / 12),
      netAnnual,
      netMonthly: money(netAnnual / 12),
    };
  };
  const cpp = line('cpp', 'CPP', cppAnnual, 0);
  const oas = line('oas', 'OAS', oasAnnual, clawbackAnnual);
  const lapp = line('lapp', 'LAPP', lappAnnual, 0);
  const totalNet = money(cpp.netAnnual + oas.netAnnual + lapp.netAnnual);
  const total: PensionLine = {
    key: 'total',
    label: 'Total',
    grossAnnual: money(pensionGross),
    grossMonthly: money(pensionGross / 12),
    netAnnual: totalNet,
    netMonthly: money(totalNet / 12),
  };
  return {
    age: args.age,
    title: args.title,
    lines: [cpp, oas, lapp, total],
    clawbackAnnual,
    taxAnnual,
  };
}

export function calculateRetirement(raw: RetirementInputs): RetirementEstimateResult {
  const inputs = normalizeInputs(raw);
  const notes: string[] = [
    'Amounts are an estimate in 2026 dollars, not a Service Canada or Canada Revenue Agency figure.',
    'After CPP and OAS start, they rise with inflation even though you no longer pay into them. CPP rises once each January. From 2022 through 2026 those raises were 2.7%, 6.5%, 4.4%, 2.6%, and 2.0%, about 19.5% altogether. OAS rises in January, April, July, and October, and does not fall if prices fall. The maximum for ages 65 to 74 rose from $615.37 in January 2021 to $742.31 in January 2026, about 21%. Later years will keep rising with prices. This page does not forecast those raises. The only later change shown is the extra 10% OAS increase at age 75.',
  ];
  const cppBuilt = buildCpp(inputs, notes);
  if (cppBuilt) {
    if (cppBuilt.aboveCeilingYears > 0) {
      notes.push(
        `Earnings above that year's CPP ceiling were ignored in ${cppBuilt.aboveCeilingYears} year${cppBuilt.aboveCeilingYears === 1 ? '' : 's'}. The 2026 ceiling is $74,600.`
      );
    }
    notes.push(
      `${cppBuilt.droppedZeroYears} of the lowest years dropped from CPP were years with no earnings.`
    );
  } else if (inputs.birthYear == null || inputs.cppStartAge == null) {
    notes.push('CPP needs a birth year and a start age.');
  }

  const override = inputs.cppMonthlyOverride;
  let cppMonthly: number | null = null;
  if (override != null && override > 0) {
    cppMonthly = override;
    notes.push('CPP uses the monthly Service Canada amount you entered, instead of the earnings estimate.');
  } else if (cppBuilt && inputs.cppStartAge != null) {
    cppMonthly = cppMonthlyFromAge65(cppBuilt.monthlyAt65, inputs.cppStartAge);
  }

  if (inputs.oasStartAge == null || inputs.yearsInCanada == null) {
    notes.push('OAS needs years lived in Canada after age 18 and a start age. Earnings do not set the OAS pension.');
  } else if (inputs.yearsInCanada > 40) {
    notes.push('Years in Canada after age 18 are capped at 40 for a full OAS pension.');
  }

  if (inputs.lappAnnual == null) {
    notes.push('LAPP is blank, so this estimate uses $0 until you enter the annual gross lifetime pension.');
  }

  const lappAnnual = inputs.lappAnnual ?? 0;
  const otherAnnual = inputs.otherTaxableAnnual ?? 0;
  if (cppMonthly == null || inputs.cppStartAge == null || inputs.oasStartAge == null) {
    return { snapshots: [], notes };
  }

  const oasCheck = oasMonthly(inputs, Math.max(inputs.cppStartAge, inputs.oasStartAge), notes);
  if (oasCheck == null) return { snapshots: [], notes };

  const firstAge = Math.max(inputs.cppStartAge, inputs.oasStartAge);
  const firstOas = oasMonthly(inputs, firstAge, notes);
  if (firstOas == null) return { snapshots: [], notes };

  const snapshots: PensionSnapshot[] = [
    snapshotAt({
      age: firstAge,
      title: `At age ${firstAge}, the first year CPP and OAS are both in pay`,
      cppMonthly,
      oasMonthlyAmount: firstOas,
      lappAnnual,
      otherAnnual,
    }),
  ];

  if (firstAge < 75) {
    const laterOas = oasMonthly(inputs, 75, notes);
    if (laterOas != null) {
      snapshots.push(
        snapshotAt({
          age: 75,
          title: 'From age 75, OAS includes the 10% increase',
          cppMonthly,
          oasMonthlyAmount: laterOas,
          lappAnnual,
          otherAnnual,
        })
      );
    }
  }

  notes.push('Guaranteed Income Supplement is not included.');
  return { snapshots, notes };
}
