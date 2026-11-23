
/*
 * app.js — regras e telas do Fodinha (roda 100% no navegador).
 * Os dados são lidos e gravados somente através de StorageService (storage.js).
 */
var LETTERS = ['F','O','D','I','N','H','A'];
var THEMES = [
  { key: 'mesa', name: 'Verde de mesa', a: '#0f3b2c', b: '#f4f1e8', c: '#1d5541' },
  { key: 'pb', name: 'Preto & branco', a: '#111111', b: '#f5f5f5', c: '#7a7a7a' },
  { key: 'laranja', name: 'Preto & laranja', a: '#0e0d0c', b: '#ff7a1a', c: '#25211e' },
  { key: 'classico', name: 'Baralho clássico', a: '#13213f', b: '#f6f7fb', c: '#d0342f' },
  { key: 'vintage', name: 'Baralho vintage', a: '#3a1420', b: '#f3e9d2', c: '#d4a84b' }
];
var LVL_LABEL = { ok: 'Vivo', warn: 'Atenção', risk: 'Perigo', dead: 'Eliminado' };
function uid() { return Math.random().toString(36).slice(2, 10); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function fmtDate(iso) { if (!iso) return ''; var d = new Date(iso); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' · ' + pad(d.getHours()) + 'h' + pad(d.getMinutes()); }
function level(l) { if (l >= 7) return 'dead'; if (l >= 5) return 'risk'; if (l >= 3) return 'warn'; return 'ok'; }
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function defaultSettings() { return { testa: true, startCards: 1, step: 1, decks: 1, deckSize: 40, deckCards: 40, limitMode: 'fixo', lettersMode: 'diferenca', overflow: 'imediato' }; }
var DECK_PRESETS = [40, 80];
var DECK_LABELS = { 40: '1 baralho (40 cartas)', 80: '2 baralhos (80 cartas)' };
/* Comparação de nomes sem diferenciar maiúsculas nem acentos. */
function foldName(n) { return String(n || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
var NO_CARDS_MSG = 'Não há cartas suficientes para essa quantidade de jogadores. Aumente a quantidade de cartas ou reduza o número de jogadores.';
/* Total de cartas disponíveis (jogos antigos: tamanho do baralho × baralhos). */
function deckOf(s) { return s.deckCards || ((s.deckSize || 40) * (s.decks || 1)); }
/* Máximo por jogador = ⌊cartas ÷ jogadores⌋. Fixo: jogadores do início. Recalcular: jogadores ativos. */
function maxFor(g, active) {
  var s = g.settings;
  var n = s.limitMode === 'recalcular' ? Math.max(1, active) : Math.max(1, g.players.length);
  return Math.max(0, Math.floor(deckOf(s) / n));
}
function startOf(s, max) { return Math.max(1, Math.min(s.startCards || 1, Math.max(1, max))); }
/* Ciclo: começa na carta inicial, cresce até o máximo, volta para a carta inicial. */
function cardsFor(g, n, active) {
  var s = g.settings, max = maxFor(g, active);
  if (max < 1) return 1;
  var start = startOf(s, max);
  if (n === 1) return s.testa ? 1 : start;
  var prev = g.rounds[n - 2] ? g.rounds[n - 2].cards : start;
  if (prev >= max) return start;
  return Math.min(prev + Math.max(0, s.step), max);
}
function cycleText(max, start, step) {
  if (max < 1) return '—';
  start = Math.max(1, Math.min(start, max));
  if (step <= 0) return start + ' carta(s) em todas as rodadas';
  var seq = [], c = start;
  while (true) { seq.push(c); if (c >= max) break; c = Math.min(c + step, max); }
  if (seq.length > 8) seq = seq.slice(0, 3).concat(['…']).concat(seq.slice(-2));
  return seq.join(' → ') + ' → ↻ ' + start;
}
/* ---------- ordem da mesa ---------- */
var BID_BLOCK_MSG = 'Esse palpite não é permitido nesta rodada. Escolha outro valor.';
var BID_RULE_MSG = 'O total dos palpites não pode ser igual ao número de cartas da rodada.';
/* Jogos antigos sem mesa: ordem de cadastro, sentido horário, primeiro cadastrado começa. */
function tableOf(g) {
  var t = g.table || {}, ids = g.players.map(function (p) { return p.id; });
  var order = (t.order || ids).filter(function (id) { return ids.indexOf(id) >= 0; });
  ids.forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
  return { order: order, dir: t.dir === 'anti' ? 'anti' : 'horario', first: order.indexOf(t.first) >= 0 ? t.first : order[0] };
}
/* Anel de fala: a ordem original da mesa, invertida no anti-horário. Nunca muda com eliminações. */
function ringFrom(order, dir) { return dir === 'anti' ? [order[0]].concat(order.slice(1).reverse()) : order.slice(); }
function ringOf(g) { var t = tableOf(g); return ringFrom(t.order, t.dir); }
function nextAfter(ring, cur, alive) {
  var i = ring.indexOf(cur);
  for (var k = 1; k <= ring.length; k++) { var id = ring[(i + k) % ring.length]; if (alive.indexOf(id) >= 0) return id; }
  return cur;
}
function orderFrom(ring, starter, alive) {
  var i = Math.max(0, ring.indexOf(starter)), out = [];
  for (var k = 0; k < ring.length; k++) { var id = ring[(i + k) % ring.length]; if (alive.indexOf(id) >= 0) out.push(id); }
  return out;
}
/* Quem começa a rodada n: rodada 1 = primeiro escolhido; depois, o jogador ativo seguinte a quem começou a anterior. */
function starterFor(g, n, alive) {
  var t = tableOf(g), ring = ringOf(g);
  if (n <= 1) return alive.indexOf(t.first) >= 0 ? t.first : nextAfter(ring, t.first, alive);
  var prev = g.rounds[n - 2];
  var ps = prev && prev.starter ? prev.starter : starterFor(g, n - 1, alive);
  return nextAfter(ring, ps, alive);
}
function dirLabel(d) { return d === 'anti' ? '↺ Anti-horário' : '↻ Horário'; }

/* Estado derivado: tudo é recalculado a partir das rodadas (edição/desfazer ficam consistentes). */
function derive(g) {
  var s = g.settings;
  var ps = g.players.map(function (p, i) { return { id: p.id, name: p.name, order: i, letters: 0, raw: 0, status: 'vivo', elimRound: null, series: [], plays: 0, hits: 0, tricks: 0, recv: 0 }; });
  var out = [], ended = false, endIndex = -1;
  for (var i = 0; i < g.rounds.length; i++) {
    var r = g.rounds[i], num = i + 1;
    var aliveBefore = ps.filter(function (p) { return p.status !== 'elim'; }).length;
    var rows = [];
    ps.forEach(function (p) {
      if (p.status === 'elim') { p.series.push({ l: p.letters, st: 'gone' }); return; }
      var res = r.results[p.id];
      if (!res) { rows.push({ pid: p.id, name: p.name, missing: true, total: p.letters, before: p.letters }); p.series.push({ l: p.letters, st: 'skip' }); return; }
      var bid = res.bid | 0, tr = res.tricks | 0, diff = Math.abs(bid - tr);
      var base = diff === 0 ? 0 : (s.lettersMode === 'um' ? 1 : diff);
      var before = p.letters, nl = before + base;
      if (s.overflow === 'segura' && before < 6 && nl > 7) nl = 6;
      if (nl > 7) nl = 7;
      p.raw += base; p.plays++; if (diff === 0) p.hits++; p.tricks += tr; p.recv += nl - before; p.letters = nl;
      var el = nl >= 7;
      if (el) { p.status = 'elim'; p.elimRound = num; }
      rows.push({ pid: p.id, name: p.name, bid: bid, tricks: tr, diff: diff, recv: nl - before, base: base, before: before, total: nl, hit: diff === 0, elim: el });
      p.series.push({ l: nl, st: el ? 'elim' : 'play' });
    });
    out.push({ number: num, cards: r.cards, type: r.type, at: r.at, rows: rows, active: r.active || aliveBefore, max: r.max || maxFor(g, aliveBefore), starter: r.starter || null, order: r.order || null, dir: r.dir || null });
    var aliveAfter = ps.filter(function (p) { return p.status !== 'elim'; }).length;
    if (aliveBefore > 1 && aliveAfter <= 1) { ended = true; endIndex = i; break; }
  }
  var sorted = ps.slice().sort(function (a, b) {
    var ad = a.status === 'elim', bd = b.status === 'elim';
    if (ad !== bd) return ad ? 1 : -1;
    if (!ad) return (a.letters - b.letters) || (a.order - b.order);
    return (b.elimRound - a.elimRound) || (a.raw - b.raw) || (a.order - b.order);
  });
  var pos = 0, prevKey = null;
  sorted.forEach(function (p, idx) {
    var k = p.status === 'elim' ? ('e' + p.elimRound + '_' + p.raw) : ('a' + p.letters);
    if (k !== prevKey) { pos = idx + 1; prevKey = k; }
    p.pos = pos;
  });
  var winners = [];
  if (ended) {
    var alive = ps.filter(function (p) { return p.status !== 'elim'; });
    winners = alive.length === 1 ? [alive[0].id] : sorted.filter(function (p) { return p.pos === 1; }).map(function (p) { return p.id; });
  }
  return { ps: ps, rounds: out, ended: ended, endIndex: endIndex, sorted: sorted, winners: winners, alive: ps.filter(function (p) { return p.status !== 'elim'; }) };
}

function finalize(g) {
  var d = derive(g), cut = 0;
  if (d.ended && d.endIndex < g.rounds.length - 1) { cut = g.rounds.length - 1 - d.endIndex; g.rounds = g.rounds.slice(0, d.endIndex + 1); }
  if (d.ended) { if (g.status !== 'finalizado' || !g.endedAt) g.endedAt = new Date().toISOString(); g.status = 'finalizado'; g.winnerIds = d.winners; }
  else { g.status = 'andamento'; g.winnerIds = []; g.endedAt = null; }
  return cut;
}
function leaderOf(d) {
  if (d.alive.length < 2) return null;
  var min = Math.min.apply(null, d.alive.map(function (p) { return p.letters; }));
  var ls = d.alive.filter(function (p) { return p.letters === min; });
  return ls.length === 1 ? ls[0].id : null;
}
function nameOf(g, id) { var p = g.players.filter(function (x) { return x.id === id; })[0]; return p ? p.name : '?'; }
function winnerText(g) { if (!g.winnerIds || !g.winnerIds.length) return ''; return g.winnerIds.map(function (id) { return nameOf(g, id); }).join(' e '); }

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = {
      screen: 'home', tab: 'mesa', games: [], seq: 1, prefs: { theme: 'mesa', maxPlayers: 6 },
      currentId: null, draft: null, entry: null, modal: null, elim: null, toast: null, open: {}
    };
  }
  componentDidMount() {
    var data = StorageService.loadAll(), games = data.games;
    var known = StorageService.mergePlayers(data.players, [].concat.apply([], games.map(function (g) { return g.players.map(function (p) { return p.name; }); })));
    this.setState({ games: games, seq: data.seq, prefs: data.prefs, knownPlayers: known, persistent: StorageService.isPersistent() });
    /* Retoma a rodada que estava sendo lançada quando o app fechou. */
    var dr = StorageService.loadDraft();
    if (dr) {
      var g = games.filter(function (x) { return x.id === dr.gameId; })[0];
      if (this.draftValid(g, dr)) {
        this.setState({ currentId: g.id, entry: dr.entry, screen: dr.screen === 'conf' ? 'conf' : 'reg', tab: 'mesa', open: {} });
        this.showToast('Rodada ' + (dr.entry.idx + 1) + ' retomada de onde parou.');
      } else { StorageService.clearDraft(); }
    }
    /* Indicador de modo offline (o app continua funcionando normalmente). */
    var self = this;
    this._net = function () { self.setState({ offline: navigator.onLine === false }); };
    window.addEventListener('online', this._net);
    /* fecha a lista de jogadores ao tocar fora do campo */
    this._outside = function (e) {
      var dd = self.state.draft;
      if (dd && dd.listOpen && !(e.target && e.target.closest && e.target.closest('.combo'))) self.setDraft({ listOpen: false });
    };
    document.addEventListener('pointerdown', this._outside);
    window.addEventListener('offline', this._net);
    this._net();
  }
  /* Rascunho só vale se a partida não mudou desde que foi salvo. */
  draftValid(g, dr) {
    if (!g || !dr || !dr.entry || g.status === 'finalizado') return false;
    var e = dr.entry;
    if (!e.pids || !e.values || dr.roundsLen !== g.rounds.length) return false;
    if (e.mode === 'new' && e.idx !== g.rounds.length) return false;
    if (e.mode === 'edit' && !(e.idx < g.rounds.length)) return false;
    var pre = derive(Object.assign({}, g, { rounds: g.rounds.slice(0, e.idx) }));
    var alive = pre.alive.map(function (p) { return p.id; });
    if (alive.length !== e.pids.length) return false;
    return e.pids.every(function (id) { return alive.indexOf(id) >= 0 && e.values[id]; });
  }
  /* Salvamento automático: cada partida alterada é gravada assim que muda. */
  componentDidUpdate(pp, ps) {
    var st = this.state;
    if (ps.games !== st.games) {
      var prevMap = {}, nowIds = {};
      (ps.games || []).forEach(function (g) { prevMap[g.id] = g; });
      st.games.forEach(function (g) { nowIds[g.id] = 1; if (prevMap[g.id] !== g) StorageService.saveGame(g); });
      (ps.games || []).forEach(function (g) { if (!nowIds[g.id]) StorageService.deleteGame(g.id); });
    }
    if (ps.seq !== st.seq || ps.prefs !== st.prefs || ps.knownPlayers !== st.knownPlayers) StorageService.saveMeta(st.seq, st.prefs, st.knownPlayers);
    if (ps.entry !== st.entry || ps.screen !== st.screen) {
      var g = this.cur();
      if (st.entry && g && (st.screen === 'reg' || st.screen === 'conf')) {
        StorageService.saveDraft({ gameId: g.id, entry: st.entry, screen: st.screen, roundsLen: g.rounds.length, at: new Date().toISOString() });
      } else if (!st.entry) {
        StorageService.clearDraft();
      }
    }
  }
  /* ---------- backup e dados ---------- */
  summarize(g) {
    var d = derive(g);
    return {
      id: g.id, nome: g.name, status: g.status, criadaEm: g.createdAt, rodadas: g.rounds.length, vencedor: winnerText(g) || null,
      jogadores: d.sorted.map(function (p) { return { nome: p.name, posicao: p.pos, letras: p.letters, status: p.status === 'elim' ? 'eliminado' : 'ativo', eliminadoNaRodada: p.elimRound, acertos: p.hits, palpites: p.plays, vazas: p.tricks, letrasRecebidas: p.recv }; })
    };
  }
  exportBackup() {
    var self = this, data = StorageService.exportBackup(function (g) { return self.summarize(g); });
    try {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'fodinha-backup.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      this.setState({ dataMsg: { ok: true, text: 'Backup gerado: fodinha-backup.json (' + plural(data.games.length, 'partida', 'partidas') + ').' } });
    } catch (e) {
      this.setState({ dataMsg: { ok: false, text: 'Não foi possível gerar o arquivo neste navegador.' } });
    }
  }
  importFile(ev) {
    var input = ev.target, file = input.files && input.files[0], self = this;
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var r = StorageService.importBackup(String(reader.result || ''), uid);
      input.value = '';
      if (!r.ok) { self.setState({ dataMsg: { ok: false, text: r.error } }); return; }
      var data = StorageService.loadAll();
      var parts = [plural(r.added, 'partida importada', 'partidas importadas')];
      if (r.copies) parts.push(plural(r.copies, 'importada como cópia (já existia com outro conteúdo)', 'importadas como cópia (já existiam com outro conteúdo)'));
      if (r.skipped) parts.push(plural(r.skipped, 'já existia igual e foi ignorada', 'já existiam iguais e foram ignoradas'));
      if (r.invalid) parts.push(plural(r.invalid, 'inválida ignorada', 'inválidas ignoradas'));
      self.setState({ games: data.games, seq: data.seq, prefs: data.prefs, knownPlayers: StorageService.mergePlayers(self.state.knownPlayers, data.players.map(function (p) { return p.name; })), dataMsg: { ok: true, text: 'Importação concluída: ' + parts.join(' · ') + '.' } });
    };
    reader.onerror = function () { input.value = ''; self.setState({ dataMsg: { ok: false, text: 'Não foi possível ler o arquivo.' } }); };
    reader.readAsText(file);
  }
  wipeAll() {
    StorageService.clearAll();
    this.setState({ games: [], seq: 1, prefs: { theme: 'mesa', maxPlayers: 6 }, knownPlayers: [], currentId: null, entry: null, modal: null, screen: 'home', dataMsg: null });
    this.showToast('Todos os dados deste aparelho foram apagados.');
  }
  componentWillUnmount() { clearTimeout(this._t1); clearTimeout(this._t2); window.removeEventListener('online', this._net); window.removeEventListener('offline', this._net); }

  cur() { var id = this.state.currentId; return this.state.games.filter(function (g) { return g.id === id; })[0] || null; }
  mutate(fn, extra) {
    var id = this.state.currentId, ret;
    var games = this.state.games.map(function (g) { if (g.id !== id) return g; var c = clone(g); ret = fn(c); return c; });
    this.setState(Object.assign({ games: games }, extra || {}));
    return ret;
  }
  showToast(msg) { var self = this; clearTimeout(this._t1); this.setState({ toast: msg }); this._t1 = setTimeout(function () { self.setState({ toast: null }); }, 2600); }
  log(g, action, player, before, after) { g.log = g.log || []; g.log.push({ at: new Date().toISOString(), action: action, player: player || null, before: before == null ? null : before, after: after == null ? null : after }); }

  /* ---------- navegação ---------- */
  goHome() { this.setState({ screen: 'home', entry: null, modal: null }); }
  goList() { this.setState({ screen: 'list' }); }
  goNew() {
    this.setState({ screen: 'setup', draft: { name: '', players: [], newName: '', testa: true, multiDeck: false, deckCards: 40, deckCustom: false, limitMode: 'fixo', step: 'players', first: null, dir: 'horario' } });
  }
  /* Duplicar: nova partida com as configurações da original; abre o cadastro de jogadores. A original não muda. */
  duplicateGame(id) {
    var g = this.state.games.filter(function (x) { return x.id === id; })[0]; if (!g) return;
    var t = tableOf(g), map = {};
    var players = t.order.map(function (pid) { var nid = uid(); map[pid] = nid; return { id: nid, name: nameOf(g, pid) }; });
    var s = g.settings || {};
    var deck = deckOf(s);
    this.setState({ screen: 'setup', draft: {
      name: (g.name || 'Jogo') + ' (cópia)', players: players, newName: '', testa: s.testa !== false,
      multiDeck: (s.decks || 1) > 1, deckCards: deck, deckCustom: DECK_PRESETS.indexOf(deck) < 0, limitMode: s.limitMode || 'fixo',
      step: 'players', first: map[t.first] || null, dir: t.dir, baseSettings: clone(s), theme: g.theme || null, fromName: g.name
    } });
  }
  /* Reiniciar: zera rodadas, letras, eliminações e histórico; mantém jogadores, mesa e configurações. */
  restartGame(id) {
    var self = this, now = new Date().toISOString(), restarted = null;
    var games = this.state.games.map(function (g) {
      if (g.id !== id) return g;
      var c = clone(g);
      c.rounds = []; c.imports = []; c.winnerIds = []; c.status = 'andamento'; c.endedAt = null; c.startedAt = now;
      c.log = [];
      self.log(c, 'Partida reiniciada', null, null, 'Rodadas, letras e eliminações zeradas. Configurações mantidas.');
      restarted = c;
      return c;
    });
    if (!restarted) return;
    var dr = StorageService.loadDraft(); if (dr && dr.gameId === id) StorageService.clearDraft();
    var curEntry = this.state.currentId === id ? null : this.state.entry;
    this.setState({ games: games, modal: null, entry: curEntry, currentId: id, screen: 'game', tab: 'mesa', open: {} });
    this.showToast('Partida reiniciada. Começando da rodada 1.');
  }
  openGame(id, tab, screen) { this.setState({ currentId: id, screen: screen || 'game', tab: tab || 'mesa', open: {} }); }

  /* ---------- novo jogo ---------- */
  setDraft(patch) { this.setState({ draft: Object.assign({}, this.state.draft, patch) }); }
  addPlayer() {
    var d = this.state.draft, n = (d.newName || '').trim();
    if (!n || this.limitReached()) return;
    this.setDraft({ players: d.players.concat([{ id: uid(), name: n }]), newName: '', listOpen: false });
  }
  limitReached() { var d = this.state.draft; var max = d.multiDeck ? Math.max(12, this.state.prefs.maxPlayers * 2) : this.state.prefs.maxPlayers; return d.players.length >= max; }
  startGame() {
    var d = this.state.draft, st = this.state;
    var players = d.players.map(function (p, i) { return { id: p.id, name: (p.name || '').trim() || ('Jogador ' + (i + 1)), order: i }; });
    if (players.length < 3) return;
    var deck = d.deckCards | 0;
    if (deck < 1 || Math.floor(deck / players.length) < 1) return;
    var auto = !(d.name || '').trim();
    var now = new Date().toISOString();
    var s = Object.assign(defaultSettings(), d.baseSettings ? clone(d.baseSettings) : {}); s.testa = d.testa; s.decks = d.multiDeck ? 2 : 1;
    s.deckCards = deck; s.limitMode = d.limitMode || 'fixo'; s.maxCards = Math.floor(deck / players.length);
    var ids = players.map(function (p) { return p.id; });
    var table = { order: ids, dir: d.dir === 'anti' ? 'anti' : 'horario', first: ids.indexOf(d.first) >= 0 ? d.first : ids[0] };
    var g = { id: uid(), name: auto ? ('JOGO ' + pad(st.seq)) : d.name.trim(), status: 'andamento', createdAt: now, startedAt: now, endedAt: null, theme: d.theme || st.prefs.theme, settings: s, players: players, table: table, rounds: [], winnerIds: [], log: [] };
    this.log(g, d.fromName ? 'Partida criada (cópia de "' + d.fromName + '")' : 'Partida criada', null, null, players.map(function (p) { return p.name; }).join(', '));
    this.log(g, 'Ordem da mesa definida', null, null, orderFrom(ringFrom(table.order, table.dir), table.first, ids).map(function (id) { return nameOf(g, id); }).join(' → ') + ' · ' + dirLabel(table.dir));
    this.setState({ games: [g].concat(st.games), knownPlayers: StorageService.mergePlayers(st.knownPlayers, players.map(function (p) { return p.name; })), seq: auto ? st.seq + 1 : st.seq, currentId: g.id, screen: 'game', tab: 'mesa', draft: null, open: {} });
  }

  /* ---------- lançamento ---------- */
  openRegister() {
    var g = this.cur(); if (!g || g.status === 'finalizado') return;
    var d = derive(g), n = g.rounds.length + 1, vals = {};
    d.alive.forEach(function (p) { vals[p.id] = { bid: 0, tricks: 0 }; });
    var mx = maxFor(g, d.alive.length);
    if (mx < 1) { this.showToast(NO_CARDS_MSG); return; }
    var aliveIds = d.alive.map(function (p) { return p.id; });
    var starter = starterFor(g, n, aliveIds), order = orderFrom(ringOf(g), starter, aliveIds);
    this.setState({ screen: 'reg', entry: { mode: 'new', idx: g.rounds.length, cards: cardsFor(g, n, d.alive.length), max: mx, active: d.alive.length, type: (g.settings.testa && n === 1) ? 'testa' : 'normal', starter: starter, dir: tableOf(g).dir, pids: order, values: vals, stage: 'bids', cursor: 0 } });
  }
  openEdit(idx) {
    var g = this.cur(); if (!g) return;
    var pre = derive(Object.assign({}, g, { rounds: g.rounds.slice(0, idx) }));
    var r = g.rounds[idx], vals = {};
    pre.alive.forEach(function (p) { var x = r.results[p.id]; vals[p.id] = { bid: x ? x.bid : 0, tricks: x ? x.tricks : 0 }; });
    var emax = Math.max(1, r.max || maxFor(g, pre.alive.length));
    var aliveIds = pre.alive.map(function (p) { return p.id; }), ring = ringOf(g);
    var starter = r.starter && aliveIds.indexOf(r.starter) >= 0 ? r.starter : (r.starter ? nextAfter(ring, r.starter, aliveIds) : starterFor(g, idx + 1, aliveIds));
    this.setState({ screen: 'reg', entry: { mode: 'edit', idx: idx, cards: Math.min(r.cards, emax), max: emax, active: pre.alive.length, type: r.type, starter: starter, dir: r.dir || tableOf(g).dir, pids: orderFrom(ring, starter, aliveIds), values: vals, stage: 'bids', cursor: 0 } });
  }
  patchEntry(p) { this.setState({ entry: Object.assign({}, this.state.entry, p) }); }
  forbiddenOf(e) {
    var last = e.pids.length - 1, s = 0;
    for (var j = 0; j < last; j++) s += e.values[e.pids[j]].bid;
    return e.cards - s;
  }
  /* Ao chegar no último jogador, tira o valor inicial do número proibido. */
  fixLast(e) {
    var lastId = e.pids[e.pids.length - 1], f = this.forbiddenOf(e), v = e.values[lastId];
    if (v.bid === f) { var alt = f - 1 >= 0 ? f - 1 : f + 1; if (alt <= e.cards) v.bid = alt; }
  }
  setBid(val) {
    var e = clone(this.state.entry), pid = e.pids[e.cursor], isLast = e.cursor === e.pids.length - 1;
    if (val < 0 || val > e.cards) return;
    if (isLast && val === this.forbiddenOf(e)) return;
    e.values[pid].bid = val; this.setState({ entry: e });
  }
  stepBid(delta) {
    var e = this.state.entry, pid = e.pids[e.cursor], isLast = e.cursor === e.pids.length - 1;
    var val = e.values[pid].bid + delta;
    if (isLast && val === this.forbiddenOf(e)) val += delta;
    if (val < 0 || val > e.cards) return;
    this.setBid(val);
  }
  okBid() {
    var e = clone(this.state.entry), last = e.pids.length - 1;
    if (e.cursor === last) {
      if (e.values[e.pids[last]].bid === this.forbiddenOf(e)) { this.showToast(BID_BLOCK_MSG); return; }
      e.stage = 'bidsum';
    } else { e.cursor++; if (e.cursor === last) this.fixLast(e); }
    this.setState({ entry: e });
  }
  setTricks(pid, val) {
    var e = clone(this.state.entry);
    if (val < 0 || val > e.cards) return;
    e.values[pid].tricks = val; this.setState({ entry: e });
  }
  /* Tela única: qualquer jogador altera o próprio palpite; o último pula o valor proibido. */
  bidNext(e, pid, delta) {
    var isLast = pid === e.pids[e.pids.length - 1], f = this.forbiddenOf(e);
    var n = e.values[pid].bid + delta;
    if (isLast && n === f) n += delta;
    return (n < 0 || n > e.cards) ? null : n;
  }
  stepBidFor(pid, delta) {
    var e = clone(this.state.entry), n = this.bidNext(e, pid, delta);
    if (n == null) return;
    e.values[pid].bid = n; this.setState({ entry: e });
  }
  cycleBid(pid) {
    var e = clone(this.state.entry), n = this.bidNext(e, pid, 1);
    if (n == null) { n = 0; var isLast = pid === e.pids[e.pids.length - 1]; if (isLast && n === this.forbiddenOf(e)) n = 1; if (n > e.cards) return; }
    e.values[pid].bid = n; this.setState({ entry: e });
  }
  trickSum(e) { return e.pids.reduce(function (a, id) { return a + e.values[id].tricks; }, 0); }
  stepTricksFor(pid, delta) {
    var e = clone(this.state.entry), n = e.values[pid].tricks + delta;
    if (n < 0 || n > e.cards) return;
    if (delta > 0 && this.trickSum(e) >= e.cards) return;
    e.values[pid].tricks = n; this.setState({ entry: e });
  }
  okTricks() {
    var e = this.state.entry;
    if (e.cursor >= e.pids.length - 1) this.patchEntry({ stage: 'tricksum' }); else this.patchEntry({ cursor: e.cursor + 1 });
  }
  setVal(pid, field, delta) {
    var e = this.state.entry, v = clone(e.values);
    v[pid][field] = Math.max(0, Math.min(e.cards, v[pid][field] + delta));
    this.setState({ entry: Object.assign({}, e, { values: v }) });
  }
  setCards(delta) {
    var e = this.state.entry, c = Math.max(1, Math.min(e.max || 1, e.cards + delta)), v = clone(e.values);
    Object.keys(v).forEach(function (k) { v[k].bid = Math.min(v[k].bid, c); v[k].tricks = Math.min(v[k].tricks, c); });
    var ne = Object.assign({}, e, { cards: c, values: v });
    if (ne.stage === 'bids' && ne.cursor === ne.pids.length - 1) this.fixLast(ne);
    this.setState({ entry: ne });
  }
  roundFromEntry(e, g) {
    return { cards: Math.max(1, Math.min(e.cards, e.max || e.cards)), max: e.max, active: e.active, type: e.type, starter: e.starter, order: e.pids.slice(), dir: e.dir, at: e.mode === 'edit' ? g.rounds[e.idx].at : new Date().toISOString(), results: clone(e.values) };
  }
  hypo() {
    var g = this.cur(), e = this.state.entry, h = clone(g);
    var round = this.roundFromEntry(e, g);
    if (e.mode === 'new') h.rounds.push(round); else h.rounds[e.idx] = round;
    return { g: h, round: round };
  }
  confirmRound() {
    var e = this.state.entry, g0 = this.cur(); if (!e || !g0) return;
    if (e.values[e.pids[e.pids.length - 1]].bid === this.forbiddenOf(e)) { this.showToast(BID_BLOCK_MSG); return; }
    var tsum = e.pids.reduce(function (a, id) { return a + e.values[id].tricks; }, 0);
    if (tsum !== e.cards) { this.showToast('A soma das vazas realizadas é ' + tsum + ', mas esta rodada possui ' + plural(e.cards, 'carta', 'cartas') + '.'); return; }
    var before = derive(g0), leadBefore = leaderOf(before);
    var willEnd = derive(this.hypo().g).ended;
    var self = this, info = {};
    this.mutate(function (g) {
      var round = self.roundFromEntry(e, g);
      var n = e.idx + 1;
      if (e.mode === 'new') {
        g.rounds.push(round);
        self.log(g, 'Rodada ' + n + ' registrada', nameOf(g, e.starter), null, plural(e.cards, 'carta', 'cartas') + ' · começou ' + nameOf(g, e.starter) + ' · ' + e.pids.map(function (id) { return nameOf(g, id); }).join(' → '));
      } else {
        var old = g.rounds[e.idx];
        e.pids.forEach(function (pid) {
          var o = old.results[pid], nv = round.results[pid];
          var ob = o ? ('P' + o.bid + '/F' + o.tricks) : '—', nb = 'P' + nv.bid + '/F' + nv.tricks;
          if (ob !== nb) self.log(g, 'Rodada ' + n + ' editada', nameOf(g, pid), ob, nb);
        });
        if (old.cards !== round.cards) self.log(g, 'Rodada ' + n + ' editada', null, plural(old.cards, 'carta', 'cartas'), plural(round.cards, 'carta', 'cartas'));
        g.rounds[e.idx] = round;
      }
      var prevElim = before.ps.filter(function (p) { return p.status === 'elim'; }).map(function (p) { return p.id; });
      info.cut = finalize(g);
      var d = derive(g);
      var nowElim = d.ps.filter(function (p) { return p.status === 'elim' && prevElim.indexOf(p.id) < 0; });
      var revived = before.ps.filter(function (p) { return p.status === 'elim'; }).filter(function (p) { return d.ps.filter(function (q) { return q.id === p.id && q.status !== 'elim'; }).length; });
      nowElim.forEach(function (p) { self.log(g, p.name + ' eliminado', p.name, null, 'Rodada ' + p.elimRound); });
      revived.forEach(function (p) { self.log(g, p.name + ' voltou ao jogo', p.name, 'eliminado', 'vivo'); });
      if (info.cut) self.log(g, 'Rodadas descartadas', null, null, plural(info.cut, 'rodada posterior ao fim da partida', 'rodadas posteriores ao fim da partida'));
      if (g.status === 'finalizado' && g0.status !== 'finalizado') self.log(g, 'Partida finalizada', null, null, 'Vencedor: ' + winnerText(g));
      info.elimNames = nowElim.map(function (p) { return p.name.toUpperCase(); });
      info.revived = revived.map(function (p) { return p.name; });
      info.done = g.status === 'finalizado';
      info.lead = leaderOf(d); info.leadName = info.lead ? nameOf(g, info.lead) : null;
    }, { entry: null, screen: (e.mode === 'new' && !willEnd) ? 'done' : 'game', tab: e.mode === 'edit' ? 'hist' : 'mesa' });
    if (info.elimNames.length) {
      this.setState({ elim: { names: info.elimNames, then: info.done ? 'over' : null } });
      clearTimeout(this._t2);
      this._t2 = setTimeout(function () { self.dismissElim(); }, 2600);
    } else if (info.done) {
      this.setState({ screen: 'over' });
    }
    if (info.cut) this.showToast('A partida terminou antes: ' + plural(info.cut, 'rodada posterior foi descartada', 'rodadas posteriores foram descartadas') + '.');
    else if (info.revived.length) this.showToast(info.revived.join(', ') + ' voltou para a partida.');
    else if (!info.done && info.lead && info.lead !== leadBefore) this.showToast('Novo líder: ' + info.leadName);
    else if (e.mode === 'edit') this.showToast('Rodada ' + (e.idx + 1) + ' corrigida. Tudo recalculado.');
  }
  dismissElim() {
    var el = this.state.elim; if (!el) return;
    clearTimeout(this._t2);
    this.setState(el.then === 'over' ? { elim: null, screen: 'over' } : { elim: null });
  }
  doUndo() {
    var g0 = this.cur(); if (!g0 || !g0.rounds.length) return;
    var n = g0.rounds.length, self = this;
    this.mutate(function (g) { g.rounds.pop(); finalize(g); self.log(g, 'Rodada ' + n + ' desfeita', null, null, null); }, { modal: null, screen: 'game' });
    this.showToast('Rodada ' + n + ' desfeita.');
  }

  /* ---------- render ---------- */
  renderVals() {
    var self = this, st = this.state, scr = st.screen, g = this.cur();
    var themeKey = (g && scr !== 'home' && scr !== 'list' && scr !== 'setup') ? (g.theme || st.prefs.theme) : st.prefs.theme;
    var v = {
      themeKey: themeKey,
      isHome: scr === 'home', isData: scr === 'data', offline: !!st.offline,
      goData: function () { self.setState({ screen: 'data', dataMsg: null }); }, isSetup: scr === 'setup', isList: scr === 'list', isGame: scr === 'game' && !!g,
      isReg: scr === 'reg' && !!st.entry, isConf: scr === 'conf' && !!st.entry, isSet: scr === 'settings' && !!g, isOver: scr === 'over' && !!g, isDone: scr === 'done' && !!g,
      nextRound: function () { self.openRegister(); },
      noGames: st.games.length === 0,
      toast: st.toast,
      goHome: function () { self.goHome(); }, goList: function () { self.goList(); }, goNew: function () { self.goNew(); },
      goSettings: function () { self.setState({ screen: 'settings' }); },
      backToGame: function () { self.setState({ screen: 'game' }); },
      goOver: function () { self.setState({ screen: 'over' }); },
      viewFinished: function () { self.setState({ screen: 'game', tab: 'hist' }); },
      openRegister: function () { self.openRegister(); },
      cancelEntry: function () { self.setState({ screen: 'game', entry: null }); },
      goConfirm: function () { self.setState({ screen: 'conf' }); },
      backToReg: function () { self.setState({ screen: 'reg' }); },
      confirmRound: function () { self.confirmRound(); },
      askUndo: function () { var gg = self.cur(); if (gg && gg.rounds.length) self.setState({ modal: { type: 'undo' } }); },
      closeModal: function () { self.setState({ modal: null }); },
      dismissElim: function () { self.dismissElim(); },
      maxPlayers: st.prefs.maxPlayers
    };

    /* setup */
    if (scr === 'setup' && st.draft) {
      var d = st.draft, np = d.players.length;
      v.draft = d;
      v.autoName = 'JOGO ' + pad(st.seq);
      v.setupTitle = d.fromName ? 'DUPLICAR JOGO' : 'NOVO JOGO';
      /* sugestões da base geral de jogadores: tocar só preenche o campo; ADICIONAR confirma */
      /* lista suspensa da base geral de jogadores: selecionar só preenche o campo; ADICIONAR confirma */
      var inDraft = {}; d.players.forEach(function (p) { inDraft[foldName(p.name)] = 1; });
      var typed = foldName(d.newName);
      var avail = (st.knownPlayers || []).filter(function (p) { return !inDraft[foldName(p.name)]; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
      var opts = avail.filter(function (p) { return !typed || foldName(p.name).indexOf(typed) >= 0; });
      v.comboOpen = !!d.listOpen;
      v.comboRot = d.listOpen ? '180deg' : '0deg';
      v.comboArrowLabel = d.listOpen ? 'Fechar lista de jogadores cadastrados' : 'Abrir lista de jogadores cadastrados';
      v.comboOptions = opts.map(function (p) {
        var on = foldName(p.name) === typed;
        return { name: p.name, cls: on ? 'on' : '', sel: on, pick: function () { self.setDraft({ newName: p.name, listOpen: false }); var el = document.getElementById('newp'); if (el) el.focus(); } };
      });
      v.comboEmpty = opts.length ? '' : (!avail.length ? 'Nenhum jogador cadastrado ainda. Digite o nome e toque em ADICIONAR.' : 'Nenhum jogador cadastrado com esse nome. Toque em ADICIONAR para incluir "' + (d.newName || '').trim() + '".');
      v.toggleCombo = function () { self.setDraft({ listOpen: !self.state.draft.listOpen }); };
      v.setupCount = np + (np === 1 ? ' jogador' : ' jogadores');
      v.setupPlayers = d.players.map(function (p, i) {
        return {
          num: i + 1, name: p.name, inputId: 'pl-' + p.id, first: i === 0, last: i === np - 1,
          rename: function (ev) { var ps = d.players.slice(); ps[i] = Object.assign({}, p, { name: ev.target.value }); self.setDraft({ players: ps }); },
          up: function () { if (i === 0) return; var ps = d.players.slice(); var t = ps[i - 1]; ps[i - 1] = ps[i]; ps[i] = t; self.setDraft({ players: ps }); },
          down: function () { if (i === np - 1) return; var ps = d.players.slice(); var t = ps[i + 1]; ps[i + 1] = ps[i]; ps[i] = t; self.setDraft({ players: ps }); },
          remove: function () { self.setDraft({ players: d.players.filter(function (x) { return x.id !== p.id; }) }); }
        };
      });
      v.setDraftName = function (ev) { self.setDraft({ name: ev.target.value }); };
      v.setNewName = function (ev) { var val = ev.target.value; self.setDraft({ newName: val, listOpen: val.trim() ? true : self.state.draft.listOpen }); };
      v.newNameKey = function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); self.addPlayer(); }
        else if (ev.key === 'Escape') { self.setDraft({ listOpen: false }); }
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); if (!self.state.draft.listOpen) self.setDraft({ listOpen: true }); else { var f = document.querySelector('#newp-list .combo-opt'); if (f) f.focus(); } }
      };
      v.addPlayer = function () { self.addPlayer(); };
      v.toggleTesta = function () { self.setDraft({ testa: !d.testa }); };
      v.toggleMultiDeck = function () {
        var on = !d.multiDeck, patch = { multiDeck: on };
        if (on && !d.deckCustom && (d.deckCards === 40 || d.deckCards === 52)) patch.deckCards = d.deckCards * 2;
        self.setDraft(patch);
      };
      v.startGame = function () { self.startGame(); };
      var lim = this.limitReached();
      var deckN = d.deckCards | 0, dMax = np > 0 ? Math.floor(deckN / np) : 0;
      v.cantAdd = !(d.newName || '').trim() || lim;
      v.showDeckOpt = np >= st.prefs.maxPlayers || d.multiDeck;
      v.deckChips = DECK_PRESETS.map(function (n) {
        return { label: DECK_LABELS[n], cls: !d.deckCustom && d.deckCards === n ? 'on' : '', pick: function () { self.setDraft({ deckCards: n, deckCustom: false }); } };
      }).concat([{ label: 'Personalizado', cls: d.deckCustom ? 'on' : '', pick: function () { self.setDraft({ deckCustom: true }); } }]);
      v.deckCustom = !!d.deckCustom;
      v.deckValue = d.deckCards ? String(d.deckCards) : '';
      v.setDeckCustom = function (ev) { var n = parseInt(ev.target.value, 10); self.setDraft({ deckCards: isNaN(n) ? 0 : Math.max(0, Math.min(999, n)) }); };
      v.limitChips = [{ label: 'Fixar limite no início da partida', val: 'fixo' }, { label: 'Recalcular conforme jogadores ativos', val: 'recalcular' }].map(function (o) {
        return { label: o.label, cls: d.limitMode === o.val ? 'on' : '', pick: function () { self.setDraft({ limitMode: o.val }); } };
      });
      var noCards = np >= 3 && dMax < 1;
      v.pv = { players: np, deck: deckN || '—', max: np ? (dMax < 1 ? '0' : dMax) : '—', cycle: np ? cycleText(dMax, 1, 1) : 'adicione os jogadores', error: noCards ? NO_CARDS_MSG : '' };
      v.cantStart = np < 3 || noCards;
      /* etapa ORDEM DA MESA */
      v.setupPlayersStep = d.step !== 'mesa';
      v.setupMesaStep = d.step === 'mesa';
      v.goMesa = function () { if (np >= 3 && !noCards) self.setDraft({ step: 'mesa', first: d.players.some(function (p) { return p.id === d.first; }) ? d.first : (d.players[0] && d.players[0].id) }); };
      v.backPlayers = function () { self.setDraft({ step: 'players' }); };
      var firstId = d.players.some(function (p) { return p.id === d.first; }) ? d.first : (d.players[0] && d.players[0].id);
      var dNames = {}; d.players.forEach(function (p, i) { dNames[p.id] = (p.name || '').trim() || ('Jogador ' + (i + 1)); });
      v.firstChips = d.players.map(function (p) { return { label: dNames[p.id], cls: p.id === firstId ? 'on' : '', pick: function () { self.setDraft({ first: p.id }); } }; });
      v.dirChips = [{ label: '↻ Horário', val: 'horario' }, { label: '↺ Anti-horário', val: 'anti' }].map(function (o) {
        return { label: o.label, cls: (d.dir || 'horario') === o.val ? 'on' : '', pick: function () { self.setDraft({ dir: o.val }); } };
      });
      var seatIds = d.players.map(function (p) { return p.id; });
      var prevOrder = firstId ? orderFrom(ringFrom(seatIds, d.dir), firstId, seatIds) : [];
      v.mesaPreview = prevOrder.map(function (id) { return dNames[id]; }).join(' → ');
      v.mesaFirst = firstId ? dNames[firstId] : '—';
      v.mesaR2 = prevOrder.length > 1 ? dNames[prevOrder[1]] : '—';
      v.setupHint = np < 3 ? ('Adicione pelo menos 3 jogadores' + (np ? ' (faltam ' + (3 - np) + ')' : '')) : (noCards ? 'Cartas insuficientes para ' + np + ' jogadores' : (lim && !d.multiDeck ? 'Limite de ' + st.prefs.maxPlayers + ' jogadores com 1 baralho' : ''));
    }

    /* lista */
    if (scr === 'list') {
      var card = function (gm) {
        var dd = derive(gm);
        return {
          name: gm.name, players: gm.players.map(function (p) { return p.name; }).join(', '),
          round: gm.status === 'finalizado' ? gm.rounds.length : gm.rounds.length + 1,
          status: plural(dd.alive.length, 'jogador ativo', 'jogadores ativos'),
          date: fmtDate(gm.status === 'finalizado' ? gm.endedAt : gm.createdAt), winner: winnerText(gm),
          cont: function () { self.openGame(gm.id, 'mesa'); },
          view: function () { self.openGame(gm.id, 'hist'); },
          del: function () { self.setState({ modal: { type: 'delete', id: gm.id, name: gm.name } }); },
          restart: function () { self.setState({ modal: { type: 'restart', id: gm.id, name: gm.name } }); },
          dup: function () { self.duplicateGame(gm.id); }
        };
      };
      v.ongoing = st.games.filter(function (x) { return x.status !== 'finalizado'; }).map(card);
      v.finished = st.games.filter(function (x) { return x.status === 'finalizado'; }).map(card);
      v.hasOngoing = v.ongoing.length > 0; v.hasFinished = v.finished.length > 0;
    }

    /* partida */
    if (g && (scr === 'game' || scr === 'over')) {
      var D = derive(g), done = g.status === 'finalizado', R = g.rounds.length;
      var next = R + 1, nextCards = cardsFor(g, next, D.alive.length), curMax = maxFor(g, D.alive.length);
      var gv = { name: g.name, ongoing: !done, done: done, noRounds: R === 0, hasRounds: R > 0 };
      var startC = startOf(g.settings, curMax), prevCards = R ? g.rounds[R - 1].cards : 0;
      gv.maxLine = g.settings.limitMode === 'recalcular'
        ? 'Máximo atual: ' + plural(curMax, 'carta', 'cartas') + ' (' + plural(D.alive.length, 'jogador ativo', 'jogadores ativos') + ')'
        : 'Máximo desta partida: ' + plural(curMax, 'carta', 'cartas');
      gv.cycleTag = done || curMax < 1 ? '' : (nextCards >= curMax ? 'MÁXIMO ATINGIDO' : (R > 0 && prevCards >= maxFor(g, g.rounds[R - 1].active || D.alive.length) && nextCards === startC ? 'NOVO CICLO' : ''));
      gv.roundTitle = done ? 'FIM · ' + R + ' RODADAS' : 'RODADA ' + next;
      gv.cardsLabel = plural(nextCards, 'CARTA', 'CARTAS');
      gv.nextTesta = !done && g.settings.testa && next === 1;
      gv.aliveLabel = plural(D.alive.length, 'VIVO', 'VIVOS');
      gv.winnerText = (g.winnerIds.length > 1 ? 'Empate: ' : 'Vencedor: ') + winnerText(g);
      var aliveIdsG = D.alive.map(function (p) { return p.id; });
      if (!done && aliveIdsG.length) {
        var nSt = starterFor(g, next, aliveIdsG);
        gv.nextStarter = nameOf(g, nSt);
        gv.nextOrder = orderFrom(ringOf(g), nSt, aliveIdsG).map(function (id) { return nameOf(g, id); }).join(' → ');
      }
      var cap = deckOf(g.settings);
      gv.deckWarn = (!done && nextCards * D.alive.length > cap) ? ('Atenção: ' + nextCards + ' cartas × ' + D.alive.length + ' jogadores = ' + (nextCards * D.alive.length) + ', acima das ' + cap + ' cartas do baralho. Ajuste em Configurações.') : '';
      var tilesFor = function (p, lastAnim) {
        var prev = p.series.length >= 2 ? p.series[p.series.length - 2].l : 0;
        if (!lastAnim || p.series.length === 0 || p.series[p.series.length - 1].st === 'gone') prev = p.letters;
        var k = 0;
        return LETTERS.map(function (ch, i) {
          var on = i < p.letters, isNew = on && i >= prev;
          var cls = on ? ('on' + (p.letters >= 7 ? ' dead' : '') + (isNew ? ' new' : '')) : 'off';
          return { ch: ch, cls: cls, delay: isNew ? ((k++) * 0.09) + 's' : '0s' };
        });
      };
      var shown = D.ps.slice().sort(function (a, b) { var ad = a.status === 'elim', bd = b.status === 'elim'; if (ad !== bd) return ad ? 1 : -1; if (ad) return b.elimRound - a.elimRound; return a.order - b.order; });
      gv.players = shown.map(function (p) {
        var lv = level(p.letters), won = done && g.winnerIds.indexOf(p.id) >= 0;
        return { name: p.name, lvl: lv, lvlLabel: won ? 'Vencedor' : (p.status === 'elim' ? 'Eliminado · R' + p.elimRound : LVL_LABEL[lv]), tiles: tilesFor(p, true), count: p.letters + '/7', cardCls: p.status === 'elim' && !won ? 'gone-card' : '' };
      });
      gv.ranking = D.sorted.map(function (p) {
        var won = done && g.winnerIds.indexOf(p.id) >= 0;
        var medal = p.status === 'elim' && !won ? 'mx' : (p.pos <= 3 ? 'm' + p.pos : '');
        return { pos: p.status === 'elim' && !won ? '×' : p.pos + 'º', medal: medal, name: p.name, lvl: level(p.letters), letters: plural(p.letters, 'letra', 'letras') };
      });
      gv.history = D.rounds.slice().reverse().map(function (r) {
        var i = r.number - 1, open = !!st.open[i];
        var errs = r.rows.filter(function (x) { return !x.missing && !x.hit; }).length;
        var sum = r.rows.reduce(function (a, x) { return a + (x.recv || 0); }, 0);
        return {
          number: r.number, open: open, rot: open ? '180deg' : '0deg', last: i === R - 1,
          sub: plural(r.cards, 'carta', 'cartas') + ' · máx. ' + r.max + ' · ' + plural(r.active, 'ativo', 'ativos') + (r.type === 'testa' ? ' · carta na testa' : '') + ' · ' + fmtDate(r.at),
          summary: errs ? ('+' + sum + ' ' + (sum === 1 ? 'letra' : 'letras')) : 'todos acertaram',
          toggle: function () { var o = Object.assign({}, self.state.open); o[i] = !o[i]; self.setState({ open: o }); },
          edit: function () { self.openEdit(i); },
          seatLine: r.starter ? 'Começou: ' + nameOf(g, r.starter) + ' · Sentido: ' + (r.dir === 'anti' ? 'Anti-horário' : 'Horário') : '',
          orderLine: r.order ? 'Ordem: ' + r.order.map(function (id) { return nameOf(g, id); }).join(' → ') : '',
          rows: (r.order ? r.rows.slice().sort(function (a, b) { var ia = r.order.indexOf(a.pid), ib = r.order.indexOf(b.pid); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); }) : r.rows).map(function (x) {
            if (x.missing) return { name: x.name, detail: 'sem registro', res: '—', cls: 'mu' };
            return { name: x.name, detail: 'Palpite ' + x.bid + ' · Fez ' + x.tricks, res: x.elim ? '+' + x.recv + ' ×' : '+' + x.recv, cls: x.hit ? 'tx-ok' : (x.elim ? 'tx-dead' : '') };
          })
        };
      });
      var lg = (g.log || []).slice(-10).reverse();
      gv.hasLog = lg.length > 0;
      gv.log = lg.map(function (l) {
        var parts = [];
        if (l.player && l.action.indexOf(l.player) !== 0) parts.push(l.player);
        if (l.before != null && l.after != null) parts.push(l.before + ' → ' + l.after); else if (l.after != null) parts.push(l.after);
        parts.push(fmtDate(l.at));
        return { action: l.action, detail: parts.join(' · ') };
      });
      gv.roundNums = D.rounds.map(function (r) { return r.number; });
      gv.timeline = D.ps.map(function (p) {
        return { name: p.name, cells: p.series.map(function (s, i) {
          if (s.st === 'gone') return { cls: 'gone', txt: '', title: '' };
          if (s.st === 'skip') return { cls: 'skip', txt: s.l, title: 'Rodada ' + (i + 1) + ': sem registro' };
          return { cls: level(s.l), txt: s.st === 'elim' ? '×' : s.l, title: 'Rodada ' + (i + 1) + ': ' + plural(s.l, 'letra', 'letras') };
        }) };
      });
      gv.timelineText = D.ps.map(function (p) {
        var parts = [];
        p.series.forEach(function (s, i) { if (s.st === 'gone') return; parts.push('R' + (i + 1) + ' → ' + s.l + (s.st === 'elim' ? ' (eliminado)' : '')); });
        return { name: p.name, text: parts.join('   ') };
      });
      v.gv = gv;

      /* estatísticas */
      var plays = 0, hits = 0, maxT = null, totalL = 0;
      D.rounds.forEach(function (r) { r.rows.forEach(function (x) { if (x.missing) return; plays++; if (x.hit) hits++; totalL += x.recv; if (!maxT || x.tricks > maxT.t) maxT = { t: x.tricks, n: x.name, r: r.number }; }); });
      var perRound = D.rounds.map(function (r) { return { n: r.number, v: r.rows.reduce(function (a, x) { return a + (x.recv || 0); }, 0) }; });
      var mx = Math.max.apply(null, [1].concat(perRound.map(function (x) { return x.v; })));
      v.st = {
        total: g.players.length, elim: D.ps.filter(function (p) { return p.status === 'elim'; }).length, winner: done ? winnerText(g) : 'em jogo',
        bids: plays, hits: hits, errs: plays - hits, rate: plays ? Math.round(hits / plays * 100) + '%' : '—',
        players: D.ps.map(function (p) { return { name: p.name, hits: p.hits + '/' + p.plays, tricks: p.tricks, recv: p.recv, out: p.elimRound ? 'R' + p.elimRound : '—' }; }),
        maxTricks: maxT && maxT.t > 0 ? maxT.n + ' — ' + plural(maxT.t, 'vaza', 'vazas') + ' (rodada ' + maxT.r + ')' : '—',
        avg: R ? (totalL / R).toFixed(1).replace('.', ',') + ' letras' : '—',
        perRound: perRound.map(function (x) { return { n: x.n, v: x.v, w: Math.round(x.v / mx * 100) + '%' }; })
      };
      var tab = st.tab;
      v.tabMesa = tab === 'mesa'; v.tabHist = tab === 'hist'; v.tabTime = tab === 'time'; v.tabStats = tab === 'stats';
      v.tabCls = { mesa: tab === 'mesa' ? 'on' : '', hist: tab === 'hist' ? 'on' : '', time: tab === 'time' ? 'on' : '', stats: tab === 'stats' ? 'on' : '' };
      v.tabGo = { mesa: function () { self.setState({ tab: 'mesa' }); }, hist: function () { self.setState({ tab: 'hist' }); }, time: function () { self.setState({ tab: 'time' }); }, stats: function () { self.setState({ tab: 'stats' }); } };

      /* fim de jogo */
      if (done) {
        var tie = g.winnerIds.length > 1, wn = winnerText(g);
        v.ov = {
          winLabel: tie ? 'Empate' : 'Vencedor', winner: wn.toUpperCase(),
          sub: tie ? 'Eliminados juntos, com o mesmo total de letras' : 'Último jogador sobrevivente',
          shout: tie ? 'NINGUÉM ESCAPOU DA FODINHA!' : wn.toUpperCase() + ' SOBREVIVEU À FODINHA!',
          ranking: D.sorted.map(function (p) {
            return { pos: p.pos + 'º', medal: p.pos <= 3 ? 'm' + p.pos : '', name: p.name, note: g.winnerIds.indexOf(p.id) >= 0 ? (tie ? 'empate' : 'sobrevivente') : 'saiu na rodada ' + p.elimRound };
          })
        };
        var cols = ['cf1', 'cf2', 'cf3', 'cf4'], cf = [];
        for (var q = 0; q < 28; q++) cf.push({ cls: cols[q % 4], left: ((q * 37) % 100) + '%', delay: ((q * 0.13) % 1.4).toFixed(2) + 's', dur: (2.2 + (q % 5) * 0.3).toFixed(1) + 's' });
        v.confetti = cf;
      }
    }

    /* registrar / confirmar */
    if (g && st.entry && (scr === 'reg' || scr === 'conf')) {
      var e = st.entry, pre = derive(Object.assign({}, g, { rounds: g.rounds.slice(0, e.idx) }));
      var byId = {}; pre.ps.forEach(function (p) { byId[p.id] = p; });
      var ord = e.pids, nP = ord.length, stage = scr === 'conf' ? 'result' : ({ bidsum: 'bids', tricksum: 'tricks' }[e.stage] || e.stage), cur = Math.min(e.cursor || 0, nP - 1);
      var nm = function (id) { return byId[id] ? byId[id].name : nameOf(g, id); };
      var sb = ord.reduce(function (a, id) { return a + e.values[id].bid; }, 0);
      var stt = ord.reduce(function (a, id) { return a + e.values[id].tricks; }, 0);
      var forb = this.forbiddenOf(e), forbOk = forb >= 0 && forb <= e.cards;
      var lastId = ord[nP - 1], lastBad = e.values[lastId].bid === forb;
      var sIdx = { bids: 0, bidsum: 0, tricks: 1, tricksum: 1, result: 2 }[stage] || 0;
      var steps = ['PALPITES', 'VAZAS', 'RESULTADO'].map(function (lb, i) {
        return { label: lb, cls: i < sIdx ? 'done' : (i === sIdx ? 'now' : ''), mark: i < sIdx ? '✓' : (i === sIdx ? '●' : '○'), arrow: i < 2 };
      });
      var seats = ord.map(function (id, i) {
        var now = (stage === 'bids' || stage === 'tricks') && i === cur;
        return { name: nm(id), first: i === 0, cls: (now ? 'now' : '') + (i === 0 ? ' first' : ''), arrow: i < nP - 1 };
      });
      var range = []; for (var q = 0; q <= e.cards; q++) range.push(q);
      var curId = ord[cur], curV = e.values[curId], curIsLast = cur === nP - 1;
      var gap = e.cards - stt;
      v.rv = {
        title: (e.mode === 'edit' ? 'EDITAR RODADA ' : 'RODADA ') + (e.idx + 1), cards: e.cards, cardsWord: e.cards === 1 ? 'CARTA' : 'CARTAS', testa: e.type === 'testa',
        cardsLabel: plural(e.cards, 'CARTA', 'CARTAS'),
        stageLabel: sIdx === 0 ? 'PALPITES' : (sIdx === 1 ? 'VAZAS REALIZADAS' : 'RESULTADO'),
        showCards: stage === 'bids' && cur === 0 && e.mode === 'new',
        cardsDec: function () { self.setCards(-1); }, cardsInc: function () { self.setCards(1); },
        cardsAtMin: e.cards <= 1, cardsAtMax: e.cards >= (e.max || 1),
        maxLine: 'Máximo: ' + plural(e.max || 1, 'carta', 'cartas') + ' por jogador · ' + plural(nP, 'jogador ativo', 'jogadores ativos') + (e.cards >= (e.max || 1) ? ' · máximo atingido' : ''),
        steps: steps, seats: seats, starter: nm(ord[0]), dir: dirLabel(e.dir),
        isBids: stage === 'bids', isBidSum: false, isTricks: stage === 'tricks', isTrickSum: false,
        /* tela única de palpites: todos os jogadores, na ordem da rodada */
        bidList: ord.map(function (id, i) {
          var isLast = i === nP - 1, b = e.values[id].bid;
          return {
            num: (i + 1) + 'º', name: nm(id), bid: b, first: i === 0, isLast: isLast,
            bad: isLast && b === forb, cls: (isLast && b === forb ? 'bad' : '') + (isLast ? ' last' : ''),
            forbShow: isLast && forbOk, forb: forb,
            dec: function () { self.stepBidFor(id, -1); }, inc: function () { self.stepBidFor(id, 1); }, tap: function () { self.cycleBid(id); },
            decDis: self.bidNext(e, id, -1) == null, incDis: self.bidNext(e, id, 1) == null,
            aria: 'Palpite de ' + nm(id) + ': ' + b
          };
        }),
        bidTotal: sb + ' / ' + e.cards, lastName: nm(lastId),
        lastInfo: forbOk ? 'Não pode fazer: ' + forb : 'Pode fazer qualquer valor',
        bidListErr: lastBad ? BID_BLOCK_MSG + ' Ajuste o palpite de ' + nm(lastId) + '.' : '',
        /* tela única de vazas */
        trickList: ord.map(function (id, i) {
          var x = e.values[id];
          return {
            num: (i + 1) + 'º', name: nm(id), bid: x.bid, tricks: x.tricks, first: i === 0,
            cls: x.tricks === x.bid ? 'eq' : (x.tricks > x.bid ? 'over' : ''),
            dec: function () { self.stepTricksFor(id, -1); }, inc: function () { self.stepTricksFor(id, 1); },
            decDis: x.tricks <= 0, incDis: stt >= e.cards || x.tricks >= e.cards,
            aria: 'Vazas de ' + nm(id) + ': ' + x.tricks
          };
        }),
        trCount: stt + ' / ' + e.cards, trLeft: gap > 0 ? plural(gap, 'vaza', 'vazas') : (gap === 0 ? 'nenhuma' : plural(-gap, 'vaza a mais', 'vazas a mais')),
        trFull: gap === 0,
        /* etapa 1: um jogador por vez */
        curName: nm(curId), curPos: 'JOGADOR ' + (cur + 1) + ' DE ' + nP + (cur === 0 ? ' · COMEÇA' : (curIsLast ? ' · ÚLTIMO' : '')),
        curBid: curV.bid, curTricks: curV.tricks,
        showForb: stage === 'bids' && curIsLast && forbOk, forb: forb,
        bidErr: stage === 'bids' && curIsLast && curV.bid === forb ? BID_BLOCK_MSG : '',
        prevBids: 'Palpites anteriores: ' + (cur === 0 ? '—' : ord.slice(0, cur).map(function (id) { return nm(id) + ' ' + e.values[id].bid; }).join(' · ')),
        forbCalc: forbOk ? e.cards + ' − ' + (e.cards - forb) + ' = ' + forb : '',
        bidDec: function () { self.stepBid(-1); }, bidInc: function () { self.stepBid(1); },
        bidDecDis: curV.bid <= 0 || (curIsLast && forb === 0 && curV.bid === 1), bidIncDis: curV.bid >= e.cards || (curIsLast && forb === e.cards && curV.bid === e.cards - 1),
        bidChips: range.map(function (n) {
          var bad = curIsLast && n === forb;
          return { label: n, cls: bad ? 'forb' : (n === curV.bid ? 'on' : ''), dis: bad, pick: function () { self.setBid(n); }, aria: bad ? n + ' — proibido' : String(n) };
        }),
        okBid: function () { self.okBid(); }, okBidDis: curIsLast && curV.bid === forb,
        backBid: function () { if (cur > 0) self.patchEntry({ cursor: cur - 1 }); }, backBidDis: cur === 0,
        /* resumo dos palpites */
        bidRows: ord.map(function (id, i) {
          return { name: nm(id), bid: e.values[id].bid, first: i === 0, bad: i === nP - 1 && lastBad, edit: function () { var ne = clone(e); ne.stage = 'bids'; ne.cursor = i; self.setState({ entry: ne }); } };
        }),
        sumBids: sb, remainText: e.cards - sb >= 0 ? 'Diferença restante: ' + (e.cards - sb) : 'Palpites passam das cartas em ' + (sb - e.cards),
        bidSumErr: lastBad ? BID_BLOCK_MSG + ' (' + nm(lastId) + ' não pode falar ' + forb + '.)' : '',
        confirmBids: function () { if (!lastBad) self.patchEntry({ stage: 'tricks', cursor: 0 }); }, confirmBidsDis: lastBad,
        /* etapa 2 */
        trRunning: 'Registradas: ' + ord.slice(0, cur).reduce(function (a, id) { return a + e.values[id].tricks; }, 0) + ' de ' + e.cards + ' · faltam ' + Math.max(0, e.cards - ord.slice(0, cur).reduce(function (a, id) { return a + e.values[id].tricks; }, 0)),
        trDec: function () { self.setTricks(curId, curV.tricks - 1); }, trInc: function () { self.setTricks(curId, curV.tricks + 1); },
        trDecDis: curV.tricks <= 0, trIncDis: curV.tricks >= e.cards,
        trChips: range.map(function (n) { return { label: n, cls: n === curV.tricks ? 'on' : '', pick: function () { self.setTricks(curId, n); } }; }),
        okTricks: function () { self.okTricks(); },
        backTr: function () { if (cur > 0) self.patchEntry({ cursor: cur - 1 }); }, backTrDis: cur === 0,
        trickRows: ord.map(function (id) {
          var x = e.values[id];
          return { name: nm(id), bid: x.bid, tricks: x.tricks, dec: function () { self.setTricks(id, x.tricks - 1); }, inc: function () { self.setTricks(id, x.tricks + 1); }, decDis: x.tricks <= 0, incDis: x.tricks >= e.cards };
        }),
        sumTricks: stt,
        trickWarn: gap === 0 ? '' : '⚠ A soma das vazas realizadas é ' + stt + ', mas esta rodada possui ' + plural(e.cards, 'carta', 'cartas') + '.',
        remainLabel: gap >= 0 ? 'VAZAS RESTANTES' : 'VAZAS A MAIS', remainVal: Math.abs(gap), trickOk: gap === 0, trickOkCls: gap === 0 ? 'tx-ok' : 'tx-risk',
        toResult: function () { if (gap === 0) self.setState({ screen: 'conf' }); }, cantResult: gap !== 0,
        backToTrickSum: function () { self.patchEntry({ stage: 'tricksum' }); self.setState({ screen: 'reg' }); }
      };
      if (scr === 'conf') {
        var H = this.hypo(), HD = derive(H.g), hr = HD.rounds[e.idx];
        var byRow = {}; if (hr) hr.rows.forEach(function (x) { byRow[x.pid] = x; });
        var k = 0;
        v.cv = {
          sub: (e.mode === 'edit' ? 'Correção · rodada ' : 'Rodada ') + (e.idx + 1) + ' · ' + plural(e.cards, 'carta', 'cartas') + ' · máx. ' + (e.max || 1),
          rows: e.pids.map(function (pid) {
            var x = byRow[pid]; if (!x) return null;
            var delay = (k++ * 0.06) + 's';
            return {
              name: x.name, delay: delay, fx: x.elim ? 'shake' : '',
              detail: 'Palpite ' + x.bid + ' · Fez ' + x.tricks + ' · Diferença ' + x.diff,
              res: x.hit ? 'Acertou' : (x.elim ? 'ELIMINADO' : '+' + plural(x.recv, 'letra', 'letras')),
              resCls: x.hit ? 'tx-ok' : 'tx-dead',
              tiles: LETTERS.map(function (ch, i) { var on = i < x.total, nw = on && i >= x.before; return { ch: ch, cls: on ? ('on' + (x.total >= 7 ? ' dead' : '') + (nw ? ' new' : '')) : 'off', delay: nw ? (0.3 + (i - x.before) * 0.08) + 's' : '0s' }; })
            };
          }).filter(Boolean)
        };
        var notes = [];
        if (HD.ended && HD.endIndex === e.idx) notes.push('Esta rodada encerra a partida.');
        if (HD.ended && HD.endIndex < H.g.rounds.length - 1) notes.push('Com esta correção a partida termina na rodada ' + (HD.endIndex + 1) + ': as rodadas seguintes serão descartadas.');
        if (e.mode === 'edit' && !HD.ended && g.status === 'finalizado') notes.push('Com esta correção a partida volta a ficar em andamento.');
        v.cv.note = notes.join(' ');
        v.cv.letters = e.pids.map(function (pid) { var x = byRow[pid]; return { name: nm(pid), val: x ? '+' + x.recv : '—', cls: x && x.recv ? 'tx-dead' : 'tx-ok' }; });
      }
    }

    /* rodada concluída */
    if (g && scr === 'done') {
      var DD = derive(g), RR = g.rounds.length, lr = g.rounds[RR - 1];
      var aIds = DD.alive.map(function (p) { return p.id; });
      if (lr && aIds.length > 1) {
        var ns = starterFor(g, RR + 1, aIds), nc = cardsFor(g, RR + 1, aIds.length), mxN = maxFor(g, aIds.length);
        v.dn = {
          title: 'RODADA ' + RR + ' CONCLUÍDA',
          began: lr.starter ? nameOf(g, lr.starter) : '—', next: nameOf(g, ns),
          nextCards: plural(nc, 'carta', 'cartas'),
          tag: nc >= mxN ? 'MÁXIMO ATINGIDO' : (lr.cards >= (lr.max || mxN) && nc === startOf(g.settings, mxN) ? 'NOVO CICLO' : ''),
          seats: orderFrom(ringOf(g), ns, aIds).map(function (id, i, arr) { return { name: nameOf(g, id), first: i === 0, cls: i === 0 ? 'first' : '', arrow: i < arr.length - 1 }; }),
          nextLabel: 'RODADA ' + (RR + 1)
        };
      } else { v.isDone = false; }
      v.goMesa2 = function () { self.setState({ screen: 'game', tab: 'mesa' }); };
    }

    /* configurações */
    if (g && scr === 'settings') {
      var s = g.settings, locked = g.rounds.length > 0;
      var setS = function (key, val, label, shown) {
        self.mutate(function (gg) { var old = gg.settings[key]; if (old === val) return; gg.settings[key] = val; self.log(gg, 'Configuração alterada', null, label + ': ' + (shown ? shown(old) : old), (shown ? shown(val) : val)); });
      };
      var deckNow = deckOf(s), aliveN = derive(g).alive.length, sMax = maxFor(g, aliveN);
      var setDeck = function (n) {
        n = Math.max(0, Math.min(999, n | 0));
        var test = clone(g); test.settings.deckCards = n;
        if (maxFor(test, aliveN) < 1) { self.showToast(NO_CARDS_MSG); return; }
        self.mutate(function (gg) { var old = deckOf(gg.settings); if (old === n) return; gg.settings.deckCards = n; gg.settings.maxCards = Math.floor(n / gg.players.length); self.log(gg, 'Configuração alterada', null, 'Cartas disponíveis: ' + old, String(n)); });
      };
      v.sv = {
        name: g.name, testa: s.testa, locked: locked, startCards: s.startCards, step: s.step, maxPlayers: st.prefs.maxPlayers,
        lockNote: locked ? 'Regras que mudam letras já lançadas ficam travadas após a 1ª rodada.' : 'Pode ser alterada até a 1ª rodada ser registrada.',
        setName: function (ev) { var val = ev.target.value; self.mutate(function (gg) { gg.name = val; }); },
        toggleTesta: function () { if (!locked) setS('testa', !s.testa, 'Carta na testa', function (x) { return x ? 'sim' : 'não'; }); },
        startDec: function () { setS('startCards', Math.max(1, s.startCards - 1), 'Cartas iniciais'); },
        startInc: function () { setS('startCards', Math.min(20, s.startCards + 1), 'Cartas iniciais'); },
        stepDec: function () { setS('step', Math.max(0, s.step - 1), 'Crescimento'); },
        stepInc: function () { setS('step', Math.min(5, s.step + 1), 'Crescimento'); },
        maxDec: function () { self.setState({ prefs: Object.assign({}, st.prefs, { maxPlayers: Math.max(3, st.prefs.maxPlayers - 1) }) }); },
        maxInc: function () { self.setState({ prefs: Object.assign({}, st.prefs, { maxPlayers: Math.min(12, st.prefs.maxPlayers + 1) }) }); },
        deckOpts: DECK_PRESETS.map(function (n) {
          return { label: DECK_LABELS[n], cls: !st.setDeckCustom && deckNow === n ? 'on' : '', pick: function () { self.setState({ setDeckCustom: false }); setDeck(n); } };
        }).concat([{ label: 'Personalizado', cls: (st.setDeckCustom || DECK_PRESETS.indexOf(deckNow) < 0) ? 'on' : '', pick: function () { self.setState({ setDeckCustom: true }); } }]),
        deckCustom: !!st.setDeckCustom || DECK_PRESETS.indexOf(deckNow) < 0,
        deckValue: st.deckDraft != null ? st.deckDraft : String(deckNow),
        setDeckCustom: function (ev) { self.setState({ deckDraft: ev.target.value }); },
        applyDeck: function () { var n = parseInt(self.state.deckDraft, 10); self.setState({ deckDraft: null }); if (!isNaN(n)) setDeck(n); },
        deckKey: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); var n = parseInt(self.state.deckDraft, 10); self.setState({ deckDraft: null }); if (!isNaN(n)) setDeck(n); } },
        maxText: plural(sMax, 'carta', 'cartas') + ' por jogador',
        maxSub: s.limitMode === 'recalcular' ? 'Calculado: ⌊' + deckNow + ' ÷ ' + aliveN + ' ativos⌋' : 'Calculado: ⌊' + deckNow + ' ÷ ' + g.players.length + ' jogadores do início⌋',
        restartText: 'Reiniciar em ' + startOf(s, sMax),
        cycle: cycleText(sMax, startOf(s, sMax), s.step),
        limitOpts: [{ label: 'Fixar limite no início da partida', val: 'fixo' }, { label: 'Recalcular conforme jogadores ativos', val: 'recalcular' }].map(function (o) {
          return { label: o.label, cls: (s.limitMode || 'fixo') === o.val ? 'on' : '', pick: function () {
            var test = clone(g); test.settings.limitMode = o.val;
            if (maxFor(test, aliveN) < 1) { self.showToast(NO_CARDS_MSG); return; }
            setS('limitMode', o.val, 'Limite de cartas', function (x) { return x === 'recalcular' ? 'recalcular' : 'fixo'; });
          } };
        }),
        modeOpts: [{ label: 'Diferença |palpite − vazas|', val: 'diferenca' }, { label: '1 letra por erro', val: 'um' }].map(function (o) {
          return { label: o.label, cls: s.lettersMode === o.val ? 'on' : '', pick: function () { if (!locked) setS('lettersMode', o.val, 'Letras por erro'); } };
        }),
        overOpts: [{ label: 'Completa FODINHA e é eliminado na hora (padrão)', val: 'imediato' }, { label: 'Para no H: a última letra só vem em outro erro', val: 'segura' }].map(function (o) {
          return { label: o.label, cls: s.overflow === o.val ? 'on' : '', pick: function () { if (!locked) setS('overflow', o.val, 'Excesso de letras'); } };
        }),
        themes: THEMES.map(function (t) {
          var on = (g.theme || st.prefs.theme) === t.key;
          return { name: t.name, a: t.a, b: t.b, c: t.c, on: on, border: on ? 'var(--ac)' : 'var(--line)', pick: function () {
            self.mutate(function (gg) { gg.theme = t.key; }, { prefs: Object.assign({}, st.prefs, { theme: t.key }) });
          } };
        })
      };
    }

    /* placar sobreposto (minimizável) */
    if (g && (scr === 'reg' || scr === 'conf' || scr === 'done' || scr === 'game')) {
      var PD = derive(g), ringP = ringOf(g);
      var aliveP = PD.ps.filter(function (p) { return p.status !== 'elim'; }).sort(function (a, b) { return ringP.indexOf(a.id) - ringP.indexOf(b.id); });
      var elimP = PD.ps.filter(function (p) { return p.status === 'elim'; }).sort(function (a, b) { return b.elimRound - a.elimRound; });
      var maxL = aliveP.reduce(function (m, p) { return Math.max(m, p.letters); }, 0);
      var ptiles = function (p) { return LETTERS.map(function (ch, i) { return { ch: ch, cls: i < p.letters ? 'on' + (p.letters >= 7 ? ' dead' : '') : 'off' }; }); };
      var rn, rc, gDone = g.status === 'finalizado';
      if (st.entry && (scr === 'reg' || scr === 'conf')) { rn = st.entry.idx + 1; rc = st.entry.cards; }
      else if (gDone) { rn = g.rounds.length; rc = g.rounds.length ? g.rounds[g.rounds.length - 1].cards : 0; }
      else { rn = g.rounds.length + 1; rc = cardsFor(g, rn, aliveP.length); }
      v.pl = {
        info: 'Rodada atual: ' + rn + ' · Cartas: ' + rc,
        alive: aliveP.map(function (p) {
          var dg = maxL > 0 && p.letters === maxL && aliveP.length > 1;
          return { name: p.name, tiles: ptiles(p), count: p.letters + '/7', danger: dg, cls: dg ? 'danger' : '', lvl: level(p.letters) };
        }),
        elim: elimP.map(function (p) { return { name: p.name, tiles: ptiles(p), round: 'ELIMINADO · R' + p.elimRound }; }),
        hasElim: elimP.length > 0,
        mini: aliveP.map(function (p) {
          return { name: p.name, word: p.letters ? LETTERS.slice(0, p.letters).join(' ') : '—', cls: maxL > 0 && p.letters === maxL && aliveP.length > 1 ? 'tx-risk' : '' };
        }).concat(elimP.map(function (p) { return { name: p.name, word: '×', cls: 'tx-dead' }; }))
      };
    }
    v.showPlacarBar = !!v.pl && (scr === 'reg' || scr === 'conf' || scr === 'done' || (scr === 'game' && st.tab !== 'mesa'));
    v.placarOpen = v.showPlacarBar && st.placar === 'open';
    v.openPlacar = function () { self.setState({ placar: 'open' }); };
    v.minPlacar = function () { self.setState({ placar: 'min' }); };

    /* eliminação / modal */
    v.hasElim = !!st.elim;
    v.elimNames = st.elim ? st.elim.names : [];
    v.hasModal = !!st.modal;
    if (st.modal && st.modal.type === 'undo' && g) {
      v.md = { title: 'Deseja realmente desfazer a Rodada ' + g.rounds.length + '?', text: 'Os dados dos jogadores voltarão ao estado anterior à rodada.', okLabel: 'DESFAZER', ok: function () { self.doUndo(); } };
    } else if (st.modal && st.modal.type === 'delete') {
      var mid = st.modal.id;
      v.md = { title: 'Excluir "' + st.modal.name + '"?', text: 'Tem certeza que deseja excluir esta partida? Esta ação não poderá ser desfeita.', okLabel: 'EXCLUIR', ok: function () {
        self.setState({ games: self.state.games.filter(function (x) { return x.id !== mid; }), modal: null, screen: self.state.games.length > 1 ? 'list' : 'home' });
      } };
    } else if (st.modal && st.modal.type === 'restart') {
      var rid = st.modal.id;
      v.md = { title: 'Reiniciar "' + st.modal.name + '"?', text: 'Todos voltam a zero letras, inclusive os eliminados, e a partida recomeça da rodada 1. Palpites, vazas e o histórico de rodadas serão apagados. Jogadores, ordem da mesa e configurações continuam iguais. Esta ação não poderá ser desfeita.', okLabel: 'REINICIAR', ok: function () { self.restartGame(rid); } };
    } else if (st.modal && st.modal.type === 'wipe') {
      v.md = { title: 'Apagar todos os dados?', text: 'Todas as partidas deste aparelho serão apagadas. Esta ação não poderá ser desfeita. Se quiser guardar, exporte um backup antes.', okLabel: 'APAGAR', ok: function () { self.wipeAll(); } };
    } else if (st.modal) { v.hasModal = false; }

    /* tela de backup e dados */
    if (scr === 'data') {
      v.dt = {
        count: plural(st.games.length, 'partida salva', 'partidas salvas') + ' neste aparelho',
        noGames: st.games.length === 0,
        persistWarn: st.persistent === false,
        version: 'Versão dos dados: ' + StorageService.DATA_VERSION,
        msg: st.dataMsg ? st.dataMsg.text : '', msgCls: st.dataMsg && !st.dataMsg.ok ? 'tx-dead' : 'tx-ok',
        exp: function () { self.exportBackup(); },
        imp: function (ev) { self.importFile(ev); },
        wipe: function () { if (self.state.games.length) self.setState({ modal: { type: 'wipe' } }); },
        back: function () { self.setState({ screen: 'home', dataMsg: null }); }
      };
    }
    return v;
  }
}

/* ---------- inicialização ---------- */
(function boot() {
  var root = document.getElementById('app');
  var tpl = document.getElementById('app-template');
  if (!root || !tpl) return;
  window.fodinhaApp = FodinhaRuntime.mount(Component, tpl, root, {});
})();
