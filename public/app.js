'use strict';

/* Front-end logic for the Tinshed Crew Roster. Plain fetch + DOM, no build
   step, no framework — the handover is the code plus `npm start`. */

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
};

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, body: data };
}

function banner(message, kind = 'error') {
  const b = $('#banner');
  b.textContent = message;
  b.className = `banner ${kind}`;
  b.classList.remove('hidden');
  setTimeout(() => b.classList.add('hidden'), 6000);
}

function info(message) {
  banner(message, 'info');
}

/* ---------- tabs ---------- */

$('#tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $(`#view-${tab.dataset.view}`).classList.add('active');
  refreshActiveView(tab.dataset.view);
});

function refreshActiveView(view) {
  if (view === 'roster') refreshRoster();
  if (view === 'productions') refreshProductions();
  if (view === 'volunteers') refreshVolunteers();
  if (view === 'schedule') refreshSchedule();
}

/* ---------- shared data ---------- */

let volunteers = [];

async function loadVolunteers() {
  const res = await api('GET', '/api/volunteers?active=all');
  volunteers = res.body;
}

function volunteerOptions(selectedId) {
  return volunteers
    .filter((v) => v.active)
    .map((v) => el('option', { value: String(v.id), text: v.name, ...(selectedId === v.id ? { selected: '' } : {}) }));
}

/* ---------- roster view ---------- */

async function refreshRoster() {
  await loadVolunteers();
  const prodSel = $('#roster-production');
  const perfSel = $('#roster-performance');
  const prevProd = prodSel.value;
  const prevPerf = perfSel.value;

  const prods = await api('GET', '/api/productions');
  prodSel.replaceChildren(el('option', { value: '', text: '— choose a production —' }));
  for (const p of prods.body) {
    prodSel.append(el('option', { value: String(p.id), text: p.title }));
  }
  if (prevProd) prodSel.value = prevProd;

  if (!prodSel.value) {
    $('#roster-grid').replaceChildren();
    return;
  }

  const perfs = await api('GET', `/api/productions/${prodSel.value}/performances`);
  perfSel.replaceChildren(el('option', { value: '', text: '— choose a performance —' }));
  for (const p of perfs.body) {
    perfSel.append(el('option', { value: String(p.id), text: `${p.date} ${p.startTime}` }));
  }
  if (prevPerf) perfSel.value = prevPerf;

  if (perfSel.value) await renderRosterGrid(perfSel.value);
  else $('#roster-grid').replaceChildren();
}

async function renderRosterGrid(performanceId) {
  const res = await api('GET', `/api/performances/${performanceId}/roster`);
  const grid = $('#roster-grid');
  grid.replaceChildren();

  let holes = 0;
  for (const position of res.body) {
    const people = position.assignments
      .map((a) => {
        const confirmed = a.confirmed ? '' : ' (unconfirmed)';
        return el('span', { text: `${a.volunteerName}${confirmed}` });
      });
    if (people.length === 0) {
      people.push(el('span', { class: 'hole', text: '— open —' }));
    }

    const assignSelect = el('select', {});
    assignSelect.append(el('option', { value: '', text: 'assign…' }));
    for (const opt of volunteerOptions()) assignSelect.append(opt);
    const assignBtn = el('button', { class: 'small', text: 'Assign' });
    assignBtn.addEventListener('click', async () => {
      if (!assignSelect.value) return;
      const r = await api('POST', `/api/performances/${performanceId}/assignments`, {
        volunteerId: Number(assignSelect.value),
        role: position.role,
      });
      if (r.status === 201) info(`${assignSelect.selectedOptions[0].text} assigned to ${position.role}.`);
      else banner(r.body?.error || 'Assignment failed.');
      renderRosterGrid(performanceId);
    });

    if (position.open > 0) holes += 1;
    const gap = position.open > 0
      ? el('span', { class: 'gap-badge', text: `${position.open} open` })
      : el('span', { class: 'ok', text: 'full' });

    grid.append(
      el('div', { class: 'roster-row' },
        el('span', { class: 'roster-role', text: `${position.role} ×${position.required}` }),
        el('span', { class: 'roster-people' }, ...people),
        el('span', { class: 'roster-assign' }, assignSelect, assignBtn, gap)
      )
    );
  }
  if (holes > 0) banner(`${holes} position(s) in the call are still open.`, 'info');
}

