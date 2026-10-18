---
name: Income pension estimate
overview: Add a calculator on the Income screen that stores multiple named estimates in the database for the logged-in user only. Shared calculation rules stay in the repo. Nothing is saved on the device or copied into income streams.
todos:
  - id: model-api
    content: Add a new user-owned retirement estimate table and API, without altering existing money or other app tables
    status: pending
  - id: seed-once
    content: Insert one estimate for this user only with the stated earnings bands, not in git and not for any other user
    status: pending
  - id: rules-doc
    content: Write the how-this-works reference and show the full text in a How this works section on the Estimate page
    status: pending
  - id: estimator
    content: Add retirementEstimate.ts with CPP, OAS, clawback, and Alberta tax math and no personal numbers
    status: pending
  - id: panel
    content: Add an Estimate view to list, open, edit, and save multiple estimates without touching income streams
    status: pending
  - id: verify
    content: Check the calculator, save and reload from another session, and confirm other users and income streams cannot see the estimates
    status: pending
isProject: false
---

# Retirement estimate on Income

Your salary bands do help CPP, and they do not set the OAS pension. In 2026 the CPP ceiling (YMPE) is $74,600 and the second ceiling (YAMPE) is $85,000. Years at about $165k, $200k, and $250k are all maximum CPP years. Extra pay above $85,000 does not raise CPP. OAS gross depends on years lived in Canada after age 18, start age, and the age-75 increase. Salary matters for OAS only later, through tax and the recovery tax (clawback), together with LAPP and CPP.

Personal amounts stay out of the calculation code and out of git. Each saved estimate is a database row owned by the logged-in user, so the same list is available after signing in on any device. The git repo holds the calculator and the shared rules, not your salary.

## What stays unchanged

Existing income streams, pay amounts, accounts, expenses, and every other screen stay as they are. The new work adds one table and one Estimate view. It does not change the fields or rows on `IncomeStream`, `IncomeOccurrence`, accounts, or snapshots. There is no button that copies a result into Streams.

The Income screen remembers Overview versus Streams in `incomeBoardCache` inside [mobile/components/money/IncomeDashboard.tsx](mobile/components/money/IncomeDashboard.tsx). Estimate will not write that cache and will not refetch streams. Coming back to Income still opens whichever of those two you last used.

Nothing is written to a local file or to device storage. Unsaved edits exist only on screen until you save them to the database.

## Saved estimates

Add a `RetirementEstimate` model in [backend/money/models.py](backend/money/models.py). It belongs to the user account (`api.User`), not to a family. Income streams are family-shared; these estimates are not. Another family member cannot list, open, or edit them.

Store a name and the calculator inputs. Follow the existing money pattern and encrypt the name and the inputs (salary, LAPP, and the other amounts) the way `IncomeStream.name` uses `EncryptedCharField`. Results are calculated when an estimate is opened, not stored, so a later rule change does not leave an old total behind.

The API is a viewset on [backend/money/urls.py](backend/money/urls.py), same `IsAuthenticated` permission as the other money views. `get_queryset` filters to `user=request.user` only. Create sets the owner from the logged-in user and ignores any user id sent by the client.

The Estimate view lists your saved estimates. Open one to view and edit it. **Save** updates that row. **Save as new** creates another row when you want to keep the previous numbers and try different ones. **Discard** reloads the selected row from the database and drops unsaved edits. Delete removes that estimate only.

Seed one estimate, once, into the database for your user account only. Do not put the amounts in a migration, fixture, or other file in git, and do not create the row for any other user. The seeded inputs are the bands you gave, with calendar years left blank because those years were not specified:

- Current employment, about $155,000 salary plus about $10,000 bonus
- Consulting, about $250,000 a year for 2–3 years, ending more than 5 years ago
- Earlier employment, about $200,000 a year for about 10 years before that consulting

Birth year, years in Canada, CPP and OAS start ages, and the LAPP dollar amount stay empty on that row. After this one insert, further estimates exist only when you choose Save or Save as new.

## Where it goes

Stay on the existing Money Income screen. Add an **Estimate** chip beside Overview and Streams. It is a separate view, not a new Money tab.

```1337:1341:mobile/components/money/IncomeDashboard.tsx
        {(
          [
            { id: 'overview' as const, label: 'Overview', icon: 'pie-chart' as const },
            { id: 'streams' as const, label: 'Streams', icon: 'list' as const },
          ] as const
        ).map((t) => {
```

Keep `boardTab` as `'overview' | 'streams'` only. Estimate uses its own screen state and is not stored in `incomeBoardCache`.

