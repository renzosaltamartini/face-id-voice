const $ = id => document.getElementById(id);
const icons = {
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  inbox: '<path d="M4 10l3-6h10l3 6v9H4z"/><path d="M4 11h5l2 3h2l2-3h5"/>',
  edit: '<path d="M12 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-7M10 14l1-4 8-8 3 3-8 8z"/>',
  home: '<path d="M3 11l9-8 9 8-2 1v8h-5v-5h-4v5H5v-8z"/>',
  library: '<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="9" y="4" width="4" height="16" rx="1"/><path d="M16 4l3-1 4 16-4 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  file: '<path d="M6 2h8l5 5v14H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM14 2v6h5M8 12h7m-7 4h7"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  panel: '<path d="M13 5h6v14h-6M3 12h12m-8-4-4 4 4 4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  grip: '<path d="M9 4h.01M15 4h.01M9 12h.01m6 0h.01M9 20h.01m6 0h.01" stroke-width="3"/>',
  text: '<path d="M5 6V4h14v2M12 4v16m-3 0h6"/>',
  heading: '<path d="M5 5v14M19 5v14M5 12h14"/>',
  bullet: '<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
  number: '<path d="M10 6h11m-11 6h11m-11 6h11M4 8V3L2 4m0 8c0-2 4-2 4 0 0 2-4 3-4 5h4"/>',
  todo: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>',
  quote: '<path d="M5 13h5v6H4v-6c0-4 2-6 5-7m7 7h5v6h-6v-6c0-4 2-6 5-7"/>',
  minus: '<path d="M4 12h16"/>',
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = icons[name];
  return svg;
}

function iconButton(name, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.append(icon(name));
  return button;
}

document.querySelectorAll('[data-icon]').forEach(element => element.prepend(icon(element.dataset.icon)));

const title = $('title');
const documentView = $('document');
const folderDialog = $('folderDialog');
const searchDialog = $('searchDialog');
const actionsDialog = $('actionsDialog');
const mobile = matchMedia('(max-width: 720px)');
const editor = new BlockEditor(queueSave);
let token = sessionStorage.getItem(sessionKey) || rememberedSession();
let folders = [], pages = [], folderId = null, page = null, saved = null;
let saveTimer, saveTask, statusTimer, editingFolder, searchMode;
let ready = false, navigating = false, started = false, savingFolder = false;

function pageIdFromUrl() {
  const id = new URLSearchParams(location.search).get('page');
  return validRoomPageId(id) ? id : null;
}

function signIn() {
  const id = pageIdFromUrl();
  location.replace(homePath + '?next=room' + (id ? '&page=' + id : ''));
}

function request(route, body = {}) {
  return api(route, { token, ...body });
}

function setStatus(message = '', error = false) {
  clearTimeout(statusTimer);
  const status = $('status');
  status.textContent = message;
  status.hidden = !message;
  status.dataset.error = String(error);
  if (message && !error) statusTimer = setTimeout(() => setStatus(), 2600);
}

function setSidebar(open) {
  $('layout').dataset.sidebar = open ? 'open' : 'closed';
  $('showSidebar').hidden = open;
  $('showSidebar').setAttribute('aria-expanded', String(open));
  $('sidebarBackdrop').hidden = !open || !mobile.matches;
}

function row(label, symbol) {
  const button = document.createElement('button');
  button.className = 'sidebar-row';
  const span = document.createElement('span');
  span.className = 'row-title';
  span.textContent = label;
  button.title = label;
  button.append(icon(symbol), span);
  return button;
}

function pageRow(item, includeFolder = false) {
  const button = row(item.title, 'file');
  if (item.id === page?.id) button.setAttribute('aria-current', 'page');
  if (includeFolder) {
    const name = document.createElement('span');
    name.className = 'search-folder row-title';
    name.textContent = folders.find(folder => folder.id === item.folderId)?.name ?? '';
    button.append(name);
  }
  button.onclick = () => {
    if (searchDialog.open) searchDialog.close();
    openPage(item.id, item.folderId);
  };
  return button;
}

function note(message) {
  const p = document.createElement('p');
  p.className = 'sidebar-note';
  p.textContent = message;
  return p;
}

