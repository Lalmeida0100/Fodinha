/*
 * storage.js — StorageService: a única parte do app que sabe ONDE os dados ficam.
 *
 * Hoje: localStorage do navegador (fica só neste aparelho/navegador).
 * Amanhã: troque a implementação destas funções por chamadas a uma API
 * (login, sincronização etc.) sem mexer no resto do aplicativo.
 *
 * Formato salvo (chave "fodinha.data"):
 *   { dataVersion: 1, updatedAt, seq, prefs, games: [ <partida>, ... ], players: [ { id, name }, ... ] }
 *   "players" é a base geral de jogadores (independe das partidas; campo opcional,
 *   ausente em dados antigos — nesse caso começa vazio).
 * Rascunho da rodada em andamento (chave "fodinha.draft"):
 *   { dataVersion: 1, gameId, entry, screen, roundsLen, at }
 */
(function (global) {
  'use strict';

  var DATA_VERSION = 1;
  var KEY = 'fodinha.data';
  var DRAFT_KEY = 'fodinha.draft';
  /* chaves de versões anteriores (protótipo) — migradas automaticamente */
  var LEGACY_KEYS = ['fodinha.app.v1'];
  var LEGACY_DRAFT = 'fodinha.app.draft.v1';
  var DEFAULT_PREFS = { theme: 'mesa', maxPlayers: 6 };

  var memory = null; /* cópia em memória quando o navegador bloqueia o armazenamento */

  function ls() {
    try { var t = '__fodinha_test__'; global.localStorage.setItem(t, '1'); global.localStorage.removeItem(t); return global.localStorage; }
    catch (e) { return null; }
  }
  function readRaw(key) { var s = ls(); if (!s) return memory && memory[key] || null; try { return s.getItem(key); } catch (e) { return null; } }
  function writeRaw(key, val) {
    var s = ls();
    if (!s) { memory = memory || {}; memory[key] = val; return false; }
    try { s.setItem(key, val); return true; } catch (e) { console.warn('Falha ao salvar', e); return false; }
  }
  function removeRaw(key) { var s = ls(); if (!s) { if (memory) delete memory[key]; return; } try { s.removeItem(key); } catch (e) {} }

  /* ---------- migração de versões ---------- */
  /* Recebe qualquer formato conhecido e devolve o formato da versão atual. */
  function migrate(data) {
    if (!data || typeof data !== 'object') return null;
    var v = data.dataVersion || 0;
    if (v > DATA_VERSION) throw new Error('VERSAO_FUTURA');
    if (v === 0) {
      /* protótipo: { games, seq, prefs } sem número de versão */
      data = { dataVersion: 1, seq: data.seq || 1, prefs: data.prefs || {}, games: data.games || [] };
      v = 1;
    }
    /* futuras migrações: if (v === 1) { ...; v = 2; } */
    data.dataVersion = DATA_VERSION;
    data.prefs = Object.assign({}, DEFAULT_PREFS, data.prefs || {});
    data.games = Array.isArray(data.games) ? data.games : [];
    data.seq = data.seq || 1;
    data.players = cleanPlayers(data.players);
    return data;
  }

  function emptyData() { return { dataVersion: DATA_VERSION, seq: 1, prefs: Object.assign({}, DEFAULT_PREFS), games: [], players: [] }; }

  /* ---------- base geral de jogadores ---------- */
  function normName(n) { return String(n || '').trim().replace(/\s+/g, ' '); }
  function nameKey(n) { return normName(n).toLowerCase(); }
  function cleanPlayers(list) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function (p) {
      var name = normName(p && typeof p === 'object' ? p.name : p);
      if (!name || seen[nameKey(name)]) return;
      seen[nameKey(name)] = 1;
      out.push({ id: (p && p.id) || ('p' + Math.random().toString(36).slice(2, 10)), name: name });
    });
    return out;
  }
  /* Junta nomes novos à base (sem duplicar, sem diferenciar maiúsculas). Devolve a lista nova. */
  function mergePlayers(base, names) { return cleanPlayers((base || []).concat((names || []).map(function (n) { return { name: n }; }))); }

  function loadAll() {
    try {
      var raw = readRaw(KEY);
      if (raw) return migrate(JSON.parse(raw));
      for (var i = 0; i < LEGACY_KEYS.length; i++) {
        var old = readRaw(LEGACY_KEYS[i]);
        if (old) { var d = migrate(JSON.parse(old)); saveAll(d); return d; }
      }
    } catch (e) { console.warn('Dados locais ilegíveis', e); }
    return emptyData();
  }
  function saveAll(data) {
    var d = { dataVersion: DATA_VERSION, updatedAt: new Date().toISOString(), seq: data.seq || 1, prefs: data.prefs || DEFAULT_PREFS, games: data.games || [], players: cleanPlayers(data.players) };
    return writeRaw(KEY, JSON.stringify(d));
  }

  /* ---------- API por partida ---------- */
  function listGames() { return loadAll().games; }
  function loadGame(id) { return listGames().filter(function (g) { return g.id === id; })[0] || null; }
  function saveGame(game) {
    var d = loadAll(), i = -1;
    d.games.forEach(function (g, k) { if (g.id === game.id) i = k; });
    if (i >= 0) d.games[i] = game; else d.games.unshift(game);
    return saveAll(d);
  }
  function deleteGame(id) {
    var d = loadAll();
    d.games = d.games.filter(function (g) { return g.id !== id; });
    return saveAll(d);
  }
  function saveMeta(seq, prefs, players) { var d = loadAll(); d.seq = seq; d.prefs = prefs; if (players) d.players = players; return saveAll(d); }
  function listPlayers() { return loadAll().players; }
  function savePlayers(players) { var d = loadAll(); d.players = players; return saveAll(d); }
  function clearAll() { removeRaw(KEY); removeRaw(DRAFT_KEY); LEGACY_KEYS.forEach(removeRaw); removeRaw(LEGACY_DRAFT); }

  /* ---------- rascunho da rodada em andamento ---------- */
  function saveDraft(draft) { return writeRaw(DRAFT_KEY, JSON.stringify(Object.assign({ dataVersion: DATA_VERSION }, draft))); }
  function loadDraft() {
    try { var raw = readRaw(DRAFT_KEY) || readRaw(LEGACY_DRAFT); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function clearDraft() { removeRaw(DRAFT_KEY); removeRaw(LEGACY_DRAFT); }

  /* ---------- backup ---------- */
  /* summarize: função opcional que devolve um resumo/estatísticas de cada partida (só informativo). */
  function exportBackup(summarize) {
    var d = loadAll();
    return {
      app: 'fodinha',
      dataVersion: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      seq: d.seq,
      prefs: d.prefs,
      games: d.games,
      players: d.players,
      resumo: typeof summarize === 'function' ? d.games.map(function (g) { try { return summarize(g); } catch (e) { return null; } }) : []
    };
  }
  function validGame(g) {
    return g && typeof g === 'object' && typeof g.id === 'string' && Array.isArray(g.players) && g.players.length >= 3 &&
      Array.isArray(g.rounds) && g.settings && typeof g.settings === 'object' &&
      g.players.every(function (p) { return p && typeof p.id === 'string' && typeof p.name === 'string'; });
  }
  /*
   * Importa um backup sem corromper o que já existe:
   *  - partida nova → adicionada;
   *  - mesma partida, mesmo conteúdo → ignorada;
   *  - mesmo id, conteúdo diferente → adicionada como cópia (nada é sobrescrito).
   * Retorna { ok, added, copies, skipped, invalid, error }.
   */
  function importBackup(text, newId) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'O arquivo não é um JSON válido.' }; }
    if (!data || data.app !== 'fodinha' || !Array.isArray(data.games)) return { ok: false, error: 'Este arquivo não é um backup do Fodinha.' };
    try { data = migrate(data); } catch (e) {
      if (e.message === 'VERSAO_FUTURA') return { ok: false, error: 'Este backup foi feito por uma versão mais nova do app. Atualize a página e tente de novo.' };
      return { ok: false, error: 'Não foi possível ler o backup.' };
    }
    var cur = loadAll(), byId = {}, res = { ok: true, added: 0, copies: 0, skipped: 0, invalid: 0 };
    cur.games.forEach(function (g) { byId[g.id] = g; });
    data.games.forEach(function (g) {
      if (!validGame(g)) { res.invalid++; return; }
      var ex = byId[g.id];
      if (!ex) { cur.games.push(g); byId[g.id] = g; res.added++; return; }
      if (JSON.stringify(ex) === JSON.stringify(g)) { res.skipped++; return; }
      var copy = JSON.parse(JSON.stringify(g));
      copy.id = newId(); copy.name = (g.name || 'Partida') + ' (backup)';
      cur.games.push(copy); byId[copy.id] = copy; res.copies++;
    });
    if (data.seq && data.seq > cur.seq) cur.seq = data.seq;
    cur.players = cleanPlayers(cur.players.concat(data.players || []));
    saveAll(cur);
    return res;
  }

  function isPersistent() { return !!ls(); }

  global.StorageService = {
    DATA_VERSION: DATA_VERSION,
    loadAll: loadAll, saveAll: saveAll,
    listGames: listGames, listPlayers: listPlayers, savePlayers: savePlayers, mergePlayers: mergePlayers, loadGame: loadGame, saveGame: saveGame, deleteGame: deleteGame, saveMeta: saveMeta, clearAll: clearAll,
    saveDraft: saveDraft, loadDraft: loadDraft, clearDraft: clearDraft,
    exportBackup: exportBackup, importBackup: importBackup,
    isPersistent: isPersistent
  };
})(window);