$('#roster-production').addEventListener('change', refreshRoster);
$('#roster-performance').addEventListener('change', (e) => {
  if (e.target.value) renderRosterGrid(e.target.value);
});
$('#roster-refresh').addEventListener('click', refreshRoster);

/* ---------- productions view ---------- */

$('#production-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('#production-title').value.trim();
  if (!title) return;
  const res = await api('POST', '/api/productions', { title });
  if (res.status === 201) {
    info(`Production "${title}" created.`);
    $('#production-title').value = '';
    refreshProductions();
  } else {
    banner(res.body?.error || 'Could not create production.');
  }
});

async function refreshProductions() {
  const prods = await api('GET', '/api/productions');
  const list = $('#production-list');
  list.replaceChildren();

  if (prods.body.length === 0) {
    list.append(el('p', { text: 'No productions yet. Add the first one above.' }));
    return;
  }

  for (const prod of prods.body) {
    const detail = await api('GET', `/api/productions/${prod.id}`);
    const card = el('div', { class: 'card production-card' },
      el('h2', { text: prod.title })
    );

    if (detail.body.performances.length === 0) {
      card.append(el('p', { text: 'No performances recorded.' }));
    }
    for (const perf of detail.body.performances) {
      const line = el('div', { class: 'perf-line' },
        el('span', { class: 'date', text: `${perf.date} · ${perf.startTime}` }),
        el('button', { class: 'small secondary', text: 'Remove' })
      );
      line.querySelector('button').addEventListener('click', async () => {
        await api('DELETE', `/api/productions/${prod.id}/performances/${perf.id}`);
        refreshProductions();
      });
      card.append(line);
    }

    const addForm = el('div', { class: 'perf-line' });
    const date = el('input', { type: 'date', value: '2026-09-04' });
    const time = el('input', { type: 'time', value: '19:30' });
    const call = el('select', {},
      el('option', { value: 'evening', text: 'evening call' }),
      el('option', { value: 'matinee', text: 'matinee call' })
    );
    const addBtn = el('button', { class: 'small', text: 'Add performance' });
    addBtn.addEventListener('click', async () => {
      const r = await api('POST', `/api/productions/${prod.id}/performances`, {
        date: date.value,
        startTime: time.value,
        callTemplate: call.value,
      });
      if (r.status === 201) refreshProductions();
      else banner(r.body?.error || 'Could not add performance.');
    });
    addForm.append(date, time, call, addBtn);
    card.append(addForm);

    const removeProd = el('button', { class: 'small secondary', text: 'Remove production' });
    removeProd.addEventListener('click', async () => {
      await api('DELETE', `/api/productions/${prod.id}`);
      refreshProductions();
    });
    card.append(el('div', { style: 'margin-top:8px' }, removeProd));

    list.append(card);
  }
}

/* ---------- volunteers view ---------- */

$('#volunteer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    name: $('#volunteer-name').value.trim(),
    phone: $('#volunteer-phone').value.trim(),
    email: $('#volunteer-email').value.trim(),
    emergency_contact: $('#volunteer-emergency').value.trim(),
  };
  const res = await api('POST', '/api/volunteers', payload);
  if (res.status === 201) {
    info(`Volunteer "${payload.name}" added.`);
    e.target.reset();
    refreshVolunteers();
  } else {
    banner(res.body?.error || 'Could not add volunteer.');
  }
});

async function refreshVolunteers() {
  const showInactive = $('#volunteer-show-inactive').checked;
  const res = await api('GET', `/api/volunteers${showInactive ? '?active=all' : ''}`);
  const list = $('#volunteer-list');
  list.replaceChildren();

  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { text: 'Name' }), el('th', { text: 'Phone' }),
      el('th', { text: 'Email' }), el('th', { text: 'Status' }), el('th', { text: '' })
    ))
  );
  const tbody = el('tbody', {});
  for (const v of res.body) {
    const deactivateBtn = v.active
      ? el('button', { class: 'small secondary', text: 'Make inactive' })
      : el('span', { text: 'inactive', style: 'color:#a03030' });
    if (v.active) {
      deactivateBtn.addEventListener('click', async () => {
        await api('POST', `/api/volunteers/${v.id}/deactivate`);
        refreshVolunteers();
      });
    }
    const actions = el('td', {}, deactivateBtn);
    const row = el('tr', {},
      el('td', { text: v.name }),
      el('td', { text: v.phone }),
      el('td', { text: v.email || '—' }),
      el('td', { text: v.active ? 'active' : 'inactive' }),
      actions
    );
    if (v.active) {
      const unavBtn = el('button', { class: 'small secondary', text: 'Unavailable…' });
      unavBtn.addEventListener('click', () => toggleUnavailabilityPanel(v, row));
      actions.prepend(unavBtn);
    }
    tbody.append(row);
  }
  table.append(tbody);
  list.append(table);
}

