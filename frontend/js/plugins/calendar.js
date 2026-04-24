/**
 * Butler — Calendar Plugin (frontend)
 *
 * Month-view calendar with event CRUD, task toggles, and group filtering.
 * Architecture: type 'full' — takes over #main-content.
 * Data: markdown files with YAML frontmatter in content/calendar/.
 */

let $root = null;
let butlerRef = null;
let currentDate = new Date();
let currentView = 'month';
let events = [];
let groups = new Set();
let hiddenGroups = new Set();

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const GROUP_COLORS = {
  red:    { bg: 'rgba(242,93,93,0.18)',  border: '#f25d5d', text: '#f25d5d' },
  orange: { bg: 'rgba(242,160,61,0.18)', border: '#f2a03d', text: '#f2a03d' },
  yellow: { bg: 'rgba(230,212,77,0.18)', border: '#e6d44d', text: '#e6d44d' },
  green:  { bg: 'rgba(12,242,93,0.14)',  border: '#0CF25D', text: '#0CF25D' },
  blue:   { bg: 'rgba(93,184,242,0.18)', border: '#5db8f2', text: '#5db8f2' },
  purple: { bg: 'rgba(168,130,242,0.18)',border: '#a882f2', text: '#a882f2' },
};

function gc(group) {
  return GROUP_COLORS[group] || GROUP_COLORS.blue;
}

// ─── API ────────────────────────────────────────────────────

async function fetchEvents(year, month) {
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = new Date(year, month + 1, 1);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-01`;
  try {
    const { events: evts } = await butlerRef.api.get(
      `/api/calendar/events?start=${start}&end=${end}`
    );
    return evts;
  } catch (e) {
    butlerRef.toast(`Calendar: ${e.message}`, 'error');
    return [];
  }
}

async function fetchAllEvents() {
  try {
    const { events: evts } = await butlerRef.api.get('/api/calendar/events');
    return evts;
  } catch (e) {
    butlerRef.toast(`Calendar: ${e.message}`, 'error');
    return [];
  }
}

async function saveEvent(data, filename = null) {
  try {
    if (filename) {
      await butlerRef.api.put(`/api/calendar/events/${filename}`, data);
    } else {
      await butlerRef.api.post('/api/calendar/events', data);
    }
    await refresh();
    butlerRef.toast('Event saved', 'success');
  } catch (e) {
    butlerRef.toast(`Save failed: ${e.message}`, 'error');
  }
}

async function deleteEvent(filename) {
  try {
    await butlerRef.api.del(`/api/calendar/events/${filename}`);
    await refresh();
    butlerRef.toast('Event deleted', 'success');
  } catch (e) {
    butlerRef.toast(`Delete failed: ${e.message}`, 'error');
  }
}

async function toggleDone(ev) {
  const data = { ...ev, done: !ev.done };
  delete data.filename;
  delete data.body;
  data.body = ev.body || '';
  await saveEvent(data, ev.filename);
}

// ─── Render ─────────────────────────────────────────────────

async function refresh() {
  if (currentView === 'year') {
    events = await fetchAllEvents();
  } else {
    events = await fetchEvents(currentDate.getFullYear(), currentDate.getMonth());
  }

  // Collect groups
  groups.clear();
  events.forEach(e => { if (e.group) groups.add(e.group); });

  render();
}

function render() {
  if (!$root) return;
  $root.innerHTML = '';
  $root.appendChild(buildToolbar());

  switch (currentView) {
    case 'month': $root.appendChild(buildMonthView()); break;
    case 'week':  $root.appendChild(buildWeekView()); break;
    case 'day':   $root.appendChild(buildDayView()); break;
    case 'year':  $root.appendChild(buildYearView()); break;
  }
}

// ─── Toolbar ────────────────────────────────────────────────

function buildToolbar() {
  const bar = el('div', 'cal-toolbar');

  // Nav arrows
  const navGroup = el('div', 'cal-nav-group');
  const btnPrev = el('button', 'cal-nav-btn');
  btnPrev.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10 4L6 8l4 4"/></svg>';
  btnPrev.addEventListener('click', () => navigate(-1));

  const btnNext = el('button', 'cal-nav-btn');
  btnNext.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>';
  btnNext.addEventListener('click', () => navigate(1));

  // Period label
  const label = el('button', 'cal-period-label');
  label.textContent = periodLabel();
  label.addEventListener('click', () => showMiniCalendar(label));

  navGroup.append(btnPrev, label, btnNext);

  // View selector
  const viewSel = el('div', 'cal-view-selector');
  for (const v of ['day', 'week', 'month', 'year']) {
    const btn = el('button', `cal-view-btn ${v === currentView ? 'active' : ''}`);
    btn.textContent = v.charAt(0).toUpperCase() + v.slice(1);
    btn.addEventListener('click', () => {
      currentView = v;
      refresh();
    });
    viewSel.appendChild(btn);
  }

  // Group filter
  const filterBtn = el('button', 'cal-filter-btn');
  filterBtn.innerHTML = '🎨 <span>Filter</span>';
  filterBtn.addEventListener('click', (e) => showGroupFilter(e));

  // New event button
  const newBtn = el('button', 'cal-new-btn');
  newBtn.textContent = '+ New';
  newBtn.addEventListener('click', () => showEventPopup());

  bar.append(navGroup, viewSel, filterBtn, newBtn);
  return bar;
}

function periodLabel() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  switch (currentView) {
    case 'year':  return `${y}`;
    case 'month': return `${MONTHS[m]} ${y}`;
    case 'week': {
      const wk = getWeekDates(currentDate);
      const s = wk[0], e = wk[6];
      if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]} ${y}`;
      return `${s.getDate()} ${MONTHS[s.getMonth()].slice(0,3)} – ${e.getDate()} ${MONTHS[e.getMonth()].slice(0,3)} ${y}`;
    }
    case 'day': return `${currentDate.getDate()} ${MONTHS[m]} ${y}`;
  }
}