function renderSidebar() {
  const folderList = $('folders');
  folderList.replaceChildren();
  for (const folder of folders) {
    const item = document.createElement('div');
    item.className = 'folder-row';
    item.dataset.current = String(folder.id === folderId);
    const button = row(folder.name, 'folder');
    button.setAttribute('aria-pressed', item.dataset.current);
    button.onclick = () => {
      if (folder.id === folderId) return;
      const firstPage = pages.find(item => item.folderId === folder.id);
      openPage(firstPage?.id, folder.id);
    };
    const more = iconButton('more', 'Opciones de ' + folder.name);
    more.onclick = () => folderActions(folder);
    item.append(button, more);
    folderList.append(item);
  }
  if (!folders.length) folderList.append(note('Tus carpetas aparecerán acá.'));
  const list = $('pages');
  list.replaceChildren();
  if (page && !page.id) {
    const draft = row(title.value.trim() || 'Nueva página', 'file');
    draft.setAttribute('aria-current', 'page');
    draft.onclick = () => title.focus();
    list.append(draft);
  }
  for (const item of pages.filter(item => item.folderId === folderId)) list.append(pageRow(item));
  if (!list.children.length) list.append(note('Todavía no hay páginas.'));
}

function updatePageBar() {
  const name = title.value.trim();
  $('pageLabel').textContent = name || 'Nueva página';
  $('breadcrumb').hidden = !page?.id && !started;
  $('pageActions').hidden = $('breadcrumb').hidden;
  $('sharePage').hidden = !page?.id;
  $('editedAt').textContent = page?.updatedAt
    ? 'Última edición ' + new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(page.updatedAt)
    : '';
  document.title = name ? name + ' · Room' : 'Room · Renx';
}

function beginEditing() {
  if (started) return;
  started = true;
  $('starter').hidden = true;
  $('blocks').hidden = false;
  editor.fit();
  updatePageBar();
}

function showPage(item, focusTitle = false) {
  clearTimeout(saveTimer);
  page = item;
  folderId = item.folderId ?? null;
  started = Boolean(item.id);
  title.value = item.title;
  documentView.hidden = false;
  $('starter').hidden = started;
  $('blocks').hidden = !started;
  editor.setContent(item.content);
  saved = snapshot();
  fitText(title);
  updatePageBar();
  renderSidebar();
  $('main').scrollTop = 0;
  if (focusTitle) title.focus({ preventScroll: true });
}

function snapshot() {
  return { title: title.value.trim(), content: editor.content };
}

function dirty() {
  if (!page || !saved) return false;
  const current = snapshot();
  return current.title !== saved.title || current.content !== saved.content;
}

function queueSave() {
  if (!page) return;
  clearTimeout(saveTimer);
  if (!dirty()) return;
  saveTimer = setTimeout(() => saveNow(), 650);
}

async function ensureFolder() {
  if (folderId) return folderId;
  const defaultFolder = folders.find(item => item.name === 'Páginas');
  if (defaultFolder) return defaultFolder.id;
  const { id } = await request('/room/folders/save', { name: 'Páginas' });
  folders.push({ id, name: 'Páginas' });
  folderId = id;
  page.folderId = id;
  renderSidebar();
  return id;
}

function saveNow() {
  clearTimeout(saveTimer);
  if (saveTask) return saveTask;
  if (!dirty()) return Promise.resolve(true);
  const current = snapshot();
  if (current.content.length > 10000) {
    setStatus('La página admite hasta 10.000 caracteres. Acortá el contenido para guardar.', true);
    return Promise.resolve(false);
  }
  saveTask = (async () => {
    try {
      const pageFolder = await ensureFolder();
      const label = current.title || 'Sin título';
      const result = await request('/room/pages/save', {
        id: page.id, folderId: pageFolder, revision: page.revision,
        title: label, content: current.content,
      });
      const wasDraft = !page.id;
      Object.assign(page, result, { folderId: pageFolder, title: label, content: current.content });
      folderId = pageFolder;
      saved = current;
      pages = [{ id: page.id, folderId, title: label, updatedAt: page.updatedAt }, ...pages.filter(item => item.id !== page.id)];
      if (wasDraft && !navigating) history.replaceState(null, '', roomUrl(page.id));
      setStatus();
      updatePageBar();
      renderSidebar();
      if (dirty()) queueSave();
      return true;
    } catch (error) {
      setStatus(error.message, true);
      return false;
    } finally {
      saveTask = null;
    }
  })();
  return saveTask;
}

async function flushChanges() {
  while (saveTask || dirty()) {
    if (!await saveNow()) return false;
  }
  return true;
}

async function openPage(id, preferredFolder = folderId, { fromHistory = false, focus = false } = {}) {
  if (!ready || navigating) return;
  if (id && page?.id === id) {
    if (mobile.matches) setSidebar(false);
    return;
  }
  navigating = true;
  try {
    const item = id
      ? await request('/room/pages/get', { id })
      : { id: null, folderId: preferredFolder, title: '', content: '', revision: 0 };
    if (!await flushChanges() && !confirm('¿Descartar los cambios sin guardar?')) {
      if (fromHistory) history.replaceState(null, '', roomUrl(page?.id));
      return;
    }
    if (!fromHistory && page?.id && !pageIdFromUrl()) history.replaceState(null, '', roomUrl(page.id));
    const url = roomUrl(item.id);
    if (!fromHistory && location.pathname + location.search !== url) history.pushState(null, '', url);
    setStatus();
    if (mobile.matches) setSidebar(false);
    showPage(item, focus || !item.id);
  } catch (error) {
    if (fromHistory) history.replaceState(null, '', roomUrl(page?.id));
    setStatus(error.message, true);
  } finally {
    navigating = false;
  }
}

