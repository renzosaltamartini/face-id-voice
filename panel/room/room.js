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
  move: '<path d="M4 12h16m-4-4 4 4-4 4"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  wallet: '<path d="M20 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v12H5a2 2 0 0 1-2-2V6m17 7h-4"/>',
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
let newFolderParent = null;
let browsingFolder = false;
const editor = new BlockEditor(queueSave);
let token = sessionStorage.getItem(sessionKey) || rememberedSession();
let folders = [], pages = [], folderId = null, page = null, saved = null;
let saveTimer, saveTask, statusTimer, editingFolder, searchMode;
let stopLive, ownerConflict, queueSharedSave;
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
  $('sidebar').inert = !open;
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
  if (includeFolder) return button;
  const itemRow = document.createElement('div');
  itemRow.className = 'folder-row page-row';
  itemRow.dataset.current = String(item.id === page?.id);
  const more = iconButton('more', 'Opciones de ' + item.title);
  more.onclick = () => pageActions(item);
  itemRow.append(button, more);
  return itemRow;
}

function note(message) {
  const p = document.createElement('p');
  p.className = 'sidebar-note';
  p.textContent = message;
  return p;
}

function folderPath(id) {
  const path = [];
  for (let folder = folders.find(item => item.id === id); folder; folder = folders.find(item => item.id === folder.parentId)) {
    if (path.includes(folder)) break;
    path.unshift(folder);
  }
  return path;
}

const folderExpansion = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let draggedEntry;

function siblingEntries(isFolder, parent) {
  return (isFolder ? folders : pages)
    .filter(entry => (isFolder ? entry.parentId ?? null : entry.folderId) === parent)
    .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity));
}

function bindTreeDrag(element, item, isFolder) {
  element.dataset.treeKey = (isFolder ? 'folder-' : 'page-') + item.id;
  element.draggable = true;
  element.addEventListener('dragstart', event => {
    draggedEntry = { item, isFolder };
    event.dataTransfer.setData('text/plain', item.id);
    event.dataTransfer.effectAllowed = 'move';
  });
  element.addEventListener('dragend', () => { draggedEntry = null; delete element.dataset.drop; });
  function position(event) {
    if (!draggedEntry || draggedEntry.item.id === item.id) return null;
    if (isFolder && draggedEntry.isFolder && folderPath(item.id).includes(draggedEntry.item)) return null;
    const bounds = element.getBoundingClientRect();
    const y = (event.clientY - bounds.top) / bounds.height;
    const sameParent = isFolder === draggedEntry.isFolder && (isFolder
      ? (item.parentId ?? null) === (draggedEntry.item.parentId ?? null)
      : item.folderId === draggedEntry.item.folderId);
    if (sameParent && (!isFolder || y < .27 || y > .73)) return y < .5 ? 'before' : 'after';
    return isFolder ? 'inside' : null;
  }
  element.addEventListener('dragover', event => {
    const target = position(event);
    if (!target) { delete element.dataset.drop; return; }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    element.dataset.drop = target;
  });
  element.addEventListener('dragleave', event => {
    if (!element.contains(event.relatedTarget)) delete element.dataset.drop;
  });
  element.addEventListener('drop', event => {
    const target = position(event);
    delete element.dataset.drop;
    if (!target) return;
    event.preventDefault();
    const source = draggedEntry;
    draggedEntry = null;
    if (target === 'inside') {
      const from = source.isFolder ? source.item.parentId : source.item.folderId;
      if (from !== item.id) moveItem(source.item, source.isFolder, item.id);
    } else {
      reorderEntry(source.item, item, isFolder, target === 'after');
    }
  });
}

async function reorderEntry(source, target, isFolder, after) {
  if (navigating) return;
  navigating = true;
  documentView.inert = true;
  try {
    if (!await flushChanges()) return;
    const parentId = isFolder ? target.parentId ?? null : target.folderId;
    const siblings = siblingEntries(isFolder, parentId);
    const ordered = siblings.filter(item => item.id !== source.id);
    ordered.splice(ordered.findIndex(item => item.id === target.id) + Number(after), 0,
      siblings.find(item => item.id === source.id));
    await request('/room/order', { kind: isFolder ? 'folder' : 'page', parentId, ids: ordered.map(item => item.id) });
    ordered.forEach((item, index) => { item.sortOrder = index; });
    renderSidebar();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    documentView.inert = false;
    navigating = false;
  }
}

