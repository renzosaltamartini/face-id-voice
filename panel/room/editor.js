const blockTypes = [
  { id: 'text', label: 'Texto', icon: 'text' },
  { id: 'h1', label: 'Encabezado 1', icon: 'heading', shortcut: '#' },
  { id: 'h2', label: 'Encabezado 2', icon: 'heading', shortcut: '##' },
  { id: 'h3', label: 'Encabezado 3', icon: 'heading', shortcut: '###' },
  { id: 'h4', label: 'Encabezado 4', icon: 'heading', shortcut: '####' },
  { id: 'bullet', label: 'Lista con viñetas', icon: 'bullet', shortcut: '-' },
  { id: 'number', label: 'Lista numerada', icon: 'number', shortcut: '1.' },
  { id: 'todo', label: 'Lista de tareas', icon: 'todo', shortcut: '[ ]' },
  { id: 'quote', label: 'Cita', icon: 'quote', shortcut: '>' },
  { id: 'divider', label: 'Separador', icon: 'minus', shortcut: '---' },
];

function readBlock(line) {
  if (line.startsWith('\\') && (line[1] === '\\' || readBlock(line.slice(1)).type !== 'text')) {
    return { type: 'text', text: line.slice(1) };
  }
  const heading = /^(#{1,4}) (.*)$/.exec(line);
  if (heading) return { type: 'h' + heading[1].length, text: heading[2] };
  const task = /^- \[([ xX])\] (.*)$/.exec(line);
  if (task) return { type: 'todo', text: task[2], checked: task[1] !== ' ' };
  const number = /^(\d{1,9})\. (.*)$/.exec(line);
  if (number) return { type: 'number', text: number[2], number: Number(number[1]) };
  if (line.startsWith('- ')) return { type: 'bullet', text: line.slice(2) };
  if (line.startsWith('> ')) return { type: 'quote', text: line.slice(2) };
  if (line === '---') return { type: 'divider', text: '' };
  return { type: 'text', text: line };
}

function writeBlock(block) {
  if (block.raw !== undefined) return block.raw;
  const { type, text } = block;
  if (type === 'text') return (text.startsWith('\\') || readBlock(text).type !== 'text' ? '\\' : '') + text;
  if (type === 'todo') return (block.checked ? '- [x] ' : '- [ ] ') + text;
  if (type === 'number') return (block.number ?? 1) + '. ' + text;
  if (type === 'divider') return '---';
  return blockTypes.find(item => item.id === type).shortcut + ' ' + text;
}

function fitText(input) {
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
}

class BlockEditor {
  constructor(onChange) {
    this.container = $('blocks');
    this.picker = $('blockPicker');
    this.filter = $('blockFilter');
    this.options = $('blockOptions');
    this.onChange = onChange;
    this.blocks = [];
    this.filter.oninput = () => this.renderOptions();
    this.filter.onkeydown = event => this.pickerKey(event);
    this.options.onmousedown = event => {
      if (event.target.closest('[role="option"]')) event.preventDefault();
    };
    $('closeBlockPicker').onclick = () => this.closePicker(true);
    document.addEventListener('keydown', event => {
      if (!this.picker.hidden && event.key === 'Escape') {
        event.preventDefault();
        this.closePicker(true);
      }
    });
    document.addEventListener('pointerdown', event => {
      if (!this.picker.hidden && !this.picker.contains(event.target) && !event.target.closest('[data-add-block]')) {
        this.closePicker();
      }
    });
    document.addEventListener('scroll', () => {
      if (this.target) this.placePicker();
    }, true);
    window.addEventListener('resize', () => {
      this.fit();
      if (this.target) this.placePicker();
    });
  }

  setContent(content) {
    this.closePicker();
    this.blocks = [];
    this.container.replaceChildren();
    const lines = content ? content.split(/\r\n|\n|\r/) : [];
    for (const line of lines) this.insert({ ...readBlock(line), raw: line });
    this.insert({ type: 'text', text: '', hint: true });
  }

  get content() {
    return this.blocks
      .filter(block => !block.hint || block.text || block.type !== 'text')
      .map(writeBlock)
      .join('\n');
  }

  fit() {
    if (this.container.hidden || this.container.closest('[hidden]')) return;
    for (const block of this.blocks) fitText(block.input);
  }

  insert(data, index = this.blocks.length) {
    const row = document.createElement('div');
    row.className = 'block';
    const input = document.createElement('textarea');
    input.className = 'block-input';
    input.rows = 1;
    input.maxLength = 10000;
    input.value = data.text;
    const marker = document.createElement('span');
    marker.className = 'block-marker';
    const tools = document.createElement('div');
    tools.className = 'block-tools';
    const add = iconButton('plus', 'Insertar un bloque');
    add.dataset.addBlock = '';
    const drag = document.createElement('span');
    drag.className = 'icon-button drag-handle';
    drag.title = 'Arrastra para mover el bloque o usa Alt y las flechas';
    drag.draggable = true;
    drag.append(icon('grip'));
    tools.append(add, drag);
    row.append(tools, marker, input);
    const block = { ...data, row, input, marker };
    this.container.insertBefore(row, this.blocks[index]?.row ?? null);
    this.blocks.splice(index, 0, block);
    this.styleBlock(block);
    fitText(input);
    add.onclick = () => this.openPicker(block, Boolean(block.text || block.type !== 'text'));
    input.oninput = event => this.handleInput(block, event.inputType);
    input.onkeydown = event => this.blockKey(event, block);
    drag.ondragstart = event => {
      this.dragged = block;
      event.dataTransfer.setData('text/plain', 'room-block');
      event.dataTransfer.effectAllowed = 'move';
    };
    drag.ondragend = () => { this.dragged = null; };
    row.ondragover = event => {
      if (!this.dragged || this.dragged === block) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      row.dataset.drop = this.blocks.indexOf(this.dragged) < this.blocks.indexOf(block) ? 'after' : 'before';
    };
    row.ondragleave = event => {
      if (!row.contains(event.relatedTarget)) delete row.dataset.drop;
    };
    row.ondrop = event => {
      delete row.dataset.drop;
      if (!this.dragged || this.dragged === block) return;
      event.preventDefault();
      this.move(this.dragged, this.blocks.indexOf(block));
    };
    return block;
  }

  styleBlock(block) {
    const { row, input, marker, type } = block;
    row.dataset.type = type;
    row.dataset.hint = String(Boolean(block.hint));
    row.dataset.checked = String(Boolean(block.checked));
    input.placeholder = block.hint ? 'Presiona / para insertar bloques' : '';
    input.setAttribute('aria-label', blockTypes.find(item => item.id === type).label);
    input.readOnly = type === 'divider';
    marker.hidden = !['bullet', 'number', 'todo'].includes(type);
    if (type === 'bullet') marker.textContent = '•';
    if (type === 'number') marker.textContent = (block.number ?? 1) + '.';
    if (type === 'todo') {
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = Boolean(block.checked);
      check.setAttribute('aria-label', 'Tarea completada');
      check.onchange = () => {
        delete block.raw;
        block.checked = check.checked;
        row.dataset.checked = String(check.checked);
        this.onChange();
      };
      marker.replaceChildren(check);
    }
  }

  remove(block) {
    this.blocks.splice(this.blocks.indexOf(block), 1);
    block.row.remove();
  }

  move(block, index) {
    this.blocks.splice(this.blocks.indexOf(block), 1);
    this.container.insertBefore(block.row, this.blocks[index]?.row ?? null);
    this.blocks.splice(index, 0, block);
    if (block.hint) {
      block.hint = false;
      this.styleBlock(block);
    }
    this.onChange();
  }

  handleInput(block, inputType) {
    const lines = block.input.value.split('\n');
    const last = lines.pop();
    if (lines.length) {
      delete block.raw;
      block.text = lines.shift();
      block.input.value = block.text;
      const index = this.blocks.indexOf(block) + 1;
      lines.forEach((line, offset) => this.insert(readBlock(line), index + offset));
      const next = this.insert(readBlock(last), index + lines.length);
      this.focus(next, next.text.length);
    } else {
      if (inputType !== 'insertFromPaste' && !block.text && /^\/[^/]*$/.test(last)) {
        block.input.value = '';
        this.openPicker(block, false, last.slice(1));
        return;
      }
      if (last !== block.text) delete block.raw;
      block.text = last;
    }
    if (block.hint && (block.text || block.input !== document.activeElement)) {
      block.hint = false;
      this.styleBlock(block);
    }
    fitText(block.input);
    this.onChange();
  }

  focus(block, caret = 0) {
    block.input.focus();
    block.input.setSelectionRange(caret, caret);
  }

  blockKey(event, block) {
    if (event.isComposing) return;
    const { input, type, text } = block;
    const index = this.blocks.indexOf(block);
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (event.key === '/' && !text && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      this.openPicker(block, false);
    } else if (event.key === ' ' && type === 'text' && end === text.length && start === end) {
      const conversion = blockTypes.find(item => item.shortcut === text);
      if (!conversion) return;
      event.preventDefault();
      this.applyType(block, conversion.id, '');
    } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const continues = ['todo', 'number', 'bullet'].includes(type);
      if (continues && !text) {
        this.applyType(block, 'text', '');
        return;
      }
      const trailing = text.slice(end);
      block.text = text.slice(0, start);
      if (block.text !== text) delete block.raw;
      block.input.value = block.text;
      block.hint = false;
      this.styleBlock(block);
      fitText(input);
      const following = this.blocks[index + 1];
      const next = !continues && !trailing && following?.hint ? following : this.insert({
        type: continues ? type : 'text', text: trailing, number: (block.number ?? 1) + 1,
      }, index + 1);
      this.focus(next);
      this.onChange();
    } else if (event.key === 'Backspace' && start === 0 && end === 0) {
      if (type !== 'text') {
        event.preventDefault();
        this.applyType(block, 'text', text);
      } else if (index > 0) {
        event.preventDefault();
        const previous = this.blocks[index - 1];
        if (previous.type === 'divider' && text) {
          this.remove(previous);
        } else {
          const caret = previous.text.length;
          if (text) delete previous.raw;
          previous.text += text;
          previous.input.value = previous.text;
          fitText(previous.input);
          this.remove(block);
          this.focus(previous, caret);
        }
        this.onChange();
      }
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const step = event.key === 'ArrowUp' ? -1 : 1;
      const neighbor = this.blocks[index + step];
      if (event.altKey && neighbor) {
        event.preventDefault();
        this.move(block, index + step);
        this.focus(block, start);
      } else if (!event.shiftKey && !event.altKey && start === end &&
                 (step < 0 ? start === 0 : end === text.length)) {
        if (!neighbor && step > 0) return;
        event.preventDefault();
        if (neighbor) this.focus(neighbor, step < 0 ? neighbor.text.length : 0);
        else $('title').focus();
      }
    }
  }

  applyType(block, type, text) {
    delete block.raw;
    Object.assign(block, { type, text, checked: false, number: 1, hint: false });
    block.input.value = text;
    this.styleBlock(block);
    fitText(block.input);
    this.focus(block, text.length);
    this.onChange();
  }

  start(type) {
    const block = this.blocks[0];
    if (type === 'menu') this.openPicker(block, false);
    else if (type === 'text') this.focus(block);
    else this.applyType(block, type, '');
  }

  openPicker(block, insertAfter, query = '') {
    this.closePicker();
    this.target = block;
    this.target.row.dataset.picking = 'true';
    this.insertAfter = insertAfter;
    this.picker.hidden = false;
    this.filter.value = query;
    this.filter.setAttribute('aria-expanded', 'true');
    this.renderOptions();
    this.filter.focus({ preventScroll: true });
  }

  closePicker(restoreFocus = false) {
    if (this.target) {
      delete this.target.row.dataset.picking;
      if (restoreFocus) this.focus(this.target);
    }
    this.target = null;
    this.picker.hidden = true;
    this.filter.setAttribute('aria-expanded', 'false');
    this.filter.removeAttribute('aria-activedescendant');
  }

  placePicker() {
    const anchor = this.target.row.getBoundingClientRect();
    const x = Math.max(8, Math.min(anchor.left - 8, innerWidth - this.picker.offsetWidth - 8));
    const y = Math.max(8, Math.min(anchor.top, innerHeight - this.picker.offsetHeight - 8));
    this.picker.style.left = x + 'px';
    this.picker.style.top = y + 'px';
  }

  renderOptions() {
    const query = normalizeSearch(this.filter.value.trim());
    const suggested = ['todo', 'quote'];
    this.options.replaceChildren();
    this.choices = [];
    for (const [label, types] of query
      ? [['Bloques', blockTypes.filter(item => normalizeSearch(item.label).includes(query) || item.shortcut === query)]]
      : [['Sugerencias', blockTypes.filter(item => suggested.includes(item.id)).reverse()], ['Bloques básicos', blockTypes]]) {
      if (!types.length) continue;
      const heading = document.createElement('p');
      heading.className = 'picker-heading';
      heading.textContent = label;
      this.options.append(heading);
      for (const item of types) {
        const index = this.choices.length;
        const option = document.createElement('div');
        option.className = 'picker-item';
        option.id = 'block-choice-' + index;
        option.setAttribute('role', 'option');
        const glyph = icon(item.icon);
        if (/^h[1-4]$/.test(item.id)) {
          glyph.setAttribute('viewBox', '0 0 27 24');
          glyph.innerHTML = '<path d="M4 5v14m11-14v14M4 12h11"/><text x="18" y="20" fill="currentColor" stroke="none" font-size="13">' + item.id[1] + '</text>';
        }
        option.append(glyph, item.label);
        if (item.shortcut) {
          const shortcut = document.createElement('kbd');
          shortcut.textContent = item.shortcut;
          option.append(shortcut);
        }
        option.onpointermove = () => this.selectOption(index);
        option.onclick = () => this.chooseType(item.id);
        this.choices.push({ option, id: item.id });
        this.options.append(option);
      }
    }
    if (!this.choices.length) {
      const empty = document.createElement('p');
      empty.className = 'picker-heading';
      empty.textContent = 'No se encontraron bloques.';
      this.options.append(empty);
    }
    this.options.scrollTop = 0;
    this.selectOption(0);
    this.placePicker();
  }

  selectOption(index, scroll = false) {
    this.selection = index;
    this.choices.forEach(({ option }, i) => option.setAttribute('aria-selected', String(i === index)));
    const choice = this.choices[index];
    if (!choice) {
      this.filter.removeAttribute('aria-activedescendant');
      return;
    }
    this.filter.setAttribute('aria-activedescendant', choice.option.id);
    if (scroll) choice.option.scrollIntoView({ block: 'nearest' });
  }

  pickerKey(event) {
    if (!this.choices.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.selectOption((this.selection + step + this.choices.length) % this.choices.length, true);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.chooseType(this.choices[this.selection].id);
    }
  }

  chooseType(type) {
    const block = this.insertAfter
      ? this.insert({ type: 'text', text: '' }, this.blocks.indexOf(this.target) + 1)
      : this.target;
    const text = type === 'divider' ? '' : block.text;
    this.closePicker();
    this.applyType(block, type, text);
  }
}