function navigate(dir) {
  switch (currentView) {
    case 'year':  currentDate.setFullYear(currentDate.getFullYear() + dir); break;
    case 'month': currentDate.setMonth(currentDate.getMonth() + dir); break;
    case 'week':  currentDate.setDate(currentDate.getDate() + 7 * dir); break;
    case 'day':   currentDate.setDate(currentDate.getDate() + dir); break;
  }
  refresh();
}

// ─── Month View ─────────────────────────────────────────────

function buildMonthView() {
  const grid = el('div', 'cal-month-grid');

  // Header row
  const headerRow = el('div', 'cal-month-header');
  for (const wd of WEEKDAYS) {
    const cell = el('div', 'cal-month-hcell');
    cell.textContent = wd;
    headerRow.appendChild(cell);
  }
  grid.appendChild(headerRow);

  // Build day cells
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Monday-based: getDay() returns 0=Sun, we want Mon=0
  let startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = startOffset + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);

  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

  for (let r = 0; r < rows; r++) {
    const row = el('div', 'cal-month-row');
    for (let c = 0; c < 7; c++) {
      const idx = r * 7 + c;
      const dayNum = idx - startOffset + 1;

      const cell = el('div', 'cal-day-cell');

      if (dayNum < 1 || dayNum > lastDay.getDate()) {
        cell.classList.add('cal-day-empty');
        row.appendChild(cell);
        continue;
      }

      const isToday = isThisMonth && dayNum === today.getDate();
      if (isToday) cell.classList.add('cal-day-today');

      // Day number
      const num = el('div', 'cal-day-num');
      num.textContent = dayNum;
      cell.appendChild(num);

      // Events for this day
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const dayEvents = getEventsForDate(dateStr).filter(e => !hiddenGroups.has(e.group));

      for (const ev of dayEvents.slice(0, 3)) {
        const chip = el('div', `cal-event-chip ${ev.type === 'task' ? 'cal-task-chip' : ''}`);
        const color = gc(ev.group);
        chip.style.background = color.bg;
        chip.style.borderLeftColor = color.border;

        const title = el('span', 'cal-chip-title');
        title.textContent = ev.title || '(untitled)';
        chip.appendChild(title);

        if (ev.type === 'task') {
          const toggle = el('span', `cal-task-toggle ${ev.done ? 'done' : ''}`);
          toggle.innerHTML = ev.done ? '✓' : '';
          toggle.addEventListener('click', (e) => { e.stopPropagation(); toggleDone(ev); });
          chip.appendChild(toggle);
        }

        chip.addEventListener('click', (e) => { e.stopPropagation(); showEventPopup(ev); });
        cell.appendChild(chip);
      }

      if (dayEvents.length > 3) {
        const more = el('div', 'cal-more');
        more.textContent = `+${dayEvents.length - 3} more`;
        more.addEventListener('click', (e) => {
          e.stopPropagation();
          showDayPopup(dateStr, dayEvents);
        });
        cell.appendChild(more);
      }

      cell.addEventListener('click', () => showEventPopup(null, dateStr));
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }

  return grid;
}