function renderSidebar() {
  const folderList = $('folders');
  const previous = new Map(reducedMotion.matches ? [] :
    [...folderList.querySelectorAll('[data-tree-key]')].map(element =>
      [element.dataset.treeKey, { element, bounds: element.getBoundingClientRect() }]));
  folderList.replaceChildren();
  const expanded = new Set(folderPath(folderId).map(item => item.id));
  function appendFolders(parent, depth) {
    for (const folder of siblingEntries(true, parent)) {
      const item = document.createElement('div');
      item.className = 'folder-row';
      item.style.marginInlineStart = Math.min(depth, 6) * 12 + 'px';
      item.dataset.current = String(folder.id === folderId);
      const button = row(folder.name, 'folder');
      button.setAttribute('aria-pressed', item.dataset.current);
      const isExpanded = folderExpansion.get(folder.id) ?? expanded.has(folder.id);
      button.onclick = () => {
        folderExpansion.set(folder.id, true);
        openPage(null, folder.id, { browse: true });
      };
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'icon-button tree-toggle';
      toggle.textContent = '›';
      toggle.setAttribute('aria-label', (isExpanded ? 'Plegar ' : 'Desplegar ') + folder.name);
      toggle.setAttribute('aria-expanded', String(isExpanded));
      toggle.onclick = () => {
        folderExpansion.set(folder.id, !isExpanded);
        renderSidebar();
        folderList.querySelector('[data-tree-key="folder-' + folder.id + '"] .tree-toggle')?.focus();
      };
      const more = iconButton('more', 'Opciones de ' + folder.name);
      more.onclick = () => folderActions(folder);
      const count = document.createElement('span');
      count.className = 'folder-count';
      count.setAttribute('aria-hidden', 'true');
      count.textContent = pages.filter(entry => entry.folderId === folder.id).length + folders.filter(entry => entry.parentId === folder.id).length;
      button.append(count);
      item.append(toggle, button, more);
      bindTreeDrag(item, folder, true);
      folderList.append(item);
      if (isExpanded) {
        if (folder.id === folderId && page && !page.id && !browsingFolder) appendDraft(depth + 1);
        for (const entry of siblingEntries(false, folder.id)) {
          const pageEntry = pageRow(entry);
          pageEntry.style.marginInlineStart = Math.min(depth + 1, 7) * 12 + 'px';
          bindTreeDrag(pageEntry, entry, false);
          folderList.append(pageEntry);
        }
        appendFolders(folder.id, depth + 1);
      }
    }
  }
  function appendDraft(depth) {
    const draft = row(title.value.trim() || 'Nueva página', 'file');
    draft.setAttribute('aria-current', 'page');
    draft.style.marginInlineStart = Math.min(depth, 7) * 12 + 'px';
    draft.style.width = 'calc(100% - ' + draft.style.marginInlineStart + ')';
    draft.onclick = () => title.focus();
    folderList.append(draft);
  }
  appendFolders(null, 0);
  if (!folders.length) folderList.append(note('Tus carpetas aparecerán acá.'));
  if (!folderId && page && !page.id && !browsingFolder) appendDraft(0);
  if (!reducedMotion.matches && previous.size) {
    for (const element of folderList.querySelectorAll('[data-tree-key]')) {
      const top = previous.get(element.dataset.treeKey)?.bounds.top;
      previous.delete(element.dataset.treeKey);
      const offset = top === undefined ? -5 : top - element.getBoundingClientRect().top;
      if (offset) element.animate(
        [{ transform: 'translateY(' + offset + 'px)', opacity: top === undefined ? 0 : 1 }, { transform: 'none', opacity: 1 }],
        { duration: 210, easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
    const viewport = folderList.closest('.sidebar-scroll').getBoundingClientRect();
    for (const { element, bounds } of previous.values()) {
      if (bounds.bottom <= viewport.top || bounds.top >= viewport.bottom) continue;
      element.inert = true;
      element.classList.add('tree-exit');
      Object.assign(element.style, { top: bounds.top + 'px', left: bounds.left + 'px', width: bounds.width + 'px', margin: '0' });
      document.body.append(element);
      const fade = element.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-5px)' }], 140);
      fade.onfinish = () => element.remove();
    }
  }
  renderFolderContents();
}

function renderFolderContents() {
  const view = $('folderContents');
  view.hidden = !browsingFolder;
  if (!browsingFolder) return;
  const path = folderPath(folderId);
  $('folderPath').replaceChildren(...path.map((folder, index) => {
    const button = row(folder.name, 'folder');
    if (index === path.length - 1) button.setAttribute('aria-current', 'page');
    button.onclick = () => openPage(null, folder.id, { browse: true });
    return button;
  }));
  $('folderHeading').textContent = path.at(-1)?.name ?? 'Carpetas';
  const children = siblingEntries(true, folderId).map(folder => {
    const button = row(folder.name, 'folder');
    button.onclick = () => openPage(null, folder.id, { browse: true });
    return button;
  });
  const entries = [...children, ...siblingEntries(false, folderId).map(item => pageRow(item))];
  $('folderEntries').replaceChildren(...(entries.length ? entries : [note('Esta carpeta está vacía.')]));
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

function showPage(item, focusTitle = false, browse = false) {
  stopLive?.();
  ownerConflict = null;
  browsingFolder = browse;
  clearTimeout(saveTimer);
  page = item;
  folderId = item.folderId ?? null;
  started = Boolean(item.id);
  title.value = item.title;
  documentView.hidden = browse;
  documentView.getAnimations().forEach(animation => animation.cancel());
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    (browse ? $('folderContents') : documentView).animate([{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 200, easing: 'ease-out' });
  }
  saveFeedback(item.id ? 'Guardado' : '');
  $('starter').hidden = started;
  $('blocks').hidden = !started;
  editor.setContent(item.content);
  saved = snapshot();
  fitText(title);
  updatePageBar();
  renderSidebar();
  $('main').scrollTop = 0;
  if (item.id && !browse) startOwnerLive(item);
  if (focusTitle) title.focus({ preventScroll: true });
}

function snapshot() {
  return { title: title.value.trim(), content: editor.content };
}

function applyLiveDraft(draft) {
  const focused = document.activeElement;
  const blockIndex = editor.blocks.findIndex(block => block.input === focused);
  const selection = focused instanceof HTMLTextAreaElement ? [focused.selectionStart, focused.selectionEnd] : [];
  if (title.value.trim() !== draft.title) {
    title.value = draft.title;
    fitText(title);
    if (focused === title) title.setSelectionRange(...selection);
  }
  if (editor.content !== draft.content) {
    editor.setContent(draft.content);
    const replacement = editor.blocks[blockIndex]?.input;
    if (replacement) {
      replacement.focus({ preventScroll: true });
      replacement.setSelectionRange(...selection);
    }
  }
  updatePageBar();
}

function startOwnerLive(item) {
  stopLive?.();
  stopLive = liveRoom(documentView, data => request('/room/pages/live', { id: item.id, ...data }), remote => {
    if (page !== item || saveTask || remote.revision <= item.revision || remote.permission === 'off') return;
    const base = saved;
    const merged = mergeRoomDraft(base, snapshot(), remote);
    if (!merged) {
      ownerConflict = remote;
      clearTimeout(saveTimer);
      saveFeedback('Cambios en conflicto');
      setStatus('Ambos editaron la misma parte. Usá Ctrl+S o ⌘S para resolver el conflicto.', true);
      return;
    }
    ownerConflict = null;
    Object.assign(item, { revision: remote.revision, title: remote.title, content: remote.content, updatedAt: remote.updatedAt });
    saved = { title: remote.title, content: remote.content };
    applyLiveDraft(merged);
    const entry = pages.find(candidate => candidate.id === item.id);
    if (entry) Object.assign(entry, { title: remote.title, updatedAt: remote.updatedAt });
    renderSidebar();
    setStatus();
    queueSave();
  }, () => {});
}

function dirty() {
  if (!page || !saved) return false;
  const current = snapshot();
  return current.title !== saved.title || current.content !== saved.content;
}

function saveFeedback(message) {
  $('saveFeedback').textContent = message;
}

function queueSave() {
  if (queueSharedSave) { queueSharedSave(); return; }
  if (!page || ownerConflict) return;
  clearTimeout(saveTimer);
  saveFeedback(dirty() ? 'Cambios pendientes' : page.id ? 'Guardado' : '');
  if (!dirty()) return;
  saveTimer = setTimeout(() => saveNow(), 650);
}

async function ensureFolder() {
  if (folderId) return folderId;
  const defaultFolder = folders.find(item => item.name === 'Páginas' && !item.parentId);
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
  if (ownerConflict) return Promise.resolve(false);
  if (!dirty()) return Promise.resolve(true);
  const current = snapshot();
  if (current.content.length > 10000) {
    saveFeedback('Pendiente');
    setStatus('La página admite hasta 10.000 caracteres. Acortá el contenido para guardar.', true);
    return Promise.resolve(false);
  }
  saveFeedback('Guardando…');
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
      const sortOrder = pages.find(item => item.id === page.id)?.sortOrder;
      pages = [{ id: page.id, folderId, title: label, updatedAt: page.updatedAt, sortOrder }, ...pages.filter(item => item.id !== page.id)];
      if (wasDraft) {
        if (!navigating) history.replaceState(null, '', roomUrl(page.id));
        startOwnerLive(page);
      }
      setStatus();
      saveFeedback('Guardado');
      updatePageBar();
      renderSidebar();
      if (dirty()) queueSave();
      return true;
    } catch (error) {
      saveFeedback('Error al guardar');
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

async function openPage(id, preferredFolder = folderId, { fromHistory = false, focus = false, browse = false } = {}) {
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
    const url = browse ? roomUrl() + '?folder=' + item.folderId : roomUrl(item.id);
    if (!fromHistory && location.pathname + location.search !== url) history.pushState(null, '', url);
    setStatus();
    if (mobile.matches) setSidebar(false);
    showPage(item, !browse && (focus || !item.id), browse);
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
  for (const { label, danger, symbol, run } of actions) {
    const button = document.createElement('button');
    button.className = 'sidebar-row' + (danger ? ' danger' : '');
    if (symbol) button.append(icon(symbol));
    button.append(label);
    button.onclick = () => {
      actionsDialog.close();
      run();
    };
    list.append(button);
  }
  actionsDialog.showModal();
}

function openFolderDialog(folder = null, parent = null) {
  editingFolder = folder;
  newFolderParent = parent;
  $('folderDialogTitle').textContent = folder ? 'Renombrar carpeta' : parent ? 'Nueva subcarpeta' : 'Nueva carpeta';
  $('folderName').value = folder?.name ?? '';
  $('folderError').hidden = true;
  folderDialog.showModal();
  $('folderName').focus();
}

function orderActions(item, isFolder) {
  const siblings = siblingEntries(isFolder, isFolder ? item.parentId ?? null : item.folderId);
  const index = siblings.findIndex(entry => entry.id === item.id);
  const actions = [];
  if (index > 0) actions.push({ label: 'Subir en la lista', run: () => reorderEntry(item, siblings[index - 1], isFolder, false) });
  if (index >= 0 && index < siblings.length - 1) actions.push({ label: 'Bajar en la lista', run: () => reorderEntry(item, siblings[index + 1], isFolder, true) });
  return actions;
}

function folderActions(folder) {
  showActions(folder.name, [
    { label: 'Nueva página', symbol: 'plus', run: () => openPage(null, folder.id, { focus: true }) },
    { label: 'Nueva subcarpeta', symbol: 'folder', run: () => openFolderDialog(null, folder.id) },
    ...orderActions(folder, true),
    { label: 'Mover carpeta', symbol: 'move', run: () => chooseDestination(folder, true) },
    { label: 'Renombrar carpeta', symbol: 'edit', run: () => openFolderDialog(folder) },
    { label: 'Borrar carpeta', symbol: 'trash', danger: true, run: () => deleteFolder(folder) },
  ]);
}

async function deleteFolder(folder) {
  if (navigating || !confirm('¿Borrar esta carpeta, sus subcarpetas y todas sus páginas?')) return;
  navigating = true;
  try {
    const removed = new Set(folders.filter(item => folderPath(item.id).includes(folder)).map(item => item.id));
    documentView.inert = removed.has(folderId);
    if (documentView.inert && !await flushChanges()) return;
    await request('/room/folders/delete', { id: folder.id });
    folders = folders.filter(item => !removed.has(item.id));
    pages = pages.filter(item => !removed.has(item.folderId));
    if (removed.has(folderId)) {
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

function chooseDestination(item, isFolder) {
  const destinations = folders.filter(folder => isFolder
    ? folder.id !== item.parentId && !folderPath(folder.id).some(ancestor => ancestor.id === item.id)
    : folder.id !== item.folderId);
  const actions = destinations.map(folder => ({
    label: folderPath(folder.id).map(entry => entry.name).join(' / '),
    run: () => moveItem(item, isFolder, folder.id),
  }));
  if (isFolder && item.parentId) actions.unshift({ label: 'Carpetas principales', run: () => moveItem(item, true, null) });
  if (!actions.length) { setStatus('No hay otra carpeta disponible como destino.'); return; }
  showActions('Mover ' + (isFolder ? 'carpeta' : 'página'), actions);
}

async function moveItem(item, isFolder, destination) {
  if (navigating) return;
  navigating = true;
  documentView.inert = true;
  try {
    if (!await flushChanges()) return;
    if (isFolder) {
      await request('/room/folders/move', { id: item.id, parentId: destination });
      item.parentId = destination;
      item.sortOrder = null;
    } else {
      await request('/room/pages/move', { id: item.id, folderId: destination });
      const moved = pages.find(entry => entry.id === item.id);
      moved.folderId = destination;
      moved.sortOrder = null;
      if (page?.id === item.id) page.folderId = folderId = destination;
    }
    if (destination) folderExpansion.set(destination, true);
    renderSidebar();
    setStatus(isFolder ? 'Carpeta movida.' : 'Página movida.');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    documentView.inert = false;
    navigating = false;
  }
}

function pageActions(item) {
  const actions = [
    { label: 'Renombrar página', symbol: 'edit', run: async () => {
      await openPage(item.id, item.folderId);
      if (page?.id === item.id) { title.focus(); title.select(); }
    } },
    ...orderActions(item, false),
    { label: 'Mover página', symbol: 'move', run: () => chooseDestination(item, false) },
    { label: 'Duplicar página', symbol: 'copy', run: () => duplicatePage(item) },
    { label: 'Borrar página', symbol: 'trash', danger: true, run: () => confirmDeletePage(item) },
  ];
  if (page?.id === item.id) actions.unshift({ label: 'Guardar ahora', run: () => saveNow() });
  showActions(item.title, actions);
}

async function duplicatePage(item) {
  if (navigating) return;
  navigating = true;
  documentView.inert = true;
  let copy;
  try {
    if (!await flushChanges()) return;
    const original = await request('/room/pages/get', { id: item.id });
    const copyTitle = original.title.slice(0, 112).trimEnd() + ' (copia)';
    const result = await request('/room/pages/save', {
      folderId: original.folderId, title: copyTitle, content: original.content,
    });
    copy = { ...result, folderId: original.folderId, title: copyTitle, content: original.content };
    pages.unshift(copy);
    history.pushState(null, '', roomUrl(copy.id));
    if (mobile.matches) setSidebar(false);
    showPage(copy);
    setStatus('Página duplicada.');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    documentView.inert = false;
    navigating = false;
  }
  if (copy) { title.focus(); title.select(); }
}

function confirmDeletePage(item) {
  if (navigating) return;
  $('deletePageName').textContent = item.title;
  $('confirmDeletePage').onclick = () => {
    $('deletePageDialog').close();
    deletePage(item);
  };
  $('deletePageDialog').showModal();
}

async function deletePage(item) {
  if (navigating) return;
  navigating = true;
  const active = page?.id === item.id;
  try {
    if (active) {
      documentView.inert = true;
      clearTimeout(saveTimer);
      // Let an in-flight write finish before removing the page.
      if (saveTask) await saveTask;
      clearTimeout(saveTimer);
    }
    await request('/room/pages/delete', { id: item.id });
    pages = pages.filter(entry => entry.id !== item.id);
    if (active) {
      history.replaceState(null, '', roomUrl());
      showPage({ id: null, folderId, title: '', content: '', revision: 0 });
    } else {
      renderSidebar();
    }
    setStatus('Página borrada.');
  } catch (error) {
    if (active && dirty()) saveFeedback('Cambios pendientes');
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
    const requestedFolder = folders.find(folder => folder.id === new URLSearchParams(location.search).get('folder'));
    let item = null;
    let missingPage = false;
    if (!requestedFolder && (requestedId || pages[0])) {
      try {
        item = await request('/room/pages/get', { id: requestedId || pages[0].id });
      } catch (error) {
        if (error.status !== 404) throw error;
        missingPage = true;
      }
    }
    item ??= { id: null, folderId: requestedFolder?.id ?? folders[0]?.id, title: '', content: '', revision: 0 };
    history.replaceState(null, '', requestedFolder ? roomUrl() + '?folder=' + requestedFolder.id : roomUrl(item.id));
    ready = true;
    document.querySelectorAll('[data-ready]').forEach(button => { button.disabled = false; });
    showPage(item, !requestedFolder && !item.id && !mobile.matches, Boolean(requestedFolder));
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
$('quickPage').onclick = () => openPage(null, folderId, { focus: true });
$('newFolder').onclick = () => openFolderDialog();
$('addSubfolder').onclick = () => openFolderDialog(null, folderId);
$('addFolderPage').onclick = () => openPage(null, folderId, { focus: true });
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
    const { id } = await request('/room/folders/save', { id: editingFolder?.id, name, parentId: newFolderParent });
    if (editingFolder) editingFolder.name = name;
    else folders.push({ id, name, parentId: newFolderParent });
    folders.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    folderDialog.close();
    renderSidebar();
    if (!editingFolder) await openPage(null, id, { browse: true });
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
  const selected = $('folders').querySelector('[aria-current="page"] .row-title');
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
  if (page?.id) pageActions({ ...page, title: title.value.trim() || 'Sin título' });
  else showActions(title.value.trim() || 'Nueva página', [{ label: 'Guardar ahora', run: () => saveNow() }]);
};
$('cancelDeletePage').onclick = () => $('deletePageDialog').close();
const shareDialog = $('shareDialog');
let shareRequest = 0;
async function updateShare(id, permission) {
  const load = ++shareRequest;
  const selector = $('sharePermission');
  selector.disabled = $('saveShare').disabled = $('copyLink').disabled = true;
  $('shareStatus').textContent = 'Cargando…';
  try {
    const link = await request('/room/share/settings', { id, permission });
    if (load !== shareRequest) return;
    selector.value = link.permission;
    const address = new URL(roomUrl(), location.origin);
    address.hash = link.token ? 'share=' + link.token : '';
    $('shareUrl').value = link.token ? address.href : '';
    $('shareUrl').hidden = !link.token;
    $('shareStatus').textContent = permission === undefined ? '' : 'Permiso guardado.';
  } catch (error) {
    if (load === shareRequest) $('shareStatus').textContent = error.message;
  } finally {
    if (load === shareRequest) {
      selector.disabled = $('saveShare').disabled = false;
      $('copyLink').disabled = !$('shareUrl').value;
    }
  }
}
$('sharePage').onclick = () => {
  const id = page.id;
  $('shareUrl').value = '';
  $('shareUrl').hidden = true;
  $('sharePermission').value = 'off';
  $('saveShare').onclick = () => updateShare(id, $('sharePermission').value);
  shareDialog.showModal();
  updateShare(id);
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
window.addEventListener('popstate', () => {
  const folder = folders.find(item => item.id === new URLSearchParams(location.search).get('folder'));
  openPage(pageIdFromUrl(), folder?.id ?? folderId, { fromHistory: true, browse: Boolean(folder) });
});
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
    if (ownerConflict) {
      const remote = ownerConflict;
      const keepDraft = confirm('¿Guardar tu versión completa? Elegí Cancelar para conservar la versión compartida.');
      ownerConflict = null;
      Object.assign(page, { revision: remote.revision, updatedAt: remote.updatedAt });
      saved = { title: remote.title, content: remote.content };
      if (!keepDraft) {
        Object.assign(page, saved);
        applyLiveDraft(saved);
        const entry = pages.find(candidate => candidate.id === page.id);
        if (entry) Object.assign(entry, { title: remote.title, updatedAt: remote.updatedAt });
        renderSidebar();
        saveFeedback('Guardado');
      }
      setStatus();
    }
    saveNow();
  }
});
async function openSharedPage(share) {
  $('layout').hidden = true;
  $('sharedPage').hidden = false;
  const status = $('sharedStatus');
  status.textContent = 'Cargando página…';
  try {
    const data = await api('/room/shared/get', { share });
    document.title = data.title + ' · Room';
    status.textContent = '';
    if (data.permission === 'edit') {
      const form = $('sharedJoin'), nameInput = $('sharedName');
      $('sharedMode').textContent = 'Room · Edición compartida';
      form.hidden = false;
      nameInput.focus();
      form.onsubmit = async event => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (!name || form.inert) return;
        form.inert = true;
        try {
          const latest = await api('/room/shared/get', { share });
          if (latest.permission !== 'edit') throw Error('El enlace ya no permite editar.');
          form.hidden = true;
          startGuestLive(share, name, latest);
        } catch (error) {
          status.textContent = error.message;
        } finally {
          form.inert = false;
        }
      };
    } else {
      $('sharedMode').textContent = 'Room · Solo lectura';
      $('sharedHeading').textContent = data.title;
      for (const line of data.content.split('\n')) {
        const block = document.createElement('div');
        block.textContent = line || ' ';
        $('sharedBlocks').append(block);
      }
      $('sharedRead').hidden = false;
    }
  } catch (error) {
    status.textContent = error.message;
  }
}
function startGuestLive(share, name, initial) {
  const status = $('sharedStatus'), saveButton = $('sharedSave');
  $('sharedToolbar').hidden = false;
  status.before(documentView);
  documentView.hidden = false;
  started = true;
  $('starter').hidden = true;
  $('blocks').hidden = false;
  applyLiveDraft(initial);
  let base = initial, saving = false, timer, conflict, revoked = false, retryAt = 0;
  const draft = () => ({ title: title.value.trim() || 'Sin título', content: editor.content });
  function schedule() {
    clearTimeout(timer);
    if (revoked || conflict || sameDraft(draft(), base)) return;
    status.textContent = 'Cambios pendientes…';
    timer = setTimeout(() => { timer = undefined; saveShared(); }, Math.max(500, retryAt - Date.now()));
  }
  queueSharedSave = schedule;
  async function saveShared() {
    if (saving || conflict || revoked) return;
    const current = draft();
    if (sameDraft(current, base)) return;
    if (current.content.length > 10000) {
      status.textContent = 'La página admite hasta 10.000 caracteres.';
      return;
    }
    saving = true;
    saveButton.disabled = true;
    status.textContent = 'Guardando…';
    try {
      const { revision } = await api('/room/shared/save', { share, revision: base.revision, ...current });
      base = { ...current, revision };
      status.textContent = 'Cambios guardados.';
      schedule();
    } catch (error) {
      retryAt = Date.now() + (error.status === 409 ? 800 : 3000);
      status.textContent = error.status === 409 ? 'Recibiendo cambios…' : error.message;
    } finally {
      saving = false;
      saveButton.disabled = revoked;
    }
  }
  const stop = liveRoom(documentView, data => api('/room/shared/live', { share, name, ...data }), remote => {
    if (saving) return;
    if (remote.revision > base.revision) {
      const merged = mergeRoomDraft(base, draft(), remote);
      if (!merged) {
        clearTimeout(timer);
        timer = undefined;
        conflict = remote;
        saveButton.textContent = 'Resolver conflicto';
        status.textContent = 'Ambos editaron la misma parte de la página.';
        return;
      }
      conflict = null;
      saveButton.textContent = 'Guardar cambios';
      base = remote;
      applyLiveDraft(merged);
    }
    if (sameDraft(draft(), base)) status.textContent = 'Edición en vivo · Al día';
    else if (!conflict && timer === undefined && draft().content.length <= 10000) schedule();
  }, error => {
    status.textContent = error.message;
    if (error.status === 403 || error.status === 404) {
      revoked = true;
      documentView.inert = true;
      saveButton.disabled = true;
      clearTimeout(timer);
      stop();
    }
  });
  saveButton.onclick = () => {
    if (conflict) {
      const keepDraft = confirm('¿Guardar tu versión completa? Elegí Cancelar para conservar la versión compartida.');
      base = conflict;
      conflict = null;
      saveButton.textContent = 'Guardar cambios';
      if (!keepDraft) applyLiveDraft(base);
    }
    saveShared();
  };
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveButton.click();
    }
  });
  window.addEventListener('beforeunload', event => {
    if (saving || !sameDraft(draft(), base)) { event.preventDefault(); event.returnValue = ''; }
  });
}

const publicShare = new URLSearchParams(location.hash.slice(1)).get('share');
if (publicShare) openSharedPage(publicShare);
else loadRoom();
