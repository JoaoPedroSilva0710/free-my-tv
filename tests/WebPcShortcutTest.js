/* Samsung's HDMI 4 shortcut joins the shelf once, without entering Data's installed-app list. */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
var source = fs.readFileSync(path.join(__dirname, '..', 'web', 'home.js'), 'utf8');

function section(start, end) {
  var from = source.indexOf(start), to = source.indexOf(end, from);
  assert(from >= 0 && to > from, 'home.js section found: ' + start);
  return source.slice(from, to);
}

function setup(saved) {
  var realApps = [
    {id: 'app.netflix', title: 'Netflix'},
    {id: 'app.youtube', title: 'YouTube'}
  ];
  var prefs = saved || {}, installed = null;
  var context = vm.createContext({
    apps: [], shelf: [], others: [], inputs: [],
    WANTED: ['youtube', 'netflix'], SHELF: [], FEW_APPS: 8,
    shelfKey: function () { return null; },
    hidden: function () { return false; },
    Prefs: {
      shelf: function () { return prefs.shelf === undefined ? null : prefs.shelf; },
      shelfConfig: function () { return prefs.shelfConfig || ''; },
      pcShortcutAdded: function () { return prefs.pcShortcutAdded === true; },
      set: function (key, value) { prefs[key] = value; }
    },
    Data: {setApps: function (list) { installed = list; }},
    TV: {
      name: 'tizen',
      apps: function (done) { done(realApps); },
      inputs: function (done) { done([{id: 'source:HDMI:4', key: 'hdmi4', label: 'HDMI 4', connected: false}]); }
    }
  });

  vm.runInContext(section('  function pickShelf() {', '\n  // MARK: - Focus'), context);
  vm.runInContext(section('  function loadApps(done) {', '\n  /** Back to the home screen'), context);
  return {
    load: vm.runInContext('loadApps', context),
    prefs: prefs,
    apps: function () { return Array.from(context.apps, function (a) { return a.id; }); },
    shelf: function () { return Array.from(context.shelf, function (a) { return a.id; }); },
    savedShelf: function () { return Array.from(prefs.shelf || []); },
    installed: function () { return Array.from(installed, function (a) { return a.id; }); }
  };
}

function checkSavedOrderAndRemoval() {
  var h = setup({shelf: ['app.netflix', 'app.youtube', 'app.missing'], shelfConfig: 'youtube,netflix'});
  h.load();
  assert.deepStrictEqual(h.savedShelf(), ['source:HDMI:4', 'app.netflix', 'app.youtube', 'app.missing']);
  assert.deepStrictEqual(h.shelf(), ['source:HDMI:4', 'app.netflix', 'app.youtube']);
  assert.deepStrictEqual(h.installed(), ['app.netflix', 'app.youtube']);
  assert(h.prefs.pcShortcutAdded);

  h.prefs.shelf = h.savedShelf().slice(1);
  h.load();
  assert.deepStrictEqual(h.savedShelf(), ['app.netflix', 'app.youtube', 'app.missing']);
  assert.deepStrictEqual(h.shelf(), ['app.netflix', 'app.youtube']);
}

function checkChangedConfigOrder() {
  var h = setup({shelf: ['app.netflix'], shelfConfig: 'old'});
  h.load();
  assert.deepStrictEqual(h.savedShelf(), ['source:HDMI:4', 'app.youtube', 'app.netflix']);
  assert.deepStrictEqual(h.shelf(), h.savedShelf());
}

checkSavedOrderAndRemoval();
checkChangedConfigOrder();
console.log('WebPcShortcutTest: migration, saved order, config order, removal and app isolation passed.');
