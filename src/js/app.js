(() => {
  'use strict';

  /* ---------- Embedded fallback data (used if roster.json can't be fetched, e.g. opened via file://) ---------- */
  const ROSTER_FALLBACK = {
    "meta": {
      "periodLabel": "September - October 2026",
      "employee": {
        "position": "Registered Nurse",
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
      { "date": "2026-09-02", "day": "Wednesday", "shiftType": "day", "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-03", "day": "Thursday",  "shiftType": "day", "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-04", "day": "Friday",    "shiftType": "day", "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-07", "day": "Monday",    "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-08", "day": "Tuesday",   "shiftType": "day", "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-09", "day": "Wednesday", "shiftType": "day", "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-12", "day": "Saturday",  "shiftType": "day", "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-13", "day": "Sunday",    "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-14", "day": "Monday",    "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-16", "day": "Wednesday", "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-19", "day": "Saturday",  "shiftType": "day", "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-21", "day": "Monday",    "shiftType": "day", "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-22", "day": "Tuesday",   "shiftType": "day", "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-24", "day": "Thursday",  "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-25", "day": "Friday",    "shiftType": "afternoon", "start": "13:00", "end": "21:30", "paidHours": 8 },
      { "date": "2026-09-29", "day": "Tuesday",   "shiftType": "day", "start": "07:00", "end": "15:30", "paidHours": 8 },
      { "date": "2026-09-30", "day": "Wednesday", "shiftType": "day", "start": "07:00", "end": "15:30", "paidHours": 8 },
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
  let calendarCursor = null; // {year, month} month is 0-indexed, for the Calendar view

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

    el.innerHTML = `
      <div class="week-card-main">
        <div class="week-title">${formatShortDate(monday)} – ${formatShortDate(addDays(monday, 6))}</div>
        <div class="week-hours">${hours} <small>/ ${contracted} hrs</small></div>
        <div class="week-note">${note}</div>
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
          <div class="shift-row-day">${DOW_SHORT[date.getDay()]}, ${formatShortDate(date)}${weekend ? '<span class="weekend-tag">Weekend</span>' : ''}</div>
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
              return `<div class="${isWeekend(d) ? 'weekend-row' : ''}">${shiftRowHtml(s)}</div>`;
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

  /* ================= Day detail sheet ================= */

  function openDaySheet(dateKeyStr) {
    const date = parseLocalDate(dateKeyStr);
    const shift = DATA.shifts.find((s) => s.date === dateKeyStr);
    const content = document.getElementById('sheetContent');

    if (!shift) {
      content.innerHTML = `
        <h2 style="margin:0 0 6px;">${formatFullDate(date)}</h2>
        <p style="color:var(--text-dim); margin:0;">Day off — no shift rostered.</p>`;
    } else {
      const info = shiftTypeInfo(shift.shiftType);
      const timeText = shift.start && shift.end ? `${formatTime12(shift.start)} to ${formatTime12(shift.end)}` : `${info.paidHours} hour shift`;
      content.innerHTML = `
        <h2 style="margin:0 0 10px;">${formatFullDate(date)}</h2>
        <div class="next-shift-type" style="background:var(--accent-dim); color:var(--accent); margin-bottom:12px;">${info.label}</div>
        <p style="font-size:1.15rem; font-weight:700; margin:0 0 4px;">${timeText}</p>
        <p style="color:var(--text-dim); margin:0;">${shift.paidHours} paid hours</p>`;
    }
    document.getElementById('sheetOverlay').classList.add('open');
  }

  function closeSheet() {
    document.getElementById('sheetOverlay').classList.remove('open');
  }

  function attachRowHandlers(container) {
    container.querySelectorAll('.shift-row[data-date]').forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => openDaySheet(row.getAttribute('data-date')));
    });
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

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
