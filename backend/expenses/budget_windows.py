"""Which budget row applies in a given month.

A seasonal row repeats its months every year after its start date.
A non-seasonal row is a single start/end span. When both cover a month,
the seasonal row wins. Two rows of the same kind must not cover one month.
"""
from datetime import date
from types import SimpleNamespace


def season_months(start_month: int, end_month: int) -> set[int]:
    months = set()
    month = int(start_month)
    for _ in range(12):
        months.add(month)
        if month == int(end_month):
            break
        month = 1 if month == 12 else month + 1
    return months


def budget_covers_month(budget, year: int, month: int) -> bool:
    """True when this row is the candidate limit for that calendar month."""
    from datetime import timedelta

    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year, 12, 31)
    else:
        month_end = date(year, month + 1, 1) - timedelta(days=1)

    start = getattr(budget, 'start_date', None)
    end = getattr(budget, 'end_date', None)
    if start and start > month_end:
        return False
    if end and end < month_start:
        return False

    if not getattr(budget, 'is_seasonal', False):
        return True

    season_start = getattr(budget, 'season_start_month', None)
    season_end = getattr(budget, 'season_end_month', None)
    if not season_start or not season_end:
        return False
    return month in season_months(int(season_start), int(season_end))


def _prefer(candidate, current) -> bool:
    """Seasonal beats an open-ended row. Otherwise the later start wins."""
    cand_season = bool(getattr(candidate, 'is_seasonal', False))
    curr_season = bool(getattr(current, 'is_seasonal', False))
    if cand_season != curr_season:
        return cand_season
    cand_start = getattr(candidate, 'start_date', None) or date.min
    curr_start = getattr(current, 'start_date', None) or date.min
    return cand_start >= curr_start


def pick_budgets_for_month(budgets, year: int, month: int):
    """One budget per category for that month."""
    chosen = {}
    for budget in budgets:
        if not getattr(budget, 'is_active', True):
            continue
        if not budget_covers_month(budget, year, month):
            continue
        category_id = getattr(budget, 'category_id', None)
        if category_id is None:
            category_id = getattr(budget, 'category', None)
        current = chosen.get(category_id)
        if current is None or _prefer(budget, current):
            chosen[category_id] = budget
    return list(chosen.values())


def _horizon(a, b) -> tuple[date, date]:
    start_a = getattr(a, 'start_date', None) or date(1970, 1, 1)
    start_b = getattr(b, 'start_date', None) or date(1970, 1, 1)
    begin = start_a if start_a > start_b else start_b
    end_a = getattr(a, 'end_date', None)
    end_b = getattr(b, 'end_date', None)
    if end_a and end_b:
        end = end_a if end_a < end_b else end_b
    elif end_a:
        end = end_a
    elif end_b:
        end = end_b
    else:
        end = date(begin.year + 15, 12, 1)
    if end < begin:
        end = begin
    return begin, end


def _shares_calendar_month(a, b) -> bool:
    begin, end = _horizon(a, b)
    year, month = begin.year, begin.month
    last = (end.year, end.month)
    for _ in range(12 * 20):
        if (year, month) > last:
            break
        if budget_covers_month(a, year, month) and budget_covers_month(b, year, month):
            return True
        month += 1
        if month == 13:
            month = 1
            year += 1
    return False


def budgets_overlap(a, b) -> bool:
    """True when two rows would both want the same month.

    A seasonal row may sit on top of an open-ended row. Those do not conflict:
    the seasonal row is used in its months and the open-ended row fills the rest.
    """
    a_season = bool(getattr(a, 'is_seasonal', False))
    b_season = bool(getattr(b, 'is_seasonal', False))
    if a_season != b_season:
        return False
    if a_season:
        a_months = season_months(a.season_start_month, a.season_end_month)
        b_months = season_months(b.season_start_month, b.season_end_month)
        if a_months.isdisjoint(b_months):
            return False
    return _shares_calendar_month(a, b)


def prospective_budget(**fields):
    return SimpleNamespace(**fields)