// ─── Week View ──────────────────────────────────────────────

function getWeekDates(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function buildWeekView() {
  const wrap = el('div', 'cal-week-wrap');
  const dates = getWeekDates(currentDate);
  const today = new Date();

  // Header
  const header = el('div', 'cal-week-header');
  const corner = el('div', 'cal-time-corner');
  header.appendChild(corner);
  for (let i = 0; i < 7; i++) {
    const d = dates[i];
    const hCell = el('div', 'cal-week-hcell');
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) hCell.classList.add('cal-day-today');
    hCell.innerHTML = `<span class="cal-wh-day">${WEEKDAYS[i]}</span><span class="cal-wh-num">${d.getDate()}</span>`;
    header.appendChild(hCell);
  }
  wrap.appendChild(header);

  // Time grid
  const grid = el('div', 'cal-week-grid');
  for (let h = 0; h < 24; h++) {
    const row = el('div', 'cal-week-row');
    const timeLabel = el('div', 'cal-time-label');
    timeLabel.textContent = `${String(h).padStart(2, '0')}:00`;
    row.appendChild(timeLabel);

    for (let i = 0; i < 7; i++) {
      const cell = el('div', 'cal-week-cell');
      const d = dates[i];
      const dateStr = isoDate(d);
      const cellEvents = getEventsForDate(dateStr)
        .filter(e => !hiddenGroups.has(e.group))
        .filter(e => {
          const st = e.start || e.date;
          if (!st) return h === 0;
          const hour = new Date(st).getHours();
          return hour === h;
        });

      for (const ev of cellEvents) {
        const chip = el('div', 'cal-week-event');
        const color = gc(ev.group);
        chip.style.background = color.bg;
        chip.style.borderLeftColor = color.border;
        chip.textContent = ev.title || '(untitled)';
        chip.addEventListener('click', (e) => { e.stopPropagation(); showEventPopup(ev); });
        cell.appendChild(chip);
      }

      cell.addEventListener('click', () => {
        const dt = new Date(d);
        dt.setHours(h, 0, 0, 0);
        showEventPopup(null, null, dt);
      });
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  wrap.appendChild(grid);
  return wrap;
}

// ─── Day View ───────────────────────────────────────────────

function buildDayView() {
  const wrap = el('div', 'cal-day-wrap');
  const dateStr = isoDate(currentDate);
  const dayEvents = getEventsForDate(dateStr).filter(e => !hiddenGroups.has(e.group));

  // Header
  const header = el('div', 'cal-dayview-header');
  header.innerHTML = `<span class="cal-dayview-title">${currentDate.getDate()} ${MONTHS[currentDate.getMonth()]}</span>
    <span class="cal-dayview-weekday">${WEEKDAYS[(currentDate.getDay() + 6) % 7]}</span>`;
  wrap.appendChild(header);

  const grid = el('div', 'cal-day-grid');
  for (let h = 0; h < 24; h++) {
    const row = el('div', 'cal-day-row');
    const timeLabel = el('div', 'cal-time-label');
    timeLabel.textContent = `${String(h).padStart(2, '0')}:00`;
    row.appendChild(timeLabel);

    const content = el('div', 'cal-day-content');
    const hourEvents = dayEvents.filter(e => {
      const st = e.start || e.date;
      if (!st) return h === 0;
      return new Date(st).getHours() === h;
    });

    for (const ev of hourEvents) {
      const card = el('div', 'cal-day-event-card');
      const color = gc(ev.group);
      card.style.background = color.bg;
      card.style.borderLeftColor = color.border;

      card.innerHTML = `
        <div class="cal-de-title">${esc(ev.title || '(untitled)')}</div>
        ${ev.location ? `<div class="cal-de-location">📍 ${esc(ev.location)}</div>` : ''}
        ${ev.type === 'task' ? `<div class="cal-de-task">${ev.done ? '✅ Done' : '⬜ To do'}</div>` : ''}
        ${ev.body ? `<div class="cal-de-body">${esc(ev.body).substring(0, 120)}</div>` : ''}
      `;

      card.addEventListener('click', () => showEventPopup(ev));
      content.appendChild(card);
    }

    content.addEventListener('click', (e) => {
      if (e.target === content) {
        const dt = new Date(currentDate);
        dt.setHours(h, 0, 0, 0);
        showEventPopup(null, null, dt);
      }
    });
    row.appendChild(content);
    grid.appendChild(row);
  }
  wrap.appendChild(grid);
  return wrap;
}

// ─── Year View ──────────────────────────────────────────────

function buildYearView() {
  const wrap = el('div', 'cal-year-grid');
  const year = currentDate.getFullYear();
  const today = new Date();

  for (let m = 0; m < 12; m++) {
    const card = el('div', 'cal-year-month');
    const title = el('div', 'cal-ym-title');
    title.textContent = MONTHS[m];
    title.addEventListener('click', () => {
      currentDate = new Date(year, m, 1);
      currentView = 'month';
      refresh();
    });
    card.appendChild(title);

    // Mini weekday header
    const hdr = el('div', 'cal-ym-header');
    for (const d of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
      const c = el('span', 'cal-ym-hd');
      c.textContent = d;
      hdr.appendChild(c);
    }
    card.appendChild(hdr);

    // Days grid
    const first = new Date(year, m, 1);
    const last = new Date(year, m + 1, 0);
    const offset = (first.getDay() + 6) % 7;

    const daysWrap = el('div', 'cal-ym-days');
    for (let i = 0; i < offset; i++) {
      daysWrap.appendChild(el('span', 'cal-ym-day empty'));
    }

    for (let d = 1; d <= last.getDate(); d++) {
      const dayEl = el('span', 'cal-ym-day');
      dayEl.textContent = d;

      const isToday = today.getFullYear() === year && today.getMonth() === m && today.getDate() === d;
      if (isToday) dayEl.classList.add('today');

      // Check for events
      const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvs = getEventsForDate(dateStr).filter(e => !hiddenGroups.has(e.group));
      if (dayEvs.length > 0) {
        const mainGroup = dayEvs[0].group;
        const color = gc(mainGroup);
        dayEl.style.background = color.bg;
        dayEl.style.color = color.text;
        dayEl.addEventListener('click', (e) => {
          e.stopPropagation();
          showDayPopup(dateStr, dayEvs);
        });
      }

      daysWrap.appendChild(dayEl);
    }
    card.appendChild(daysWrap);
    wrap.appendChild(card);
  }

  return wrap;
}

// ─── Event Popup (Create/Edit) ──────────────────────────────

function showEventPopup(ev = null, dateStr = null, dt = null) {
  const isEdit = !!ev;
  const overlay = el('div', 'cal-overlay');

  const popup = el('div', 'cal-popup');
  popup.innerHTML = `
    <h3>${isEdit ? 'Edit Event' : 'New Event'}</h3>
    <div class="cal-form">
      <label>Title<input type="text" id="cal-f-title" value="${esc(ev?.title || '')}" /></label>
      <div class="cal-form-row">
        <label class="cal-type-group">
          ${['event', 'task'].map(t =>
            `<button class="cal-type-btn ${(ev?.type || 'event') === t ? 'active' : ''}" data-type="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`
          ).join('')}
        </label>
      </div>
      <div class="cal-form-row">
        <label>Start<input type="datetime-local" id="cal-f-start" value="${dtLocalValue(ev, dateStr, dt)}" /></label>
        <label>End<input type="datetime-local" id="cal-f-end" value="${dtLocalValueEnd(ev)}" /></label>
      </div>
      <div class="cal-form-row">
        <label>Group
          <select id="cal-f-group">
            ${Object.keys(GROUP_COLORS).map(g =>
              `<option value="${g}" ${(ev?.group || 'blue') === g ? 'selected' : ''}>${g}</option>`
            ).join('')}
          </select>
        </label>
        <label>Location<input type="text" id="cal-f-location" value="${esc(ev?.location || '')}" /></label>
      </div>
      <label>Notes<textarea id="cal-f-body" rows="3">${esc(ev?.body || '')}</textarea></label>
    </div>
    <div class="cal-popup-actions">
      ${isEdit ? '<button class="cal-btn-delete">Delete</button>' : ''}
      <span class="cal-spacer"></span>
      <button class="cal-btn-discard">Discard</button>
      <button class="cal-btn-save">Save</button>
    </div>
  `;

  // Type toggle
  let selectedType = ev?.type || 'event';
  popup.querySelectorAll('.cal-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      popup.querySelectorAll('.cal-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
    });
  });

  // Actions
  popup.querySelector('.cal-btn-discard')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  popup.querySelector('.cal-btn-save')?.addEventListener('click', async () => {
    const data = {
      title: popup.querySelector('#cal-f-title').value.trim(),
      type: selectedType,
      start: popup.querySelector('#cal-f-start').value ? new Date(popup.querySelector('#cal-f-start').value).toISOString() : null,
      end: popup.querySelector('#cal-f-end').value ? new Date(popup.querySelector('#cal-f-end').value).toISOString() : null,
      group: popup.querySelector('#cal-f-group').value,
      location: popup.querySelector('#cal-f-location').value.trim() || null,
      body: popup.querySelector('#cal-f-body').value.trim(),
    };
    if (selectedType === 'task') {
      data.date = data.start;
      data.done = ev?.done || false;
    }
    overlay.remove();
    await saveEvent(data, isEdit ? ev.filename : null);
  });

  popup.querySelector('.cal-btn-delete')?.addEventListener('click', async () => {
    if (confirm(`Delete "${ev.title}"?`)) {
      overlay.remove();
      await deleteEvent(ev.filename);
    }
  });

  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  popup.querySelector('#cal-f-title')?.focus();
}

function showDayPopup(dateStr, dayEvents) {
  const overlay = el('div', 'cal-overlay');
  const popup = el('div', 'cal-popup cal-day-popup');

  const parts = dateStr.split('-');
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  popup.innerHTML = `<h3>${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}</h3>`;

  const list = el('div', 'cal-day-list');
  for (const ev of dayEvents) {
    const item = el('div', 'cal-day-list-item');
    const color = gc(ev.group);
    item.style.borderLeftColor = color.border;

    const time = ev.start ? new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All day';
    item.innerHTML = `
      <span class="cal-dl-time">${time}</span>
      <span class="cal-dl-title">${esc(ev.title || '(untitled)')}</span>
      ${ev.type === 'task' ? `<span class="cal-task-toggle ${ev.done ? 'done' : ''}">${ev.done ? '✓' : ''}</span>` : ''}
    `;
    item.addEventListener('click', () => { overlay.remove(); showEventPopup(ev); });

    const taskToggle = item.querySelector('.cal-task-toggle');
    if (taskToggle) {
      taskToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        overlay.remove();
        toggleDone(ev);
      });
    }

    list.appendChild(item);
  }
  popup.appendChild(list);

  const actions = el('div', 'cal-popup-actions');
  const closeBtn = el('button', 'cal-btn-discard');
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => overlay.remove());
  const newBtn = el('button', 'cal-btn-save');
  newBtn.textContent = '+ New';
  newBtn.addEventListener('click', () => { overlay.remove(); showEventPopup(null, dateStr); });
  actions.append(closeBtn, newBtn);
  popup.appendChild(actions);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}

// ─── Group Filter ───────────────────────────────────────────

function showGroupFilter(e) {
  // Remove existing
  document.querySelector('.cal-group-dropdown')?.remove();

  const dd = el('div', 'cal-group-dropdown');
  for (const g of Object.keys(GROUP_COLORS)) {
    const row = el('label', 'cal-gf-row');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !hiddenGroups.has(g);
    cb.addEventListener('change', () => {
      if (cb.checked) hiddenGroups.delete(g);
      else hiddenGroups.add(g);
      render();
    });

    const swatch = el('span', 'cal-gf-swatch');
    swatch.style.background = gc(g).border;

    const label = el('span', 'cal-gf-label');
    label.textContent = g;

    row.append(cb, swatch, label);
    dd.appendChild(row);
  }

  const rect = e.target.closest('button').getBoundingClientRect();
  dd.style.top = rect.bottom + 4 + 'px';
  dd.style.left = rect.left + 'px';
  document.body.appendChild(dd);

  const close = (ev) => {
    if (!dd.contains(ev.target)) { dd.remove(); document.removeEventListener('click', close); }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

// ─── Mini Calendar (date picker) ────────────────────────────

function showMiniCalendar(anchor) {
  document.querySelector('.cal-mini-dropdown')?.remove();

  let miniDate = new Date(currentDate);
  const dd = el('div', 'cal-mini-dropdown');

  function renderMini() {
    dd.innerHTML = '';
    const y = miniDate.getFullYear();
    const m = miniDate.getMonth();

    const hdr = el('div', 'cal-mini-header');
    const prev = el('button', 'cal-mini-nav');
    prev.textContent = '‹';
    prev.addEventListener('click', (e) => { e.stopPropagation(); miniDate.setMonth(m - 1); renderMini(); });
    const next = el('button', 'cal-mini-nav');
    next.textContent = '›';
    next.addEventListener('click', (e) => { e.stopPropagation(); miniDate.setMonth(m + 1); renderMini(); });
    const title = el('span', 'cal-mini-title');
    title.textContent = `${MONTHS[m]} ${y}`;
    hdr.append(prev, title, next);
    dd.appendChild(hdr);

    const wdRow = el('div', 'cal-mini-row');
    for (const d of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
      const c = el('span', 'cal-mini-cell cal-mini-hd');
      c.textContent = d;
      wdRow.appendChild(c);
    }
    dd.appendChild(wdRow);

    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const offset = (first.getDay() + 6) % 7;
    const today = new Date();

    let row = el('div', 'cal-mini-row');
    for (let i = 0; i < offset; i++) {
      row.appendChild(el('span', 'cal-mini-cell'));
    }
    for (let d = 1; d <= last.getDate(); d++) {
      const c = el('span', 'cal-mini-cell cal-mini-day');
      c.textContent = d;
      if (today.getFullYear() === y && today.getMonth() === m && today.getDate() === d) c.classList.add('today');
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        currentDate = new Date(y, m, d);
        dd.remove();
        refresh();
      });
      row.appendChild(c);
      if ((offset + d) % 7 === 0) {
        dd.appendChild(row);
        row = el('div', 'cal-mini-row');
      }
    }
    if (row.children.length > 0) dd.appendChild(row);
  }
  renderMini();

  const rect = anchor.getBoundingClientRect();
  dd.style.top = rect.bottom + 4 + 'px';
  dd.style.left = rect.left + 'px';
  document.body.appendChild(dd);

  const close = (ev) => {
    if (!dd.contains(ev.target) && ev.target !== anchor) { dd.remove(); document.removeEventListener('click', close); }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

// ─── Helpers ────────────────────────────────────────────────

function el(tag, cls = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML.replace(/"/g, '&quot;');
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getEventsForDate(dateStr) {
  return events.filter(ev => {
    const st = ev.start || ev.date;
    if (!st) return false;
    // Compare using local date to avoid UTC timezone shift
    const d = new Date(st);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return local === dateStr;
  });
}

function dtLocalValue(ev, dateStr, dt) {
  if (ev?.start) return toLocalInput(ev.start);
  if (ev?.date) return toLocalInput(ev.date);
  if (dt) return toLocalInput(dt.toISOString());
  if (dateStr) return `${dateStr}T09:00`;
  return '';
}

function dtLocalValueEnd(ev) {
  if (ev?.end) return toLocalInput(ev.end);
  return '';
}

function toLocalInput(iso) {
  try {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

// ─── Plugin Interface ───────────────────────────────────────

async function init(container, butler) {
  butlerRef = butler;
  $root = container;
  $root.classList.add('cal-root');
  await refresh();
}

export default {
  name: 'calendar',
  type: 'full',
  label: 'Calendar',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 8h16M7 4v4m10-4v4"/><rect x="3" y="6" width="18" height="16" rx="2"/>
  </svg>`,
  init,
  activate() {},
  deactivate() {},
};