/* Inline panel per volunteer row: list recorded unavailability and add/remove
   ranges. The API refuses assignments that clash with these ranges. */
function toggleUnavailabilityPanel(volunteer, row) {
  const existing = row.nextElementSibling;
  if (existing && existing.dataset.panel === String(volunteer.id)) {
    existing.remove();
    return;
  }
  const panelRow = el('tr', { class: 'unavailability-panel', 'data-panel': String(volunteer.id) });
  const cell = el('td', { colspan: '5' });
  panelRow.append(cell);

  const render = async () => {
    cell.replaceChildren();
    const res = await api('GET', `/api/volunteers/${volunteer.id}/unavailability`);
    const list = el('ul', { class: 'unavailability-list' });
    if (res.body.length === 0) {
      list.append(el('li', { text: 'No unavailable dates recorded.' }));
    }
    for (const u of res.body) {
      const remove = el('button', { class: 'small secondary', text: 'Remove' });
      remove.addEventListener('click', async () => {
        await api('DELETE', `/api/volunteers/${volunteer.id}/unavailability/${u.id}`);
        render();
      });
      list.append(el('li', {},
        el('span', { text: `${u.startsOn} – ${u.endsOn}${u.reason ? ` · ${u.reason}` : ''}` }),
        remove
      ));
    }

    const starts = el('input', { type: 'date', value: '2026-09-11' });
    const ends = el('input', { type: 'date', value: '2026-09-13' });
    const reason = el('input', { type: 'text', placeholder: 'reason (optional)' });
    const add = el('button', { class: 'small', text: 'Add range' });
    add.addEventListener('click', async () => {
      const r = await api('POST', `/api/volunteers/${volunteer.id}/unavailability`, {
        startsOn: starts.value,
        endsOn: ends.value,
        reason: reason.value.trim() || undefined,
      });
      if (r.status === 201) render();
      else banner(r.body?.error || 'Could not record unavailability.');
    });

    cell.append(
      el('p', { class: 'panel-title', text: `Unavailable dates — ${volunteer.name}` }),
      list,
      el('div', { class: 'perf-line' }, starts, ends, reason, add)
    );
  };

  render();
  row.after(panelRow);
}

$('#volunteer-show-inactive').addEventListener('change', refreshVolunteers);

/* ---------- my schedule view ---------- */

async function refreshSchedule() {
  await loadVolunteers();
  const sel = $('#schedule-volunteer');
  const prev = sel.value;
  sel.replaceChildren(el('option', { value: '', text: '— choose a volunteer —' }));
  for (const opt of volunteerOptions()) sel.append(opt);
  if (prev) sel.value = prev;
  if (sel.value) await renderSchedule(sel.value);
  else $('#schedule-list').replaceChildren();
}

async function renderSchedule(volunteerId) {
  const res = await api('GET', `/api/volunteers/${volunteerId}/assignments`);
  const list = $('#schedule-list');
  list.replaceChildren();

  if (res.body.length === 0) {
    list.append(el('p', { text: 'No assignments yet — enjoy the quiet.' }));
    return;
  }

  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { text: 'Production' }), el('th', { text: 'Date' }),
      el('th', { text: 'Start' }), el('th', { text: 'Role' }), el('th', { text: 'Confirmed' })
    ))
  );
  const tbody = el('tbody', {});
  for (const row of res.body) {
    tbody.append(el('tr', {},
      el('td', { text: row.production }),
      el('td', { text: row.date }),
      el('td', { text: row.startTime }),
      el('td', { text: row.role }),
      el('td', { text: row.confirmed ? 'yes' : 'no', class: row.confirmed ? 'ok' : 'unconfirmed' })
    ));
  }
  table.append(tbody);
  list.append(table);
}

$('#schedule-volunteer').addEventListener('change', (e) => {
  if (e.target.value) renderSchedule(e.target.value);
  else $('#schedule-list').replaceChildren();
});
$('#schedule-refresh').addEventListener('click', refreshSchedule);

/* ---------- boot ---------- */

refreshRoster();