function normalizeSearch(value) {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function renderSearch() {
  const query = normalizeSearch($('searchInput').value.trim());
  const results = pages.filter(item => normalizeSearch(item.title).includes(query));
  const visible = !query && searchMode === 'recent' ? results.slice(0, 12) : results;
  $('searchResults').replaceChildren(...(visible.length ? visible.map(item => pageRow(item, true)) : [note('No se encontraron páginas.')]));
}

function openSearch(mode) {
  if (!ready) return;
  editor.closePicker();
  searchMode = mode;
  $('searchInput').placeholder = mode === 'recent' ? 'Buscar páginas recientes...' : 'Buscar páginas...';
  $('searchInput').value = '';
  renderSearch();
  searchDialog.showModal();
  $('searchInput').focus();
}

function showActions(name, actions) {
  $('actionsTitle').textContent = name;
  const list = $('actionList');
  list.replaceChildren();
  for (const { label, danger, run } of actions) {
    const button = document.createElement('button');
    button.className = 'sidebar-row' + (danger ? ' danger' : '');
    button.textContent = label;
    button.onclick = () => {
      actionsDialog.close();
      run();
    };
    list.append(button);
  }
  actionsDialog.showModal();
}

function openFolderDialog(folder = null) {
  editingFolder = folder;
  $('folderDialogTitle').textContent = folder ? 'Renombrar carpeta' : 'Nueva carpeta';
  $('folderName').value = folder?.name ?? '';
  $('folderError').hidden = true;
  folderDialog.showModal();
  $('folderName').focus();
}

function folderActions(folder) {
  showActions(folder.name, [
    { label: 'Nueva página', run: () => openPage(null, folder.id, { focus: true }) },
    { label: 'Renombrar carpeta', run: () => openFolderDialog(folder) },
    { label: 'Borrar carpeta', danger: true, run: () => deleteFolder(folder) },
  ]);
}

async function deleteFolder(folder) {
  if (navigating || !confirm('¿Borrar esta carpeta y todas sus páginas?')) return;
  navigating = true;
  try {
    documentView.inert = folder.id === folderId;
    if (documentView.inert && !await flushChanges()) return;
    await request('/room/folders/delete', { id: folder.id });
    folders = folders.filter(item => item.id !== folder.id);
    pages = pages.filter(item => item.folderId !== folder.id);
    if (folder.id === folderId) {
      history.replaceState(null, '', roomUrl());
      showPage({ id: null, folderId: folders[0]?.id, title: '', content: '', revision: 0 });
    } else {
      renderSidebar();
    }
    setStatus('Carpeta borrada.');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    documentView.inert = false;
    navigating = false;
  }
}

async function deletePage() {
  if (!page?.id || navigating || !confirm('¿Borrar esta página?')) return;
  navigating = true;
  try {
    documentView.inert = true;
    if (!await flushChanges()) return;
    await request('/room/pages/delete', { id: page.id });
    pages = pages.filter(item => item.id !== page.id);
    history.replaceState(null, '', roomUrl());
    showPage({ id: null, folderId, title: '', content: '', revision: 0 });
    setStatus('Página borrada.');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    documentView.inert = false;
    navigating = false;
  }
}

async function loadRoom() {
  $('loadError').hidden = true;
  if (!token) { signIn(); return; }
  try {
    const [account, data] = await Promise.all([request('/me'), request('/room/list')]);
    sessionStorage.setItem(sessionKey, token);
    $('workspaceName').textContent = 'De ' + account.name + ' ' + account.surname;
    $('workspaceInitial').textContent = account.name.slice(0, 1).toUpperCase();
    folders = data.folders;
    pages = data.pages;
    const requestedId = pageIdFromUrl();
    let item = null;
    let missingPage = false;
    if (requestedId || pages[0]) {
      try {
        item = await request('/room/pages/get', { id: requestedId || pages[0].id });
      } catch (error) {
        if (error.status !== 404) throw error;
        missingPage = true;
      }
    }
    item ??= { id: null, folderId: folders[0]?.id, title: '', content: '', revision: 0 };
    history.replaceState(null, '', roomUrl(item.id));
    ready = true;
    document.querySelectorAll('[data-ready]').forEach(button => { button.disabled = false; });
    showPage(item, !item.id && !mobile.matches);
    if (missingPage) setStatus('La página ya no está disponible en tu cuenta.', true);
  } catch (error) {
    if (error.status === 401) {
      if (rememberedSession() === token) setRememberedSession(null);
      sessionStorage.removeItem(sessionKey);
      token = null;
      signIn();
      return;
    }
    $('loadErrorText').textContent = error.message;
    $('loadError').hidden = false;
  }
}

$('panelLink').href = panelPath;
$('hideSidebar').onclick = () => { setSidebar(false); $('showSidebar').focus(); };
$('showSidebar').onclick = () => { setSidebar(true); $('hideSidebar').focus(); };
$('sidebarBackdrop').onclick = () => setSidebar(false);
mobile.addEventListener('change', event => setSidebar(!event.matches));
setSidebar(!mobile.matches);
if (/Mac|iPhone|iPad/.test(navigator.platform)) $('searchShortcut').textContent = '⌘K';
$('searchPages').onclick = $('library').onclick = () => openSearch('all');
$('recentPages').onclick = () => openSearch('recent');
$('searchInput').oninput = renderSearch;
$('searchInput').onkeydown = event => {
  if (event.key === 'Enter') $('searchResults').querySelector('button')?.click();
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    $('searchResults').querySelector('button')?.focus();
  }
};
$('roomHome').onclick = () => {
  const recent = pages[0];
  if (recent) openPage(recent.id, recent.folderId);
  else openPage(null, folders[0]?.id, { focus: true });
};
$('newPage').onclick = $('quickPage').onclick = $('newPrivatePage').onclick = () => openPage(null, folderId, { focus: true });
$('newFolder').onclick = () => openFolderDialog();
$('cancelFolder').onclick = () => folderDialog.close();
folderDialog.addEventListener('cancel', event => { if (savingFolder) event.preventDefault(); });
$('folderForm').onsubmit = async event => {
  event.preventDefault();
  if (savingFolder) return;
  savingFolder = true;
  $('saveFolder').disabled = $('cancelFolder').disabled = true;
  $('folderError').hidden = true;
  const name = $('folderName').value.trim();
  try {
    const { id } = await request('/room/folders/save', { id: editingFolder?.id, name });
    if (editingFolder) editingFolder.name = name;
    else folders.push({ id, name });
    folders.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    folderDialog.close();
    renderSidebar();
    if (!editingFolder) await openPage(null, id, { focus: true });
  } catch (error) {
    $('folderError').textContent = error.message;
    $('folderError').hidden = false;
  } finally {
    savingFolder = false;
    $('saveFolder').disabled = $('cancelFolder').disabled = false;
  }
};

