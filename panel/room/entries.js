const entryLabels = { reminder: 'Recordatorios', date: 'Fechas', expense: 'Gastos' };
const entriesDialog = $('entriesDialog');
const entriesForm = $('entriesForm');
const entryMoney = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const entryDate = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' });
let entryKind;
let entries = [];
let entryBusy = false;

function renderEntries() {
  const sorted = [...entries].sort((a, b) => a.day.localeCompare(b.day));
  const list = $('entriesList');
  list.replaceChildren();
  if (!sorted.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Todavía no hay entradas.';
    list.append(empty);
  }
  const total = $('entriesTotal');
  total.hidden = entryKind !== 'expense';
  total.textContent = 'Total · ' + entryMoney.format(sorted.reduce((sum, entry) => sum + entry.cents, 0) / 100);
  for (const entry of sorted) {
    const item = document.createElement('li');
    const title = document.createElement('span');
    title.className = 'entry-label';
    title.textContent = entry.title;
    if (entryKind === 'reminder') {
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = Boolean(entry.done);
      check.setAttribute('aria-label', 'Marcar como hecho: ' + entry.title);
      check.onchange = () => {
        const done = check.checked;
        updateEntries(async kind => {
          await request('/room/entries/toggle', { kind, id: entry.id, done });
          entry.done = Number(done);
        });
      };
      item.append(check);
      title.classList.toggle('entry-done', Boolean(entry.done));
    }
    const details = document.createElement('small');
    details.textContent = entryDate.format(new Date(entry.day + 'T00:00:00Z')) +
      (entryKind === 'expense' ? ' · ' + entryMoney.format(entry.cents / 100) : '');
    const text = document.createElement('div');
    text.append(title, details);
    const remove = iconButton('trash', 'Borrar ' + entry.title);
    remove.onclick = () => updateEntries(async kind => {
      await request('/room/entries/remove', { kind, id: entry.id });
      entries = entries.filter(item => item.id !== entry.id);
    });
    item.append(text, remove);
    list.append(item);
  }
}

async function updateEntries(action) {
  if (entryBusy) return;
  entryBusy = true;
  $('entriesStatus').textContent = '';
  $('entriesList').inert = true;
  entriesForm.inert = true;
  try {
    await action(entryKind);
  } catch (error) {
    $('entriesStatus').textContent = error.message;
  } finally {
    entryBusy = false;
    $('entriesList').inert = false;
    entriesForm.inert = false;
    renderEntries();
  }
}

function openEntries(kind) {
  if (entryBusy) return;
  entryKind = kind;
  entries = [];
  entriesForm.reset();
  const expense = kind === 'expense';
  $('entriesHeading').textContent = entryLabels[kind];
  $('entryAmountField').hidden = !expense;
  $('entryAmount').required = expense;
  const today = new Date();
  $('entryDay').value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  renderEntries();
  entriesDialog.showModal();
  updateEntries(async () => {
    $('entriesStatus').textContent = 'Cargando…';
    const result = await request('/room/entries/list', { kind });
    entries = result.entries;
    $('entriesStatus').textContent = '';
  });
}

document.querySelectorAll('[data-entry-kind]').forEach(button => {
  button.onclick = () => openEntries(button.dataset.entryKind);
});
entriesForm.onsubmit = event => {
  event.preventDefault();
  const title = $('entryTitle').value;
  const day = $('entryDay').value;
  const cents = Math.round(Number($('entryAmount').value) * 100);
  updateEntries(async kind => {
    const entry = await request('/room/entries/add', { kind, title, day, cents });
    entries.push(entry);
    $('entryTitle').value = '';
    $('entryAmount').value = '';
  });
};
