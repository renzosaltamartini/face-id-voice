function sameDraft(a, b) {
  return a.title === b.title && a.content === b.content;
}

function roomEdit(base, draft) {
  let start = 0;
  while (start < base.length && base[start] === draft[start]) start++;
  let end = base.length, draftEnd = draft.length;
  while (end > start && draftEnd > start && base[end - 1] === draft[draftEnd - 1]) {
    end--;
    draftEnd--;
  }
  return { start, end, text: draft.slice(start, draftEnd) };
}

function mergeRoomText(base, local, remote) {
  if (local === base || local === remote) return remote;
  if (remote === base) return local;
  const first = roomEdit(base, local), second = roomEdit(base, remote);
  const [left, right] = first.start <= second.start ? [first, second] : [second, first];
  if (left.end > right.start) return null;
  return base.slice(0, left.start) + left.text + base.slice(left.end, right.start) + right.text + base.slice(right.end);
}

function mergeRoomDraft(base, local, remote) {
  const title = mergeRoomText(base.title, local.title, remote.title);
  const content = mergeRoomText(base.content, local.content, remote.content);
  return title === null || content === null ? null : { title, content };
}

function liveRoom(view, fetchState, onState, onError) {
  const layer = document.getElementById('roomCursors');
  const client = crypto.randomUUID();
  const colors = ['#0969aa', '#8c3361', '#007357', '#9b4a12', '#5b4ab1'];
  const cursors = new Map();
  let pointer = null, timer, stopped = false;

  function move(event) {
    const box = view.getBoundingClientRect();
    pointer = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  }
  function leave() { pointer = null; }
  function place() {
    const box = view.getBoundingClientRect();
    layer.style.clipPath = 'inset(' + Math.max(0, box.top) + 'px ' + Math.max(0, innerWidth - box.right) +
      'px ' + Math.max(0, innerHeight - box.bottom - 26) + 'px ' + Math.max(0, box.left) + 'px)';
    for (const { element, x, y } of cursors.values()) {
      element.style.transform = 'translate(' + (box.left + x * box.width) + 'px,' + (box.top + y * box.height) + 'px)';
    }
  }
  function render(peers) {
    const active = new Set();
    for (const peer of peers) {
      if (peer.x === null || peer.y === null) continue;
      active.add(peer.client);
      let cursor = cursors.get(peer.client);
      if (!cursor) {
        const element = document.createElement('div');
        element.className = 'room-remote-cursor';
        const label = document.createElement('span');
        element.style.setProperty('--cursor-color', colors[parseInt(peer.client.split(':')[1].slice(0, 4), 16) % colors.length]);
        element.append(label);
        layer.append(element);
        cursor = { element, label };
        cursors.set(peer.client, cursor);
      }
      Object.assign(cursor, { x: peer.x, y: peer.y });
      cursor.label.textContent = peer.name;
    }
    for (const [id, cursor] of cursors) {
      if (active.has(id)) continue;
      cursor.element.remove();
      cursors.delete(id);
    }
    place();
  }
  async function tick() {
    let delay = 700;
    try {
      if (document.hidden) return;
      const state = await fetchState({ client, ...pointer });
      if (stopped) return;
      render(state.peers);
      onState(state);
      if (state.permission === 'off') delay = 2500;
    } catch (error) {
      if (stopped) return;
      render([]);
      onError(error);
      delay = 2500;
    } finally {
      if (!stopped) timer = setTimeout(tick, delay);
    }
  }
  view.addEventListener('pointermove', move);
  view.addEventListener('pointerleave', leave);
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    view.removeEventListener('pointermove', move);
    view.removeEventListener('pointerleave', leave);
    window.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
    layer.replaceChildren();
  };
}