title.oninput = () => {
  title.value = title.value.replace(/[\r\n]+/g, ' ');
  fitText(title);
  if (title.value.trim()) beginEditing();
  updatePageBar();
  const selected = $('pages').querySelector('[aria-current="page"] .row-title');
  if (selected) {
    selected.textContent = title.value.trim() || 'Nueva página';
    selected.parentElement.title = selected.textContent;
  }
  queueSave();
};
title.onkeydown = event => {
  if (!event.isComposing && (event.key === 'Enter' || (event.key === 'ArrowDown' && title.selectionEnd === title.value.length))) {
    event.preventDefault();
    beginEditing();
    editor.start('text');
  }
};
documentView.onclick = event => {
  if (event.target !== documentView) return;
  beginEditing();
  editor.focus(editor.blocks.at(-1));
};
document.querySelectorAll('[data-start]').forEach(button => {
  button.onclick = () => { beginEditing(); editor.start(button.dataset.start); };
});
$('pageMenu').onclick = () => {
  const actions = [{ label: 'Guardar ahora', run: () => saveNow() }];
  if (page?.id) actions.push({ label: 'Borrar página', danger: true, run: deletePage });
  showActions(title.value.trim() || 'Nueva página', actions);
};
$('sharePage').onclick = () => {
  $('shareUrl').value = new URL(roomUrl(page.id), location.origin).href;
  $('shareDialog').showModal();
};
$('copyLink').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('shareUrl').value);
    $('shareDialog').close();
    setStatus('Enlace copiado.');
  } catch {
    $('shareUrl').select();
  }
};
for (const dialog of [searchDialog, actionsDialog, $('shareDialog')]) {
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
$('retryLoad').onclick = loadRoom;
window.addEventListener('popstate', () => openPage(pageIdFromUrl(), folderId, { fromHistory: true }));
window.addEventListener('resize', () => { if (ready) fitText(title); });
window.addEventListener('beforeunload', event => {
  if (dirty() || saveTask) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('keydown', event => {
  if (!ready || !(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    openSearch('all');
  }
  if (event.key.toLowerCase() === 's' && page) {
    event.preventDefault();
    saveNow();
  }
});
loadRoom();