## How this works on the page

Put a **How this works** section on the Estimate page, below the calculator. It shows the full explanation on the page, so you can read it while looking at the numbers. The same text is saved in the repo at [Docs/retirement-estimate-rules.md](Docs/retirement-estimate-rules.md) and stays with the project. The page section and the document say the same thing.

The section covers:

- What the page does and what it does not change (income streams and other screens)
- How saved estimates are stored, who can see them, and what Save, Save as new, and Discard do
- Each input and how it affects CPP, OAS, LAPP, tax, and the clawback
- The calculation steps: CPP ceiling and 17% dropout, OAS residence, deferral, and the age-75 increase, the $95,323 clawback, and the 2026 federal and Alberta credits and brackets
- How gross and net, monthly and yearly, are produced, including the first year both public pensions are in pay and the age-75 snapshot
- The rates and ceilings used, matching the constants in [mobile/utils/retirementEstimate.ts](mobile/utils/retirementEstimate.ts)

The personal dollar amounts stay in your saved estimates. How this works has no salary figures.

## Inputs

- Birth year
- CPP start age, 60 to 70
- OAS start age, 65 to 70
- Years lived in Canada after age 18 (full pension at 40)
- A short list of earnings periods: from year, to year, approximate annual employment income (salary plus bonus). Years with no period count as $0
- A switch for “I keep earning at least the CPP ceiling until CPP starts,” so future years stay at the maximum without typing each one
- LAPP annual gross for the lifetime pension in the years both CPP and OAS are paying. LAPP statements often show a higher bridge until 65; that bridge is not included unless you type it
- Other taxable income, default 0
- Optional monthly CPP amount from Service Canada, which replaces the calculated CPP

## Calculation

Pure functions in a new [mobile/utils/retirementEstimate.ts](mobile/utils/retirementEstimate.ts). Results are in 2026 dollars. Future years use 2026 ceilings, brackets, and benefit rates. No inflation forecast.

- **CPP:** For each year from age 18 until the year before CPP starts, cap employment income at that year’s YMPE. From 2024, earnings between YMPE and YAMPE count only toward the small second enhancement. Drop the lowest 17% of contributory years (yearly stand-in for the general dropout). Scale the age-65 base pension from the five-year average YMPE, then add the post-2019 enhancement using the published phase-in rates, kept in one constants block. Adjust for start age: minus 0.6% per month before 65, plus 0.7% per month after 65. If a Service Canada amount is entered, use that instead.
- **OAS:** October–December 2026 maximum $762.50 a month at 65–74, times years in Canada divided by 40. Plus 0.6% per month if started after 65, up to 70. Show a second snapshot from age 75 at an extra 10% ($838.75 before deferral or partial residence).
- **Clawback:** 15% of net income above the 2026 threshold of $95,323, applied only to OAS, and never more than the OAS received. Income for this test includes full OAS, LAPP, CPP, and other income.
- **Tax:** 2026 federal and Alberta brackets. Credits: basic personal amount, age amount when 65 or older, and the $2,000 pension amount on LAPP only. CPP and OAS do not get that pension credit. Single person, no pension split, no GIS (income at this level is above GIS).
- **Net:** Clawback is taken entirely from OAS. Income tax is split across CPP, OAS, and LAPP in proportion to each gross amount so the three net columns add up to the combined net.

Show monthly and yearly gross and net for CPP, OAS, LAPP, and the total, for the first year both public pensions are in pay and again from age 75. A short note states that pay above the ceiling was ignored, how many $0 years were dropped, and that this is an estimate rather than a Service Canada or CRA figure.

## Check

On the web app, open Money, Income, Estimate. Confirm CPP does not rise when a period already above the ceiling is changed from $80,000 to $200,000. Confirm OAS changes when years in Canada change and does not change when salary changes. Enter a large LAPP amount and confirm OAS net falls once income passes the clawback threshold. Changing CPP or OAS start age updates the figures on screen only.

Open Estimate and confirm the seeded row is already there with those three earnings bands, and that income streams and other screens show the same data as before. Save an estimate, sign in on a fresh session, and confirm that estimate is listed and opens with the same inputs. Change the inputs, choose Save as new, and confirm both estimates remain and can be edited separately. Discard unsaved edits and confirm the open estimate returns to the saved inputs.

Confirm Overview or Streams is unchanged and no income stream was created. Call the list API as a different user and confirm the first user's estimates are absent. Read How this works on the Estimate page and confirm it matches the rules document.
