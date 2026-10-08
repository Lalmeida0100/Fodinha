/*
 * runtime.js — mini motor de interface do Fodinha (sem dependências).
 *
 * Lê o modelo de tela que está em <template id="app-template"> (index.html) e
 * o redesenha a cada mudança de estado, atualizando só o que mudou no DOM.
 *
 * Sintaxe aceita no modelo:
 *   {{ caminho.do.valor }}        texto ou atributo (só consulta, nunca expressão)
 *   onClick="{{ funcao }}"        eventos (onClick, onChange, onKeyDown…)
 *   <sc-if value="{{ cond }}">    bloco condicional
 *   <sc-for list="{{ itens }}" as="item">   repetição ({{ $index }} disponível)
 *
 * A lógica da tela fica em uma classe "Component extends DCLogic" com
 * this.state / this.setState / renderVals() / componentDidMount / componentDidUpdate.
 */
(function (global) {
  'use strict';

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ---------- compilação do modelo ---------- */
  function parseParts(str) {
    var parts = [], last = 0, m;
    HOLE.lastIndex = 0;
    while ((m = HOLE.exec(str))) {
      if (m.index > last) parts.push(str.slice(last, m.index));
      parts.push({ path: m[1] });
      last = m.index + m[0].length;
    }
    if (last < str.length) parts.push(str.slice(last));
    return parts;
  }

  function compile(node) {
    if (node.nodeType === 3) return { type: 'text', parts: parseParts(node.nodeValue) };
    if (node.nodeType !== 1) return null;
    var tag = node.localName;
    var kids = [];
    var src = tag === 'template' ? node.content.childNodes : node.childNodes;
    for (var i = 0; i < src.length; i++) { var c = compile(src[i]); if (c) kids.push(c); }
    if (tag === 'sc-if') return { type: 'if', cond: parseParts(node.getAttribute('value') || ''), children: kids };
    if (tag === 'sc-for') return { type: 'for', list: parseParts(node.getAttribute('list') || ''), as: node.getAttribute('as') || 'item', children: kids };
    var attrs = [];
    for (var a = 0; a < node.attributes.length; a++) {
      var at = node.attributes[a];
      if (at.name.indexOf('hint-') === 0) continue;
      attrs.push({ name: at.name, parts: parseParts(at.value) });
    }
    return { type: 'el', tag: tag, ns: node.namespaceURI === SVG_NS ? SVG_NS : null, attrs: attrs, children: kids };
  }

  /* ---------- avaliação ---------- */
  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var segs = path.split('.'), v = scope;
    for (var i = 0; i < segs.length; i++) {
      if (v == null) return undefined;
      v = v[segs[i]];
    }
    return v;
  }
  function evalParts(parts, scope) {
    if (parts.length === 1 && typeof parts[0] !== 'string') return lookup(parts[0].path, scope);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (typeof p === 'string') out += p;
      else { var v = lookup(p.path, scope); out += v == null ? '' : String(v); }
    }
    return out;
  }

  /* ---------- geração da árvore virtual ---------- */
  function render(node, scope, out) {
    if (node.type === 'text') { out.push({ t: 'text', text: String(evalParts(node.parts, scope) == null ? '' : evalParts(node.parts, scope)) }); return; }
    if (node.type === 'if') {
      if (evalParts(node.cond, scope)) renderAll(node.children, scope, out);
      return;
    }
    if (node.type === 'for') {
      var list = evalParts(node.list, scope);
      if (!list || !list.length) return;
      for (var i = 0; i < list.length; i++) {
        var s = Object.create(scope); s[node.as] = list[i]; s.$index = i;
        renderAll(node.children, s, out);
      }
      return;
    }
    var v = { t: 'el', tag: node.tag, ns: node.ns, attrs: {}, events: {}, children: [] };
    for (var a = 0; a < node.attrs.length; a++) {
      var at = node.attrs[a], val = evalParts(at.parts, scope);
      if (at.name.length > 2 && at.name.indexOf('on') === 0) { if (typeof val === 'function') v.events[at.name.slice(2)] = val; continue; }
      v.attrs[at.name] = val;
    }
    renderAll(node.children, scope, v.children);
    out.push(v);
  }
  function renderAll(nodes, scope, out) { for (var i = 0; i < nodes.length; i++) render(nodes[i], scope, out); return out; }

  /* ---------- aplicação no DOM ---------- */
  var PROPS = { value: 1, checked: 1, disabled: 1 };

  function eventType(el, name) {
    if (name === 'change' && el.localName === 'input' && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'file') return 'input';
    return name;
  }
  function setAttr(el, name, val) {
    if (PROPS[name] && !(el.namespaceURI === SVG_NS)) {
      if (name === 'value') { var s = val == null ? '' : String(val); if (el.value !== s) el.value = s; }
      else el[name] = !!val;
      return;
    }
    if (val === undefined || val === null || val === false) {
      if (name.indexOf('aria-') === 0 && val === false) el.setAttribute(name, 'false'); else el.removeAttribute(name);
      return;
    }
    if (val === true) { el.setAttribute(name, name.indexOf('aria-') === 0 ? 'true' : ''); return; }
    el.setAttribute(name, String(val));
  }
  function bindEvents(el, events) {
    var h = el.__h || (el.__h = {});
    for (var k in h) if (!events[k]) h[k] = null;
    for (var name in events) {
      if (!(name in h)) {
        (function (n) {
          el.addEventListener(eventType(el, n), function (e) { var fn = el.__h[n]; if (fn) fn(e); });
        })(name);
      }
      h[name] = events[name];
    }
  }
  function create(v) {
    if (v.t === 'text') { v.el = document.createTextNode(v.text); return v.el; }
    var el = v.ns ? document.createElementNS(v.ns, v.tag) : document.createElement(v.tag);
    for (var k in v.attrs) setAttr(el, k, v.attrs[k]);
    bindEvents(el, v.events);
    for (var i = 0; i < v.children.length; i++) el.appendChild(create(v.children[i]));
    v.el = el;
    return el;
  }
  function patch(parent, o, n) {
    if (o.t !== n.t || (n.t === 'el' && (o.tag !== n.tag || o.ns !== n.ns))) {
      parent.replaceChild(create(n), o.el);
      return;
    }
    n.el = o.el;
    if (n.t === 'text') { if (o.text !== n.text) n.el.nodeValue = n.text; return; }
    var el = n.el, k;
    for (k in o.attrs) if (!(k in n.attrs)) setAttr(el, k, undefined);
    for (k in n.attrs) if (o.attrs[k] !== n.attrs[k] || PROPS[k]) setAttr(el, k, n.attrs[k]);
    bindEvents(el, n.events);
    patchChildren(el, o.children, n.children);
  }
  function patchChildren(parent, oc, nc) {
    var len = Math.max(oc.length, nc.length);
    for (var i = 0; i < len; i++) {
      if (i >= oc.length) parent.appendChild(create(nc[i]));
      else if (i >= nc.length) { if (oc[i].el.parentNode === parent) parent.removeChild(oc[i].el); }
      else patch(parent, oc[i], nc[i]);
    }
  }

  /* ---------- classe base dos componentes ---------- */
  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
    this.__prev = null;
    this.__cbs = [];
    this.__queued = false;
  }
  DCLogic.prototype.setState = function (patchObj, cb) {
    if (!this.__prev) this.__prev = Object.assign({}, this.state);
    var p = typeof patchObj === 'function' ? patchObj(this.state, this.props) : patchObj;
    if (p) Object.assign(this.state, p);
    if (typeof cb === 'function') this.__cbs.push(cb);
    this.__schedule();
  };
  DCLogic.prototype.forceUpdate = function () { if (!this.__prev) this.__prev = Object.assign({}, this.state); this.__schedule(); };
  DCLogic.prototype.__schedule = function () {
    if (this.__queued) return;
    this.__queued = true;
    var self = this;
    Promise.resolve().then(function () { self.__flush(); });
  };
  DCLogic.prototype.__flush = function () {
    this.__queued = false;
    var prev = this.__prev; this.__prev = null;
    var cbs = this.__cbs; this.__cbs = [];
    this.__render();
    if (prev && this.componentDidUpdate) {
      try { this.componentDidUpdate(this.props, prev); } catch (e) { console.error(e); }
    }
    cbs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  };
  DCLogic.prototype.__render = function () {
    var vals;
    try { vals = this.renderVals(); } catch (e) { console.error('Erro ao montar a tela:', e); return; }
    var next = renderAll(this.__tpl, vals, []);
    patchChildren(this.__root, this.__vdom, next);
    this.__vdom = next;
  };

  /* Monta o componente dentro de `root` usando o modelo `templateEl`. */
  function mount(ComponentClass, templateEl, root, props) {
    var tpl = compile(templateEl).children;
    var inst = new ComponentClass(props || {});
    inst.__tpl = tpl;
    inst.__root = root;
    inst.__vdom = [];
    root.textContent = '';
    inst.__render();
    if (inst.componentDidMount) inst.componentDidMount();
    return inst;
  }

  global.DCLogic = DCLogic;
  global.FodinhaRuntime = { mount: mount };
})(window);
