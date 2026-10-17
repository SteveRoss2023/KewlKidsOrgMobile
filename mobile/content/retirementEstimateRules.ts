/** Shown on the Estimate page and copied in Docs/retirement-estimate-rules.md. No personal amounts. */

export type RuleSection = {
  heading: string;
  paragraphs: string[];
};

export const RETIREMENT_ESTIMATE_RULES: RuleSection[] = [
  {
    heading: 'What this page does',
    paragraphs: [
      'This is a calculator for Canada Pension Plan (CPP), Old Age Security (OAS), and a Local Authorities Pension Plan (LAPP) lifetime pension for a single person living in Alberta. It shows gross and net amounts monthly and yearly.',
      'It does not change income streams, pay amounts, accounts, expenses, or any other screen. Nothing on this page is copied into Streams.',
      'Results are in 2026 dollars. Later years use the 2026 ceilings, benefit rates, and tax brackets. Inflation is not forecast.',
      'After CPP and OAS start, they rise with inflation. CPP rises once each January. From 2022 through 2026 those raises were 2.7%, 6.5%, 4.4%, 2.6%, and 2.0%, about 19.5% altogether. OAS rises in January, April, July, and October, and does not fall if prices fall. The maximum for ages 65 to 74 rose from $615.37 in January 2021 to $742.31 in January 2026, about 21%. Later years will keep rising with prices. This page does not forecast those raises. The only later change shown is the extra 10% OAS increase at age 75.',
    ],
  },
  {
    heading: 'Saved estimates',
    paragraphs: [
      'Each estimate is stored in the database on your user account. It is not shared with the family. Another person signed in on this app cannot open it.',
      'The name and the inputs are encrypted. The calculated results are not stored. Opening an estimate runs the math again.',
      'Save updates the estimate you have open. Save as new keeps that estimate and stores the current inputs as another one. Discard throws away unsaved edits and reloads the saved inputs. Delete removes that estimate only.',
      'Unsaved edits stay on the screen until you save them. They are not written to a file on this device.',
    ],
  },
  {
    heading: 'Inputs',
    paragraphs: [
      'Birth year sets the CPP contributory years, from age 18 (or 1966, when CPP began, if that is later) through the year before CPP starts.',
      'CPP start age is a whole age from 60 to 70. OAS start age is a whole age from 65 to 70. Partial months are not modeled.',
      'Years lived in Canada after age 18 set the OAS pension. Forty years is a full pension. Earnings do not set the OAS amount.',
      'Earnings periods are from year, to year, and approximate annual employment income (salary plus bonus). A later period wins if two periods cover the same year. A period without both years is not counted. Years with no period count as no earnings, except future years when the ceiling switch is on.',
      'The switch “Keep earning at least the CPP ceiling until CPP starts” fills years from 2026 through the year before CPP starts, when no period covers them, with the 2026 CPP ceiling. It does not fill the second ceiling.',
      'LAPP annual gross is the lifetime pension for the years CPP and OAS are both paying. A LAPP statement often shows a higher bridge until 65. That bridge is not included unless you type it in this field.',
      'Other taxable income is added for tax and the OAS recovery tax. It is not shown as its own pension line.',
      'A Service Canada monthly CPP amount, when entered, replaces the CPP estimate. The start-age adjustment is not applied again, because that statement amount is already the pension you would be paid.',
    ],
  },
  {
    heading: 'CPP',
    paragraphs: [
      'Each contributory year is capped at that year’s Year’s Maximum Pensionable Earnings (YMPE). Pay above the YMPE does not raise the base CPP. The 2026 YMPE is $74,600. Years after 2026 use that same ceiling. Years before 1980 use the 1980 ceiling of $13,100 when a birth year reaches that far back.',
      'From 2024, earnings between the YMPE and the Year’s Additional Maximum Pensionable Earnings (YAMPE) count only toward the second additional CPP. The 2024 YAMPE is $73,200, the 2025 YAMPE is $81,200, and the 2026 YAMPE is $85,000. Later years use $85,000. Pay above the YAMPE is ignored.',
      'The lowest 17% of contributory years are dropped, counted in whole years and rounded down. This is a yearly stand-in for the CPP general dropout. Child-rearing and disability dropouts are not applied.',
      'The age-65 base pension is 25% of the five-year average YMPE for 2022 through 2026 ($69,180), times the average ratio of capped earnings to that year’s YMPE on the years that remain. A full career at or above the ceiling has a ratio of 1.',
      'The post-2019 enhancement adds one fortieth of an 8.33 point replacement rate (1/480 of the $69,180 average) for each kept year at the ceiling, phased in at 15% in 2019, 30% in 2020, 50% in 2021, 75% in 2022, and 100% from 2023. The second additional piece, from 2024, adds 0.2% of the $10,400 gap between the 2026 ceilings for each kept year that fills that gap.',
      'Starting before 65 reduces the monthly CPP by 0.6% per month. Starting after 65 increases it by 0.7% per month, up to age 70.',
      'A published maximum for a new maximum CPP retirement pension at 65 in January 2026 is $1,507.65 a month. This yearly model lands near that figure for someone who contributed the maximum for a full career, including the enhanced years. It will not match a Service Canada statement exactly.',
    ],
  },
  {
    heading: 'OAS',
    paragraphs: [
      'The October to December 2026 maximum is $762.50 a month from 65 to 74, times years in Canada divided by 40.',
      'Deferral past 65 adds 0.6% per month, up to age 70. OAS cannot start before 65.',
      'From age 75 the pension is 10% higher. The maximum at 75 before deferral or partial residence is $838.75 a month. The page shows the first year CPP and OAS are both in pay, and again from age 75 when that first year is earlier than 75.',
    ],
  },
  {
    heading: 'OAS recovery tax',
    paragraphs: [
      'The recovery tax, often called the clawback, is 15% of net income above $95,323. That is the 2026 threshold. It is applied only to OAS, and it cannot take more than the OAS received in that snapshot.',
      'Income for the test includes the full OAS, CPP, LAPP, and other taxable income. The repayment is then deducted before income tax is calculated.',
      'CPP is not clawed back.',
    ],
  },
  {
    heading: 'Alberta and federal tax',
    paragraphs: [
      'Tax uses 2026 brackets for a single person. There is no pension split and no spouse or disability credit.',
      'Federal brackets are 14% to $58,523, 20.5% to $117,045, 26% to $181,440, 29% to $258,482, and 33% above that. The basic personal amount is $16,452, reduced toward $14,829 between $181,440 and $258,482 of income. The age amount is $9,208, reduced by 15% of income over $46,432. The pension amount is $2,000 and applies to LAPP only. Federal credits are calculated at 14%.',
      'Alberta brackets are 8% to $61,200, 10% to $154,259, 12% to $185,111, 13% to $246,813, 14% to $370,220, and 15% above that. The basic personal amount is $22,769. The age amount is $6,345, reduced by 15% of income over $47,234. The pension amount is $1,753 and applies to LAPP only. Alberta credits are calculated at 8%, the lowest bracket rate.',
      'CPP and OAS do not qualify for the pension amount. Guaranteed Income Supplement is not calculated.',
    ],
  },
  {
    heading: 'Gross and net',
    paragraphs: [
      'Gross is the benefit before the recovery tax and before income tax. Yearly gross is the monthly amount times 12. Monthly figures shown in the table are the yearly amount divided by 12.',
      'The recovery tax is taken entirely from OAS. Income tax is split across CPP, OAS, and LAPP in proportion to each gross amount, so the three net amounts add up to the combined net. Other taxable income can increase the tax that is split across those three lines.',
      'Net can fall when LAPP or other income crosses the recovery-tax threshold, even though the OAS gross pension did not change.',
    ],
  },
];
