// A small tree DOM for state tests. It preserves node identity and models fragment
// replacement, text updates and focus; browser tests still cover paint and layout.
export function createDOMAdapter(dispatch) {
  const mutations = [], focusCalls = [];
  const decode = value => value.replace(/&(?:amp|lt|gt|quot|#39|#\d+);/g, entity =>
    ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity]
      ?? String.fromCodePoint(Number(entity.slice(2, -1))));
  const escape = value => String(value).replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
  const voidTags = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'area', 'wbr']);
  let document;
  class Element {
    constructor(tagName, attributes = {}) {
      this.tagName = tagName; this.attributes = { ...attributes }; this.children = [];
      this.parentNode = null; this.style = {}; this.inert = false;
    }
    get id() { return this.attributes.id || ''; }
    get dataset() { return Object.fromEntries(Object.entries(this.attributes).filter(([key]) => key.startsWith('data-'))
      .map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()), value])); }
    get isConnected() { let node = this; while (node.parentNode) node = node.parentNode; return node === document.body; }
    get disabled() { return Object.hasOwn(this.attributes, 'disabled'); }
    set disabled(value) { if (value) this.attributes.disabled = ''; else delete this.attributes.disabled; }
    get value() { return this.currentValue ?? this.attributes.value ?? (this.tagName === 'select'
      ? (this.querySelector('option[selected]') || this.querySelector('option'))?.value ?? '' : ''); }
    set value(value) { this.currentValue = String(value); }
    get classList() { return {
      add: name => this.classList.toggle(name, true), remove: name => this.classList.toggle(name, false),
      toggle: (name, force) => { const names = new Set((this.attributes.class || '').split(/\s+/).filter(Boolean));
        const enabled = force ?? !names.has(name); if (enabled) names.add(name); else names.delete(name);
        this.attributes.class = [...names].join(' '); return enabled; },
    }; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      const excluded = [...selector.matchAll(/:not\(([^)]+)\)/g)].map(match => match[1]);
      if (excluded.some(part => this.matches(part))) return false;
      selector = selector.replace(/:not\([^)]+\)/g, '');
      const tag = /^[\w-]+/.exec(selector)?.[0];
      if (tag && tag !== this.tagName) return false;
      for (const match of selector.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g))
        if (!Object.hasOwn(this.attributes, match[1]) || match[2] !== undefined && this.attributes[match[1]] !== match[2]) return false;
      const simple = selector.replace(/\[[^\]]+\]/g, '');
      for (const match of simple.matchAll(/([.#])([\w-]+)/g))
        if (match[1] === '#' ? this.id !== match[2] : !(this.attributes.class || '').split(/\s+/).includes(match[2])) return false;
      return true;
    }
    querySelectorAll(selector) {
      const choices = selector.split(',').map(part => part.trim().split(/\s+/));
      const found = [];
      const visit = node => { for (const child of node.children) if (child instanceof Element) {
        if (choices.some(parts => { if (!child.matches(parts.at(-1))) return false;
          let ancestor = child.parentNode;
          for (let i = parts.length - 2; i >= 0; i--) {
            while (ancestor && !ancestor.matches(parts[i])) ancestor = ancestor.parentNode;
            if (!ancestor || !this.contains(ancestor)) return false;
            ancestor = ancestor.parentNode;
          }
          return true;
        })) found.push(child);
        visit(child);
      } };
      visit(this); return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    focus(options) { if (!this.isConnected || this.disabled) return; document.activeElement = this; focusCalls.push({ node: this, options }); }
    dispatchEvent(event) { dispatch(event.type, { target: this }); return true; }
    get innerHTML() { return this.children.map(child => typeof child === 'string' ? escape(child) : child.outerHTML).join(''); }
    set innerHTML(html) {
      mutations.push({ target: this, property: 'innerHTML' });
      if (this.contains(document.activeElement)) document.activeElement = document.body;
      for (const child of this.children) if (child instanceof Element) child.parentNode = null;
      this.children = parse(String(html), this);
    }
    get outerHTML() { return `<${this.tagName}${Object.entries(this.attributes).map(([key, value]) =>
      ` ${key}="${escape(value).replace(/"/g, '&quot;')}"`).join('')}>${voidTags.has(this.tagName) ? '' : `${this.innerHTML}</${this.tagName}>`}`; }
    set outerHTML(html) {
      if (!this.parentNode) throw new Error('Cannot replace a detached DOM fragment');
      mutations.push({ target: this, property: 'outerHTML' });
      const parent = this.parentNode, index = parent.children.indexOf(this);
      if (this.contains(document.activeElement)) document.activeElement = document.body;
      parent.children.splice(index, 1, ...parse(String(html), parent)); this.parentNode = null;
    }
    get textContent() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
    set textContent(value) {
      mutations.push({ target: this, property: 'textContent' });
      for (const child of this.children) if (child instanceof Element) child.parentNode = null;
      this.children = [String(value)];
    }
  }
  function parse(html, parent) {
    const root = { children: [], parentNode: null }, stack = [root];
    for (const token of html.match(/<!--[^]*?-->|<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('<!--')) continue;
      if (token.startsWith('</')) { stack.pop(); continue; }
      const opening = /^<([\w-]+)([^]*)>$/.exec(token);
      if (opening) {
        const attributes = {};
        for (const match of opening[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
          attributes[match[1]] = decode(match[2] ?? match[3] ?? match[4] ?? '');
        const element = new Element(opening[1], attributes);
        element.parentNode = stack.at(-1) === root ? parent : stack.at(-1);
        stack.at(-1).children.push(element);
        if (!voidTags.has(element.tagName) && !token.endsWith('/>')) stack.push(element);
      } else stack.at(-1).children.push(decode(token));
    }
    return root.children;
  }
  const body = new Element('body');
  document = { body, activeElement: body, querySelector: selector => body.querySelector(selector),
    querySelectorAll: selector => body.querySelectorAll(selector), createElement: tag => new Element(tag) };
  body.innerHTML = '<div id="app"></div><div id="modal-root"></div><div id="toast"></div>';
  mutations.length = 0;
  const nodes = { get: selector => document.querySelector(selector) };
  return { document, nodes, mutations, focusCalls };
}
