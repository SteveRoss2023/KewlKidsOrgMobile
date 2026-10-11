"""Generate income occurrence due dates from stream frequency."""
from calendar import monthrange
from datetime import date, timedelta


def add_months(d: date, months: int) -> date:
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def _easter_sunday(year: int) -> date:
    """Anonymous Gregorian algorithm for Easter Sunday."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _observed_holiday(d: date) -> date:
    """If a fixed holiday falls on a weekend, observe on the following Monday."""
    if d.weekday() == 5:  # Saturday
        return d + timedelta(days=2)
    if d.weekday() == 6:  # Sunday
        return d + timedelta(days=1)
    return d


def _canadian_federal_holidays(year: int) -> set:
    """Federal holidays that typically close banks (for pension business-day math)."""
    holidays = {
        _observed_holiday(date(year, 1, 1)),  # New Year's Day
        _easter_sunday(year) - timedelta(days=2),  # Good Friday
        # Victoria Day: Monday on or before May 24
        date(year, 5, 25) - timedelta(days=((date(year, 5, 25).weekday() + 1) % 7 or 7)),
        _observed_holiday(date(year, 7, 1)),  # Canada Day
        # Labour Day: first Monday in September
        date(year, 9, 1) + timedelta(days=(7 - date(year, 9, 1).weekday()) % 7),
        # National Day for Truth and Reconciliation (Sep 30)
        _observed_holiday(date(year, 9, 30)),
        # Thanksgiving: second Monday in October
        date(year, 10, 1) + timedelta(days=(7 - date(year, 10, 1).weekday()) % 7 + 7),
        _observed_holiday(date(year, 12, 25)),  # Christmas
        _observed_holiday(date(year, 12, 26)),  # Boxing Day
    }
    # If Boxing Day observance lands on Christmas observance, push Boxing to next day
    xmas = _observed_holiday(date(year, 12, 25))
    boxing = _observed_holiday(date(year, 12, 26))
    if boxing == xmas:
        holidays.add(boxing + timedelta(days=1))
    return holidays


def is_business_day(d: date, holidays: set | None = None) -> bool:
    if d.weekday() >= 5:
        return False
    hol = holidays if holidays is not None else _canadian_federal_holidays(d.year)
    return d not in hol


def nth_last_business_day(year: int, month: int, n: int, *, december_start: date | None = None) -> date:
    """Nth-to-last Canadian banking day of the month.

    december_start: when set (for Dec), count backward from that date instead of month end.
    """
    holidays = _canadian_federal_holidays(year)
    if month == 12 and december_start is not None:
        cursor = december_start
    else:
        last = monthrange(year, month)[1]
        cursor = date(year, month, last)

    found = 0
    while True:
        if is_business_day(cursor, holidays):
            found += 1
            if found == n:
                return cursor
        cursor -= timedelta(days=1)


def third_last_business_day(year: int, month: int) -> date:
    """CPP/OAS: 3rd-last business day; December paid before Christmas."""
    return nth_last_business_day(
        year, month, 3, december_start=date(year, 12, 24) if month == 12 else None
    )


def second_last_business_day(year: int, month: int) -> date:
    """LAPP: 2nd-last banking day; December paid before Dec 25 (from Dec 23)."""
    return nth_last_business_day(
        year, month, 2, december_start=date(year, 12, 23) if month == 12 else None
    )


def _iter_month_pay_dates(start: date, end: date, pay_day_fn):
    """Yield monthly pay dates from first month of start through end."""
    first_month = date(start.year, start.month, 1)
    y, m = start.year, start.month
    while True:
        due = pay_day_fn(y, m)
        if due > end:
            break
        if due >= first_month:
            yield due
        if m == 12:
            y += 1
            m = 1
        else:
            m += 1
        if date(y, m, 1) > end:
            break


def iter_due_dates(start: date, end: date, frequency: str):
    """Yield due dates from start through end inclusive."""
    if frequency == 'one_time':
        yield start
        return
    if end < start:
        return
    if frequency == 'biweekly':
        current = start
        while current <= end:
            yield current
            current = current + timedelta(days=14)
        return
    if frequency == 'third_last_biz':
        yield from _iter_month_pay_dates(start, end, third_last_business_day)
        return
    if frequency == 'second_last_biz':
        yield from _iter_month_pay_dates(start, end, second_last_business_day)
        return
    # monthly (calendar day of start)
    current = start
    while current <= end:
        yield current
        current = add_months(current, 1)
