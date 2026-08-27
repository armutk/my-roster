(() => {
  'use strict';

  /* ---------- Embedded fallback data (used if roster.json can't be fetched, e.g. opened via file://) ---------- */
  const ROSTER_FALLBACK = {
    "meta": {
      "periodLabel": "August - October 2026",
      "source": "RosterOn ESS (Mercy Health) — https://mha.allocate-cloud.com.au/MHAPROD/Mobile/",
      "sourceRetrieved": "2026-08-26",
      "unit": "WMH Neonatal Postnatal Support Program",
      "employee": {
        "position": "Registered Nurse",
        "role": "Neonatal Postnatal Support Nurse",
        "classification": "Registered Nurse Grade 2, Year 7, YP8",
        "employer": "Mercy Hospitals Victoria Ltd / Mercy Health",
        "workplace": "Werribee Mercy Hospital",
        "employmentType": "Part-time fixed-term",
        "contractedWeeklyHours": 32,
        "baseHourlyRate": 51.79,
        "agreement": "Nurses & Midwives (Victorian Public Sector) Single Interest Employers Enterprise Agreement 2024-2028"
      }
    },
    "shiftTypes": {
      "day": { "label": "Day Shift", "start": "07:00", "end": "15:30", "paidHours": 8 },
      "afternoon": { "label": "Afternoon Shift", "start": "13:00", "end": "21:30", "paidHours": 8 },
      "night": { "label": "Night Shift", "start": null, "end": null, "paidHours": 10 }
    },
    "shifts": [
      { "date": "2026-08-26", "day": "Wednesday", "shiftType": "day",       "start": "07:00", "end": "15:30", "paidHours": 8, "note": "Buddy Shift" },
      { "date": "2026-08-27", "day": "Thursday",  "shiftType": "day",       "start": "07:00", "end": "15:30", "paidHours": 8, "note": "Buddy Shift" },
      { "date": "2026-08-28", "day": "Friday",    "shiftType": "day",       "start": "07:00", "end": "15:30", "paidHours": 8, "note": "Buddy Shift" },
      { "date": "2026-09-02", "day": "Wednesday", "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8, "note": "Buddy Shift" },
      { "date": "2026-09-03", "day": "Thursday",  "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-04", "day": "Friday",    "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-07", "day": "Monday",    "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-08", "day": "Tuesday",   "shiftType": "day",       "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-09", "day": "Wednesday", "shiftType": "day",       "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-12", "day": "Saturday",  "shiftType": "day",       "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-13", "day": "Sunday",    "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-14", "day": "Monday",    "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-16", "day": "Wednesday", "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-19", "day": "Saturday",  "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-21", "day": "Monday",    "shiftType": "day",       "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-22", "day": "Tuesday",   "shiftType": "day",       "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-24", "day": "Thursday",  "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-25", "day": "Friday",    "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-29", "day": "Tuesday",   "shiftType": "day",       "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-30", "day": "Wednesday", "shiftType": "day",       "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-10-01", "day": "Thursday",  "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-10-02", "day": "Friday",    "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 }
    ]
  };

  /* ---------- Fortnight anchor ----------
     Real employer pay-fortnights repeat on a fixed 14-day cycle, not on whatever
     dates happen to be in the roster data. 2026-09-07 is the confirmed fortnight
     start for this roster; adjust this if the actual employer cycle differs. */
  const FORTNIGHT_ANCHOR = parseLocalDate('2026-09-07');

  const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const CAL_DOW_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // calendar grid is Monday-first
  const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const SHIFT_BADGE = { day: 'D', afternoon: 'A', night: 'N' };

  let DATA = null;
  let BASE_SHIFTS = [];      // as published by RosterOn / roster.json
  let calendarCursor = null; // {year, month} month is 0-indexed, for the Calendar view

  /* ================= Local edits =================
     roster.json stays the RosterOn-sourced base. Edits made in the app are kept
     separately in localStorage and layered on top, so:
       - re-importing from RosterOn never silently destroys a manual fix, and
       - any edit can be reverted back to what RosterOn actually says.
     Shape: { "YYYY-MM-DD": {shiftType,start,end,paidHours,note} | {deleted:true} } */

  const OVERRIDES_KEY = 'myroster-overrides';

  function loadOverrides() {
    try {
      return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}');
    } catch (err) {
      return {};
    }
  }

  function saveOverrides(o) {
    try {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o));
    } catch (err) {
      /* private mode / storage disabled — edits just won't persist */
    }
  }

  function applyOverrides(base) {
    const o = loadOverrides();
    const byDate = new Map(base.map((s) => [s.date, { ...s }]));

    for (const [date, ov] of Object.entries(o)) {
      if (ov && ov.deleted) {
        byDate.delete(date);
        continue;
      }
      const existing = byDate.get(date);
      const merged = { ...(existing || {}), ...ov, date, edited: true };
      if (!existing) merged.addedLocally = true;
      merged.day = DOW_LONG[parseLocalDate(date).getDay()];
      byDate.set(date, merged);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /** True where the local copy differs from what RosterOn published. */
  function hasLocalEdits() {
    return Object.keys(loadOverrides()).length > 0;
  }

  function rebuildShifts() {
    DATA.shifts = applyOverrides(BASE_SHIFTS);
  }

  function refreshAll() {
    rebuildShifts();
    tick();
    const active = document.querySelector('.nav-btn.active');
    const view = active ? active.getAttribute('data-view') : 'home';
    if (view === 'roster') renderRoster();
    if (view === 'calendar') renderCalendar();
    if (view === 'stats') renderStats();
    if (view === 'pay') renderPay();
    renderEditBanner();
  }

  /* ================= Date helpers ================= */

  function parseLocalDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function combineDateTime(dateStr, timeStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  function isWeekend(date) {
    const dow = date.getDay();
    return dow === 0 || dow === 6;
  }

  function formatTime12(timeStr) {
    if (!timeStr) return '';
    const [hh, mm] = timeStr.split(':').map(Number);
    const period = hh >= 12 ? 'PM' : 'AM';
    let h = hh % 12;
    if (h === 0) h = 12;
    return mm === 0 ? `${h}:00 ${period}` : `${h}:${String(mm).padStart(2, '0')} ${period}`;
  }

  function formatFullDate(date) {
    return `${DOW_LONG[date.getDay()]}, ${date.getDate()} ${MONTH_LONG[date.getMonth()]} ${date.getFullYear()}`;
  }

  function formatShortDate(date) {
    return `${date.getDate()} ${MONTH_LONG[date.getMonth()].slice(0, 3)}`;
  }

  function sameCalendarDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function daysBetween(a, b) {
    const MS = 24 * 60 * 60 * 1000;
    return Math.round((startOfDay(b) - startOfDay(a)) / MS);
  }

  function getWeekMonday(date) {
    const d = startOfDay(date);
    const dow = d.getDay(); // 0=Sun..6=Sat
    const offset = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + offset);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  /* ================= Data helpers ================= */

  function shiftTypeInfo(shiftType) {
    return DATA.shiftTypes[shiftType] || { label: shiftType, paidHours: 0 };
  }

  function getShiftWindow(shift) {
    const start = shift.start ? combineDateTime(shift.date, shift.start) : null;
    let end = null;
    if (shift.end) {
      end = combineDateTime(shift.date, shift.end);
      if (start && end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000); // overnight shift
    }
    return { start, end };
  }

  function sortedShifts() {
    return [...DATA.shifts].sort((a, b) => a.date.localeCompare(b.date));
  }

  function findNextShift(now) {
    const shifts = sortedShifts();
    for (const shift of shifts) {
      const { start, end } = getShiftWindow(shift);
      const effectiveEnd = end || (start ? new Date(start.getTime() + shift.paidHours * 60 * 60 * 1000) : addDays(parseLocalDate(shift.date), 1));
      if (effectiveEnd > now) return shift;
    }
    return null;
  }

  function upcomingShifts(now, count) {
    const shifts = sortedShifts();
    const result = [];
    for (const shift of shifts) {
      const { end } = getShiftWindow(shift);
      const effectiveEnd = end || addDays(parseLocalDate(shift.date), 1);
      if (effectiveEnd > now) {
        result.push(shift);
        if (result.length >= count) break;
      }
    }
    return result;
  }

  function groupByWeek(shifts) {
    const map = new Map();
    for (const shift of shifts) {
      const monday = getWeekMonday(parseLocalDate(shift.date));
      const key = dateKey(monday);
      if (!map.has(key)) map.set(key, { monday, shifts: [] });
      map.get(key).shifts.push(shift);
    }
    return [...map.values()].sort((a, b) => a.monday - b.monday);
  }

  function weekHours(week) {
    return week.shifts.reduce((sum, s) => sum + s.paidHours, 0);
  }

  function fortnightOffset(monday) {
    const diffDays = Math.round((monday - FORTNIGHT_ANCHOR) / (24 * 60 * 60 * 1000));
    const weeks = Math.round(diffDays / 7);
    return ((weeks % 2) + 2) % 2; // 0 = first week of fortnight, 1 = second week
  }

  function groupByFortnight(weeks) {
    const fortnights = [];
    let i = 0;
    while (i < weeks.length) {
      const w = weeks[i];
      if (fortnightOffset(w.monday) === 0 && i + 1 < weeks.length &&
          daysBetween(w.monday, weeks[i + 1].monday) === 7 && fortnightOffset(weeks[i + 1].monday) === 1) {
        fortnights.push({ start: w.monday, end: addDays(weeks[i + 1].monday, 6), weeks: [w, weeks[i + 1]] });
        i += 2;
      } else {
        fortnights.push({ start: w.monday, end: addDays(w.monday, 6), weeks: [w] });
        i += 1;
      }
    }
    return fortnights;
  }

  /* ================= Rendering: Home ================= */

  function renderNextShift(now) {
    const container = document.getElementById('nextShiftContainer');
    const shift = findNextShift(now);

    if (!shift) {
      container.innerHTML = `
        <div class="card no-shift-card">
          <div style="font-size:2rem;">📋</div>
          <p style="font-weight:700; margin:10px 0 4px;">No upcoming shifts</p>
          <p style="font-size:0.85rem; margin:0;">Your roster is clear beyond this period.</p>
        </div>`;
      return;
    }

    const { start, end } = getShiftWindow(shift);
    const info = shiftTypeInfo(shift.shiftType);
    const shiftDate = parseLocalDate(shift.date);
    const onShift = start && end && now >= start && now < end;

    let countdownText = '';
    let live = false;
    if (onShift) {
      countdownText = 'Currently on shift';
      live = true;
    } else if (end && now >= end) {
      countdownText = 'Shift finished';
    } else if (start) {
      const diffMs = start - now;
      const diffDays = daysBetween(now, shiftDate);
      if (diffMs <= 60 * 60 * 1000 && diffMs > 0) {
        const mins = Math.max(1, Math.round(diffMs / 60000));
        countdownText = `Starts in ${mins} minute${mins === 1 ? '' : 's'}`;
      } else if (diffDays === 0) {
        const hours = Math.round(diffMs / 3600000);
        countdownText = `Starts in ${hours} hour${hours === 1 ? '' : 's'}`;
      } else if (diffDays === 1) {
        countdownText = 'Starts tomorrow';
      } else {
        countdownText = `Starts in ${diffDays} days`;
      }
    } else {
      const diffDays = daysBetween(now, shiftDate);
      countdownText = diffDays <= 1 ? 'Starts tomorrow' : `Starts in ${diffDays} days`;
    }

    const timeLine = start && end
      ? `${formatTime12(shift.start)} to ${formatTime12(shift.end)}`
      : `${info.paidHours} hour shift`;

    container.innerHTML = `
      <div class="next-shift-card">
        <div class="next-shift-label">Next Shift</div>
        <div class="next-shift-day">${DOW_LONG[shiftDate.getDay()]}</div>
        <div class="next-shift-date">${shiftDate.getDate()} ${MONTH_LONG[shiftDate.getMonth()]} ${shiftDate.getFullYear()}</div>
        <div class="next-shift-type">${info.label}</div>
        <div class="next-shift-time">${timeLine}</div>
        <div class="next-shift-hours">${shift.paidHours} paid hours</div>
        <div class="countdown ${live ? 'live' : ''}"><span class="dot"></span>${countdownText}</div>
      </div>`;
  }

  function renderWeekSummary(now) {
    const el = document.getElementById('weekSummaryCard');
    const monday = getWeekMonday(now);
    const weeks = groupByWeek(DATA.shifts);
    const thisWeek = weeks.find((w) => dateKey(w.monday) === dateKey(monday));
    const hours = thisWeek ? weekHours(thisWeek) : 0;
    const contracted = DATA.meta.employee.contractedWeeklyHours;
    const pct = Math.min(100, Math.round((hours / contracted) * 100));

    let note;
    if (hours === contracted) note = 'Matches contracted weekly average';
    else if (hours < contracted) note = `${contracted - hours} hours under contracted average`;
    else note = `${hours - contracted} hours above contracted weekly average`;

    const ringColor = hours > contracted ? 'var(--afternoon-color)' : 'var(--accent)';
    const circumference = 2 * Math.PI * 26;
    const dash = (pct / 100) * circumference;

    const weekPay = thisWeek ? paySummary(thisWeek.shifts) : null;

    el.innerHTML = `
      <div class="week-card-main">
        <div class="week-title">${formatShortDate(monday)} – ${formatShortDate(addDays(monday, 6))}</div>
        <div class="week-hours">${hours} <small>/ ${contracted} hrs</small></div>
        <div class="week-note">${note}</div>
        ${weekPay && weekPay.estimatedGross > 0 ? `<div class="week-gross">${money(weekPay.estimatedGross)} est. gross</div>` : ''}
      </div>
      <svg class="progress-ring" width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="26" fill="none" stroke="var(--surface-alt)" stroke-width="7" />
        <circle cx="32" cy="32" r="26" fill="none" stroke="${ringColor}" stroke-width="7"
          stroke-linecap="round" stroke-dasharray="${dash} ${circumference}"
          transform="rotate(-90 32 32)" />
        <text x="32" y="37" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text)">${pct}%</text>
      </svg>`;
  }

  function shiftRowHtml(shift, { showHours = true } = {}) {
    const date = parseLocalDate(shift.date);
    const weekend = isWeekend(date);
    const info = shiftTypeInfo(shift.shiftType);
    const timeText = shift.start && shift.end ? `${formatTime12(shift.start)} – ${formatTime12(shift.end)}` : `${info.paidHours} hour shift`;
    return `
      <div class="shift-row" data-date="${shift.date}">
        <div class="shift-chip ${shift.shiftType}">${SHIFT_BADGE[shift.shiftType] || '?'}</div>
        <div class="shift-row-info">
          <div class="shift-row-day">${DOW_SHORT[date.getDay()]}, ${formatShortDate(date)}${weekend ? '<span class="weekend-tag">Weekend</span>' : ''}${shift.note ? `<span class="note-tag">${shift.note}</span>` : ''}${shift.edited ? '<span class="edited-tag">Edited</span>' : ''}</div>
          <div class="shift-row-time">${timeText}</div>
        </div>
        ${showHours ? `<div class="shift-row-hours">${shift.paidHours}h</div>` : ''}
      </div>`;
  }

  function renderUpcoming(now) {
    const el = document.getElementById('upcomingList');
    const shifts = upcomingShifts(now, 5);
    if (!shifts.length) {
      el.innerHTML = `<p style="color:var(--text-dim); font-size:0.9rem; margin:8px 0;">No upcoming shifts scheduled.</p>`;
      return;
    }
    el.innerHTML = shifts.map((s) => shiftRowHtml(s)).join('');
    attachRowHandlers(el);
  }

  /* ================= Rendering: Roster ================= */

  function renderRoster() {
    const el = document.getElementById('rosterList');
    const weeks = groupByWeek(sortedShifts());
    if (!weeks.length) {
      el.innerHTML = `<p style="color:var(--text-dim);">No shifts in the roster yet.</p>`;
      return;
    }
    el.innerHTML = weeks.map((week) => {
      const hours = weekHours(week);
      return `
        <div class="roster-week-group">
          <div class="roster-week-header">
            <span class="rw-title">${formatShortDate(week.monday)} – ${formatShortDate(addDays(week.monday, 6))}</span>
            <span class="rw-meta">${week.shifts.length} shift${week.shifts.length === 1 ? '' : 's'} · ${hours}h</span>
          </div>
          <div class="card">
            ${week.shifts.map((s) => {
              const d = parseLocalDate(s.date);
              const p = payFor(s);
              const row = shiftRowHtml(s);
              const withPay = p
                ? row.replace(
                    /<div class="shift-row-hours">([^<]*)<\/div>/,
                    `<div class="shift-row-hours">$1<span class="shift-row-pay">${money(p.estimatedGross)}</span></div>`
                  )
                : row;
              return `<div class="${isWeekend(d) ? 'weekend-row' : ''}">${withPay}</div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');
    attachRowHandlers(el);
  }

  /* ================= Rendering: Calendar ================= */

  function shiftsByDate() {
    const map = new Map();
    for (const shift of DATA.shifts) map.set(shift.date, shift);
    return map;
  }

  function renderCalendar() {
    const { year, month } = calendarCursor;
    document.getElementById('calMonthLabel').textContent = `${MONTH_LONG[month]} ${year}`;

    const grid = document.getElementById('calendarGrid');
    const byDate = shiftsByDate();
    const today = startOfDay(new Date());

    const dowHeader = CAL_DOW_HEADER.map((d) => `<div class="cal-dow">${d[0]}</div>`).join('');

    const firstOfMonth = new Date(year, month, 1);
    const firstDow = firstOfMonth.getDay();
    const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1; // week starts Monday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let cells = '';
    for (let i = 0; i < leadingBlanks; i++) cells += `<div class="cal-day empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const key = dateKey(date);
      const shift = byDate.get(key);
      const classes = ['cal-day'];
      if (isWeekend(date)) classes.push('weekend');
      if (sameCalendarDay(date, today)) classes.push('today');
      const badge = shift ? `<span class="cal-day-badge ${shift.shiftType}">${SHIFT_BADGE[shift.shiftType]}</span>` : '';
      cells += `<div class="${classes.join(' ')}" data-date="${key}">${day}${badge}</div>`;
    }

    grid.innerHTML = dowHeader + cells;

    grid.querySelectorAll('.cal-day[data-date]').forEach((cell) => {
      cell.addEventListener('click', () => openDaySheet(cell.getAttribute('data-date')));
    });
  }

  function changeCalendarMonth(delta) {
    let { year, month } = calendarCursor;
    month += delta;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
    calendarCursor = { year, month };
    renderCalendar();
  }

  /* ================= Rendering: Stats ================= */

  function renderStats() {
    const shifts = DATA.shifts;
    const totalHours = shifts.reduce((sum, s) => sum + s.paidHours, 0);
    document.getElementById('statTotalShifts').textContent = shifts.length;
    document.getElementById('statTotalHours').textContent = totalHours;

    const byType = { day: [], afternoon: [], night: [] };
    shifts.forEach((s) => { if (byType[s.shiftType]) byType[s.shiftType].push(s); });

    const breakdownEl = document.getElementById('breakdownCard');
    const typeColorVar = { day: 'var(--day-color)', afternoon: 'var(--afternoon-color)', night: 'var(--night-color)' };
    breakdownEl.innerHTML = ['day', 'afternoon', 'night'].map((type) => {
      const count = byType[type].length;
      const pct = shifts.length ? Math.round((count / shifts.length) * 100) : 0;
      const info = shiftTypeInfo(type);
      return `
        <div class="breakdown-row">
          <span class="bd-dot" style="background:${typeColorVar[type]}"></span>
          <span class="bd-label">${info.label}s</span>
          <span class="bd-value">${count}</span>
        </div>
        <div class="bd-bar-track"><div class="bd-bar-fill" style="width:${pct}%; background:${typeColorVar[type]}"></div></div>`;
    }).join('');

    const weeks = groupByWeek(sortedShifts());
    const weeklyEl = document.getElementById('weeklyHoursCard');
    weeklyEl.innerHTML = weeks.map((w) => `
      <div class="week-list-row">
        <span class="wl-dates">${formatShortDate(w.monday)} – ${formatShortDate(addDays(w.monday, 6))}</span>
        <span class="wl-hours">${weekHours(w)} hours</span>
      </div>`).join('') || `<p style="color:var(--text-dim);">No data yet.</p>`;

    const fortnights = groupByFortnight(weeks);
    const fnEl = document.getElementById('fortnightList');
    fnEl.innerHTML = fortnights.map((fn) => {
      const shiftCount = fn.weeks.reduce((sum, w) => sum + w.shifts.length, 0);
      const hours = fn.weeks.reduce((sum, w) => sum + weekHours(w), 0);
      return `
        <div class="card fortnight-card">
          <div class="fn-title">${formatShortDate(fn.start)} – ${formatShortDate(fn.end)} ${fn.end.getFullYear() !== fn.start.getFullYear() ? fn.end.getFullYear() : ''}</div>
          <div class="fn-meta">${shiftCount} shifts · ${hours} rostered hours</div>
        </div>`;
    }).join('');

    const emp = DATA.meta.employee;
    document.getElementById('contractCard').innerHTML = `
      <div class="contract-box"><span class="cb-label">Average contracted hours</span><span class="cb-value">${emp.contractedWeeklyHours} per week</span></div>
      <div class="contract-box"><span class="cb-label">Base hourly rate</span><span class="cb-value">$${emp.baseHourlyRate.toFixed(2)}</span></div>
      <div class="contract-box"><span class="cb-label">Classification</span><span class="cb-value" style="text-align:right;">${emp.classification}</span></div>
      <div class="contract-box"><span class="cb-label">Employment type</span><span class="cb-value" style="text-align:right;">${emp.employmentType}</span></div>
      <p class="contract-meta" style="margin-top:10px;">${emp.workplace} · ${emp.employer}<br>${emp.agreement}</p>`;
  }

  /* ================= Pay helpers ================= */

  function money(n) {
    if (n == null) return 'Needs verification';
    return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Normalise clause references for the small chip label: "Clause 34.3" -> "cl 34.3". */
  function clauseChip(text) {
    if (!text) return '';
    // Keep subclause markers like "(a)" / "(c)(iii)"; drop descriptive trailing
    // parentheticals such as "(Shift Allowance — Definitions)".
    return String(text)
      .replace(/^Clause\s+/i, 'cl ')
      .replace(/\s+\([^)]*\s[^)]*\)\s*$/, '')
      .trim();
  }

  function payFor(shift) {
    if (!window.PayEngine || !window.PayRules) return null;
    try {
      return window.PayEngine.calculateShift(shift, DATA.shiftTypes);
    } catch (err) {
      return null;
    }
  }

  function paySummary(shifts) {
    if (!window.PayEngine || !window.PayRules) return null;
    try {
      return window.PayEngine.summarise(shifts, DATA.shiftTypes);
    } catch (err) {
      return null;
    }
  }

  /** Line-by-line gross breakdown for one shift. */
  function payBreakdownHtml(pay) {
    if (!pay) return '';
    const rows = [];

    rows.push({
      label: `Ordinary pay — ${pay.paidHours}h × ${money(pay.baseHourlyRate)}`,
      value: money(pay.ordinaryPay),
      clause: 'cl 18.3',
    });

    if (pay.weekendPenalty > 0) {
      rows.push({ label: 'Weekend penalty (time and a half)', value: money(pay.weekendPenalty), clause: 'cl 48.1' });
    }
    if (pay.publicHolidayPenalty > 0) {
      rows.push({
        label: `Public holiday penalty — ${pay.publicHolidayName}`,
        value: money(pay.publicHolidayPenalty),
        clause: 'cl 56.5(a)',
      });
    }
    if (pay.shiftAllowance && pay.shiftAllowance.amount) {
      rows.push({
        label: pay.shiftAllowance.label + (pay.shiftAllowance.verified ? '' : ' *'),
        value: money(pay.shiftAllowance.amount),
        clause: pay.shiftAllowance.agreementClause || 'cl 34.3',
      });
    }
    for (const a of pay.otherAllowances || []) {
      rows.push({ label: a.label, value: money(a.amount), clause: a.agreementClause });
    }
    if (pay.missedMealBreak) {
      rows.push({
        label: `${pay.missedMealBreak.label} (${pay.missedMealBreak.hours}h at 150%)`,
        value: money(pay.missedMealBreak.amount),
        clause: 'cl 44.1(c)',
      });
    }
    if (pay.overtime) {
      for (const t of pay.overtime.tiers) {
        rows.push({ label: t.label + ` — ${t.hours}h`, value: money(t.amount), clause: 'cl 49.2(c)' });
      }
    }

    const rowHtml = rows
      .map(
        (r) => `
      <div class="pay-line">
        <span class="pay-line-label">${r.label}${r.clause ? `<span class="pay-clause">${clauseChip(r.clause)}</span>` : ''}</span>
        <span class="pay-line-value">${r.value}</span>
      </div>`
      )
      .join('');

    const segHtml =
      pay.segments && pay.segments.length > 1
        ? `<div class="pay-segments">
             <div class="pay-seg-title">Hours split across days</div>
             ${pay.segments
               .map(
                 (s) => `<div class="pay-line sub"><span class="pay-line-label">${formatShortDate(parseLocalDate(s.date))} — ${s.hours}h × ${s.multiplier} <span class="pay-clause">${s.basis}</span></span><span class="pay-line-value">${money(s.totalPay)}</span></div>`
               )
               .join('')}
           </div>`
        : '';

    const noteHtml = (pay.notes || [])
      .map((n) => `<p class="pay-note">${n}</p>`)
      .join('');
    const warnHtml = (pay.warnings || [])
      .map((w) => `<p class="pay-warning">⚠ ${w}</p>`)
      .join('');

    return `
      <div class="pay-breakdown">
        ${rowHtml}
        ${segHtml}
        <div class="pay-line total">
          <span class="pay-line-label">Estimated gross</span>
          <span class="pay-line-value">${money(pay.estimatedGross)}</span>
        </div>
        ${noteHtml}
        ${warnHtml}
        <p class="pay-note">Gross, before tax and superannuation.</p>
      </div>`;
  }

  /* ================= Day detail sheet ================= */

  function openDaySheet(dateKeyStr) {
    const date = parseLocalDate(dateKeyStr);
    const shift = DATA.shifts.find((s) => s.date === dateKeyStr);
    const content = document.getElementById('sheetContent');

    if (!shift) {
      content.innerHTML = `
        <h2 style="margin:0 0 6px;">${formatFullDate(date)}</h2>
        <p style="color:var(--text-dim); margin:0 0 16px;">Day off — no shift rostered.</p>
        <div class="edit-actions"><button class="btn primary" id="sheetAdd">Add a shift</button></div>`;
      document.getElementById('sheetAdd').addEventListener('click', () => openEditSheet(dateKeyStr));
    } else {
      const info = shiftTypeInfo(shift.shiftType);
      const timeText = shift.start && shift.end ? `${formatTime12(shift.start)} to ${formatTime12(shift.end)}` : `${info.paidHours} hour shift`;
      const pay = payFor(shift);
      const baseShift = BASE_SHIFTS.find((s) => s.date === dateKeyStr);
      let editedNote = '';
      if (shift.addedLocally) {
        editedNote = `<div class="edited-banner">Added on this device — not in the published roster.</div>`;
      } else if (shift.edited && baseShift) {
        editedNote = `<div class="edited-banner">Edited on this device. Roster says: ${shiftTypeInfo(baseShift.shiftType).label}, ${formatTime12(baseShift.start)}–${formatTime12(baseShift.end)}.</div>`;
      }

      content.innerHTML = `
        <h2 style="margin:0 0 10px;">${formatFullDate(date)}</h2>
        <div class="next-shift-type" style="background:var(--accent-dim); color:var(--accent); margin-bottom:12px;">${info.label}</div>
        ${shift.note ? `<div class="shift-note">${shift.note}</div>` : ''}
        ${editedNote}
        <p style="font-size:1.15rem; font-weight:700; margin:0 0 4px;">${timeText}</p>
        <p style="color:var(--text-dim); margin:0 0 4px;">${shift.paidHours} paid hours</p>
        ${pay ? payBreakdownHtml(pay) : ''}
        <div class="edit-actions"><button class="btn" id="sheetEdit">Edit shift</button></div>`;
      document.getElementById('sheetEdit').addEventListener('click', () => openEditSheet(dateKeyStr));
    }
    document.getElementById('sheetOverlay').classList.add('open');
  }

  function closeSheet() {
    document.getElementById('sheetOverlay').classList.remove('open');
  }

  /* ================= Editing ================= */

  /** Paid hours implied by the times, less the cl 44.1(a) 30-min unpaid meal break. */
  function impliedPaidHours(start, end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60;
    return Math.round((mins / 60 - 0.5) * 100) / 100;
  }

  function openEditSheet(dateKeyStr) {
    const shift = DATA.shifts.find((s) => s.date === dateKeyStr);
    const base = BASE_SHIFTS.find((s) => s.date === dateKeyStr);
    const date = parseLocalDate(dateKeyStr);
    const isNew = !shift;
    const cur = shift || { shiftType: 'day', ...DATA.shiftTypes.day, note: '' };

    const typeOptions = Object.entries(DATA.shiftTypes)
      .map(([k, v]) => `<option value="${k}"${k === cur.shiftType ? ' selected' : ''}>${v.label}</option>`)
      .join('');

    document.getElementById('sheetContent').innerHTML = `
      <h2 style="margin:0 0 4px;">${isNew ? 'Add shift' : 'Edit shift'}</h2>
      <p style="color:var(--text-dim); margin:0 0 16px; font-size:0.9rem;">${formatFullDate(date)}</p>

      <label class="field">
        <span>Shift type</span>
        <select id="editType">${typeOptions}</select>
      </label>

      <div class="field-row">
        <label class="field"><span>Start</span><input type="time" id="editStart" value="${cur.start || '07:00'}"></label>
        <label class="field"><span>Finish</span><input type="time" id="editEnd" value="${cur.end || '15:30'}"></label>
      </div>

      <label class="field">
        <span>Paid hours</span>
        <input type="number" id="editHours" step="0.25" min="0" max="24" value="${cur.paidHours != null ? cur.paidHours : 8}">
        <small id="editHoursHint"></small>
      </label>

      <label class="field">
        <span>Note <em>(optional)</em></span>
        <input type="text" id="editNote" maxlength="40" placeholder="e.g. Buddy Shift" value="${(cur.note || '').replace(/"/g, '&quot;')}">
      </label>

      <div id="editPreview" class="edit-preview"></div>

      <div class="edit-actions">
        <button class="btn primary" id="editSave">${isNew ? 'Add shift' : 'Save changes'}</button>
        ${!isNew ? `<button class="btn danger" id="editDelete">Delete shift</button>` : ''}
        ${base && shift && shift.edited ? `<button class="btn" id="editRevert">Revert to roster</button>` : ''}
        <button class="btn" id="editCancel">Cancel</button>
      </div>`;

    const typeEl = document.getElementById('editType');
    const startEl = document.getElementById('editStart');
    const endEl = document.getElementById('editEnd');
    const hoursEl = document.getElementById('editHours');
    const hintEl = document.getElementById('editHoursHint');

    // Live pay preview so the cost impact of a change is visible before saving.
    function updatePreview() {
      const draft = {
        date: dateKeyStr,
        shiftType: typeEl.value,
        start: startEl.value,
        end: endEl.value,
        paidHours: Number(hoursEl.value) || 0,
      };
      const implied = impliedPaidHours(draft.start, draft.end);
      hintEl.textContent = `${implied}h implied by these times (30 min unpaid meal break)`;
      hintEl.className = Math.abs(implied - draft.paidHours) > 0.01 ? 'hint warn' : 'hint';

      const pay = payFor(draft);
      if (!pay) { document.getElementById('editPreview').innerHTML = ''; return; }
      const parts = [];
      if (pay.weekendPenalty > 0) parts.push(`weekend ${money(pay.weekendPenalty)}`);
      if (pay.publicHolidayPenalty > 0) parts.push(`public holiday ${money(pay.publicHolidayPenalty)}`);
      if (pay.shiftAllowance && pay.shiftAllowance.amount) parts.push(`${pay.shiftAllowance.label.toLowerCase()} ${money(pay.shiftAllowance.amount)}`);

      const old = shift ? payFor(shift) : null;
      const delta = old ? round2(pay.estimatedGross - old.estimatedGross) : null;
      const deltaText = delta ? `<span class="delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${money(delta)}</span>` : '';

      document.getElementById('editPreview').innerHTML = `
        <div class="ep-label">Estimated gross</div>
        <div class="ep-value">${money(pay.estimatedGross)} ${deltaText}</div>
        <div class="ep-parts">${parts.length ? 'Includes ' + parts.join(' · ') : 'Ordinary hours, no penalties'}</div>`;
    }

    function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

    typeEl.addEventListener('change', () => {
      const def = DATA.shiftTypes[typeEl.value];
      if (def && def.start && def.end) {
        startEl.value = def.start;
        endEl.value = def.end;
        hoursEl.value = def.paidHours;
      }
      updatePreview();
    });
    [startEl, endEl].forEach((el) =>
      el.addEventListener('change', () => {
        hoursEl.value = impliedPaidHours(startEl.value, endEl.value);
        updatePreview();
      })
    );
    hoursEl.addEventListener('input', updatePreview);
    updatePreview();

    document.getElementById('editSave').addEventListener('click', () => {
      const o = loadOverrides();
      const entry = {
        shiftType: typeEl.value,
        start: startEl.value,
        end: endEl.value,
        paidHours: Number(hoursEl.value) || 0,
      };
      const note = document.getElementById('editNote').value.trim();
      if (note) entry.note = note;
      o[dateKeyStr] = entry;
      saveOverrides(o);
      closeSheet();
      refreshAll();
    });

    const delBtn = document.getElementById('editDelete');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (!confirm(`Delete the shift on ${formatFullDate(date)}?`)) return;
        const o = loadOverrides();
        if (BASE_SHIFTS.some((s) => s.date === dateKeyStr)) o[dateKeyStr] = { deleted: true };
        else delete o[dateKeyStr];
        saveOverrides(o);
        closeSheet();
        refreshAll();
      });
    }

    const revertBtn = document.getElementById('editRevert');
    if (revertBtn) {
      revertBtn.addEventListener('click', () => {
        const o = loadOverrides();
        delete o[dateKeyStr];
        saveOverrides(o);
        closeSheet();
        refreshAll();
      });
    }

    document.getElementById('editCancel').addEventListener('click', () => openDaySheet(dateKeyStr));
    document.getElementById('sheetOverlay').classList.add('open');
  }

  /** Banner shown while the local copy differs from the published roster. */
  function renderEditBanner() {
    const el = document.getElementById('editBanner');
    if (!el) return;
    const o = loadOverrides();
    const n = Object.keys(o).length;
    if (!n) { el.classList.remove('show'); return; }
    el.classList.add('show');
    el.querySelector('.eb-text').textContent =
      `${n} local ${n === 1 ? 'change' : 'changes'} to the roster, saved on this device only.`;
  }

  function attachRowHandlers(container) {
    container.querySelectorAll('.shift-row[data-date]').forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => openDaySheet(row.getAttribute('data-date')));
    });
  }

  /* ================= Rendering: Pay ================= */

  function payTotalsRows(sum) {
    const rows = [
      ['Ordinary pay', sum.ordinaryPay, 'cl 18.3'],
      ['Shift allowances', sum.shiftAllowances, 'cl 34.3'],
      ['Weekend penalties', sum.weekendPenalties, 'cl 48.1'],
      ['Public holiday penalties', sum.publicHolidayPenalties, 'cl 56.5(a)'],
      ['Other allowances', sum.otherAllowances, ''],
      ['Meal breaks not taken', sum.missedMealBreaks, 'cl 44.1(c)'],
      ['Overtime', sum.overtime, 'cl 49.2(c)'],
    ].filter(([, v]) => v > 0);

    return rows
      .map(
        ([label, value, clause]) => `
      <div class="pay-line">
        <span class="pay-line-label">${label}${clause ? `<span class="pay-clause">${clauseChip(clause)}</span>` : ''}</span>
        <span class="pay-line-value">${money(value)}</span>
      </div>`
      )
      .join('');
  }

  function renderPay() {
    if (!window.PayEngine || !window.PayRules) {
      document.getElementById('payTotalCard').innerHTML =
        '<p style="color:var(--text-dim);">Pay engine unavailable.</p>';
      return;
    }

    const R = window.PayRules;
    const shifts = sortedShifts();
    const sum = paySummary(shifts);

    // --- Period total ---
    document.getElementById('payTotalCard').innerHTML = `
      <div class="pay-hero">
        <div class="pay-hero-label">Estimated gross pay</div>
        <div class="pay-hero-value">${money(sum.estimatedGross)}</div>
        <div class="pay-hero-meta">${sum.shiftCount} shifts · ${sum.rosteredHours} rostered hours</div>
      </div>
      ${payTotalsRows(sum)}
      <p class="pay-note">Estimate only — gross, before tax and superannuation. Excludes ${R.exclusions.length} items listed under Pay Rules Applied.</p>`;

    // --- By week ---
    const weeks = groupByWeek(shifts);
    const contracted = DATA.meta.employee.contractedWeeklyHours;
    document.getElementById('payWeekList').innerHTML = weeks
      .map((w) => {
        const ws = paySummary(w.shifts);
        const diff = ws.rosteredHours - contracted;
        const diffText =
          diff === 0
            ? 'Matches contracted weekly average'
            : `${diff > 0 ? '+' : ''}${diff} hours vs contracted average`;
        const flags = window.PayEngine.assessOvertimeIndicators(w.shifts, ws.rosteredHours);
        return `
        <div class="card fortnight-card">
          <div class="fn-title">${formatShortDate(w.monday)} – ${formatShortDate(addDays(w.monday, 6))}</div>
          <div class="fn-meta">${ws.shiftCount} shifts · ${ws.rosteredHours} rostered hours</div>
          <div class="pay-week-amount">${money(ws.estimatedGross)}</div>
          <div class="pay-hours-compare">
            <span>Contracted average: ${contracted} h</span>
            <span>Actual rostered: ${ws.rosteredHours} h</span>
            <span class="${diff > 0 ? 'over' : diff < 0 ? 'under' : ''}">${diffText}</span>
          </div>
          ${flags.map((f) => `<p class="pay-warning">⚠ ${f.text}</p>`).join('')}
        </div>`;
      })
      .join('');

    // --- By fortnight ---
    const fortnights = groupByFortnight(weeks);
    document.getElementById('payFortnightList').innerHTML = fortnights
      .map((fn) => {
        const fnShifts = fn.weeks.flatMap((w) => w.shifts);
        const fs = paySummary(fnShifts);
        const ftThreshold = R.overtime.referenceThresholds.fullTimeFortnightHours;
        return `
        <div class="card fortnight-card">
          <div class="fn-title">${formatShortDate(fn.start)} – ${formatShortDate(fn.end)}</div>
          <div class="fn-meta">${fs.shiftCount} shifts · ${fs.rosteredHours} rostered hours</div>
          <div class="pay-week-amount">${money(fs.estimatedGross)}</div>
          <div class="pay-hours-compare">
            <span>Contracted average: ${contracted * 2} h per fortnight</span>
            <span>Full-time ordinary hours: ${ftThreshold} h (cl 42.1)</span>
          </div>
        </div>`;
      })
      .join('');

    // --- Every shift ---
    document.getElementById('payShiftList').innerHTML = weeks
      .map((week) => {
        const ws = paySummary(week.shifts);
        return `
        <div class="roster-week-group">
          <div class="roster-week-header">
            <span class="rw-title">${formatShortDate(week.monday)} – ${formatShortDate(addDays(week.monday, 6))}</span>
            <span class="rw-meta">${money(ws.estimatedGross)}</span>
          </div>
          <div class="card">
            ${week.shifts
              .map((s) => {
                const p = payFor(s);
                const d = parseLocalDate(s.date);
                const tags = [];
                if (p.publicHolidayPenalty > 0) tags.push('<span class="pay-tag ph">Public holiday</span>');
                else if (p.weekendPenalty > 0) tags.push('<span class="pay-tag wknd">Weekend</span>');
                if (p.shiftAllowance && p.shiftAllowance.amount) tags.push('<span class="pay-tag alw">Shift allowance</span>');
                return `
                <div class="shift-row ${isWeekend(d) ? 'weekend-row' : ''}" data-date="${s.date}">
                  <div class="shift-chip ${s.shiftType}">${SHIFT_BADGE[s.shiftType] || '?'}</div>
                  <div class="shift-row-info">
                    <div class="shift-row-day">${DOW_SHORT[d.getDay()]}, ${formatShortDate(d)}</div>
                    <div class="shift-row-time">${s.paidHours}h · ${tags.join(' ') || 'Ordinary'}</div>
                  </div>
                  <div class="pay-row-amount">${money(p.estimatedGross)}</div>
                </div>`;
              })
              .join('')}
          </div>
        </div>`;
      })
      .join('');
    attachRowHandlers(document.getElementById('payShiftList'));

    // --- Pay rules reference ---
    const rate = R.baseHourlyRateOn(shifts.length ? shifts[0].date : '2026-09-01');
    const unverified = [];
    if (R.shiftAllowances.nightSunday.verified === false)
      unverified.push({ label: 'Sunday night shift allowance', note: R.shiftAllowances.nightSunday.verificationNote });
    if (R.shiftDefinitions.morning.verified === false)
      unverified.push({ label: 'Morning shift qualifying window', note: R.shiftDefinitions.morning.verificationNote });

    document.getElementById('payRulesCard').innerHTML = `
      <p class="contract-meta" style="margin-top:0;"><strong>${R.AGREEMENT_META.title}</strong><br>
      Operative ${R.AGREEMENT_META.operativeFrom} · nominal expiry ${R.AGREEMENT_META.nominalExpiry}</p>

      <div class="pay-line"><span class="pay-line-label">Base hourly rate<span class="pay-clause">cl 18.3 · App 2</span></span><span class="pay-line-value">${money(rate.rate)}</span></div>
      <div class="pay-line sub"><span class="pay-line-label">From weekly salary ${money(rate.weeklySalary)} ÷ 38, effective ${rate.effectiveFrom}</span><span class="pay-line-value"></span></div>
      <div class="pay-line"><span class="pay-line-label">Afternoon shift allowance<span class="pay-clause">cl 34.3</span></span><span class="pay-line-value">${money(R.rateOn(R.shiftAllowances.afternoon.table, '2026-09-01').amount)} / shift</span></div>
      <div class="pay-line"><span class="pay-line-label">Night shift allowance (Mon–Thu)<span class="pay-clause">cl 34.3(c)</span></span><span class="pay-line-value">${money(R.rateOn(R.shiftAllowances.nightMonThu.table, '2026-09-01').amount)} / shift</span></div>
      <div class="pay-line"><span class="pay-line-label">Night shift allowance (Fri/Sat)<span class="pay-clause">cl 34.3(c)</span></span><span class="pay-line-value">${money(R.rateOn(R.shiftAllowances.nightFriSat.table, '2026-09-01').amount)} / shift</span></div>
      <div class="pay-line"><span class="pay-line-label">Saturday &amp; Sunday ordinary hours<span class="pay-clause">cl 48.1</span></span><span class="pay-line-value">150%</span></div>
      <div class="pay-line"><span class="pay-line-label">Public holiday (Mon–Fri)<span class="pay-clause">cl 56.5(a)(i)</span></span><span class="pay-line-value">200%</span></div>
      <div class="pay-line"><span class="pay-line-label">Public holiday (Sat/Sun)<span class="pay-clause">cl 56.5(a)(ii)</span></span><span class="pay-line-value">250%</span></div>
      <div class="pay-line"><span class="pay-line-label">Overtime Mon–Fri<span class="pay-clause">cl 49.2(c)(i)</span></span><span class="pay-line-value">150% then 200%</span></div>
      <div class="pay-line"><span class="pay-line-label">Overtime Sat/Sun<span class="pay-clause">cl 49.2(c)(ii)</span></span><span class="pay-line-value">200%</span></div>

      <div class="pay-callout">
        <strong>Shift allowances are flat amounts per shift</strong>, not a percentage — they do not scale with shift length (cl 34.3, Appendix 2). Only one shift allowance is paid per shift (cl 34.2).
      </div>

      <div class="pay-callout">
        <strong>Hours above 32 are not treated as overtime.</strong> ${R.overtime.triggers.notATrigger}
        Overtime is applied only when explicitly recorded against a shift.
      </div>

      ${
        unverified.length
          ? `<div class="pay-callout warn"><strong>Needs verification</strong>${unverified
              .map((u) => `<p style="margin:6px 0 0;">${u.label} — ${u.note}</p>`)
              .join('')}</div>`
          : ''
      }

      <div class="pay-callout">
        <strong>Public holidays applied</strong>
        ${R.publicHolidays.dates
          .map((h) => `<p style="margin:6px 0 0;">${h.date} — ${h.name}${h.note ? `<br><span style="opacity:0.75;">${h.note}</span>` : ''}</p>`)
          .join('')}
      </div>

      <p class="contract-meta"><strong>Not included in these estimates:</strong><br>${R.exclusions.join(' · ')}</p>`;
  }

  /* ================= Navigation ================= */

  function setActiveView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(`view-${name}`).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === name);
    });
    if (name === 'roster') renderRoster();
    if (name === 'calendar') renderCalendar();
    if (name === 'stats') renderStats();
    if (name === 'pay') renderPay();
    window.scrollTo({ top: 0 });
  }

  /* ================= Theme ================= */

  function initTheme() {
    const stored = localStorage.getItem('myroster-theme');
    if (stored) document.documentElement.setAttribute('data-theme', stored);
    updateThemeButton();
  }

  function updateThemeButton() {
    const stored = localStorage.getItem('myroster-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored ? stored === 'dark' : prefersDark;
    document.getElementById('themeToggle').textContent = isDark ? '☀️' : '🌙';
  }

  function toggleTheme() {
    const stored = localStorage.getItem('myroster-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentlyDark = stored ? stored === 'dark' : prefersDark;
    const next = currentlyDark ? 'light' : 'dark';
    localStorage.setItem('myroster-theme', next);
    document.documentElement.setAttribute('data-theme', next);
    updateThemeButton();
  }

  /* ================= Install prompt ================= */

  let deferredInstallPrompt = null;

  function initInstallPrompt() {
    const banner = document.getElementById('installBanner');
    const dismissedKey = 'myroster-install-dismissed';

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (!localStorage.getItem(dismissedKey) && !window.matchMedia('(display-mode: standalone)').matches) {
        banner.classList.add('show');
      }
    });

    document.getElementById('installBtn').addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      banner.classList.remove('show');
    });

    document.getElementById('installDismiss').addEventListener('click', () => {
      localStorage.setItem(dismissedKey, '1');
      banner.classList.remove('show');
    });

    // iOS Safari has no beforeinstallprompt; show a hint banner instead.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isIos && !isStandalone && !localStorage.getItem(dismissedKey)) {
      banner.classList.add('show');
      banner.querySelector('span').textContent = 'Install: tap Share, then "Add to Home Screen".';
      document.getElementById('installBtn').style.display = 'none';
    }
  }

  /* ================= Countdown tick ================= */

  function tick() {
    const now = new Date();
    renderNextShift(now);
    renderWeekSummary(now);
    renderUpcoming(now);
  }

  /* ================= Init ================= */

  async function loadData() {
    try {
      const res = await fetch('src/data/roster.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('fetch failed');
      return await res.json();
    } catch (err) {
      return ROSTER_FALLBACK;
    }
  }

  async function init() {
    initTheme();
    DATA = await loadData();
    BASE_SHIFTS = DATA.shifts.map((s) => ({ ...s }));
    rebuildShifts();

    const now = new Date();
    calendarCursor = { year: now.getFullYear(), month: now.getMonth() };

    tick();
    setInterval(tick, 30000);

    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => setActiveView(btn.getAttribute('data-view')));
    });

    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeButton);

    document.getElementById('calPrev').addEventListener('click', () => changeCalendarMonth(-1));
    document.getElementById('calNext').addEventListener('click', () => changeCalendarMonth(1));

    document.getElementById('sheetClose').addEventListener('click', closeSheet);
    document.getElementById('sheetOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'sheetOverlay') closeSheet();
    });

    initInstallPrompt();
    renderEditBanner();

    document.getElementById('editBannerReset').addEventListener('click', () => {
      const n = Object.keys(loadOverrides()).length;
      if (!confirm(`Discard ${n} local ${n === 1 ? 'change' : 'changes'} and go back to the published roster?`)) return;
      saveOverrides({});
      refreshAll();
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
