/* Today's videos: only the TV's own day is shown, bad items are dropped, the feed is kept, and the TV subscribes
   (EventSource) instead of polling, with a single GET where the server refuses the stream or there's no EventSource. */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
var source = fs.readFileSync(path.join(__dirname, '..', 'web', 'data.js'), 'utf8');
var from = source.indexOf('var Videos = (function');
assert(from >= 0, 'Videos found in data.js');
var code = source.slice(from);

function setup(stored, url, withStreams) {
  var storage = {}, requests = [], sources = [], timers = [];
  function FakeSource(u) { this.url = u; this.readyState = 0; this.handlers = {}; this.closed = false; sources.push(this); }
  FakeSource.prototype.addEventListener = function (name, fn) { this.handlers[name] = fn; };
  FakeSource.prototype.close = function () { this.closed = true; this.readyState = 2; };
  FakeSource.prototype.emit = function (body) { this.readyState = 1; this.handlers.feed({data: JSON.stringify(body)}); };
  if (stored) storage['fmtv.videos'] = JSON.stringify(stored);
  function XHR() { requests.push(this); }
  XHR.prototype.open = function (method, u) { this.method = method; this.url = u; };
  XHR.prototype.send = function () {};
  XHR.prototype.answer = function (status, body) {
    this.readyState = 4; this.status = status; this.responseText = JSON.stringify(body); this.onreadystatechange();
  };
  var context = vm.createContext({
    CONFIG: {videoFeedUrl: url === undefined ? 'http://192.168.1.20:3330/tv.json' : url},
    localStorage: {
      getItem: function (k) { return storage[k] === undefined ? null : storage[k]; },
      setItem: function (k, v) { storage[k] = v; }
    },
    XMLHttpRequest: XHR, Date: Date, JSON: JSON, Math: Math,
    window: withStreams ? {EventSource: FakeSource} : {},
    setTimeout: function (fn, ms) { timers.push({fn: fn, ms: ms}); return timers.length; },
    clearTimeout: function () {}
  });
  vm.runInContext(code + '\nthis.Videos = Videos;', context);
  return {Videos: context.Videos, requests: requests, storage: storage, sources: sources, timers: timers};
}

var V = setup(null, '').Videos, today = V.today();
var yesterday = V.today(Date.now() - 86400000);
var item = {id: 'dQw4w9WgXcQ', title: 'A video', channel: 'A channel', duration: 245, reason: 'x', url: 'u', at: 1};

// No feed configured: nothing is fetched.
var none = setup(null, '');
none.Videos.refresh(true);
assert.strictEqual(none.requests.length, 0);
assert.strictEqual(none.Videos.enabled, false);

// A kept feed from another day never shows; today's does.
assert.deepStrictEqual(setup({date: yesterday, items: [item]}).Videos.list().length, 0);
assert.deepStrictEqual(setup({date: today, items: [item]}).Videos.list().length, 1);

// A fetched feed: bad ids and titles dropped, the rest kept (newest first, as sent), and stored.
var h = setup({date: yesterday, items: [item]}), heard = 0;
h.Videos.onChange(function () { heard++; });
h.Videos.refresh(true);
assert.strictEqual(h.requests.length, 1);
assert.strictEqual(h.requests[0].url, 'http://192.168.1.20:3330/tv.json');
h.requests[0].answer(200, {date: today, items: [
  {id: 'newestVideo', title: 'Newest', channel: 'C', duration: 3727},
  {id: 'bad id', title: 'No'}, {id: 'abcdefghijk'}, item
]});
var list = h.Videos.list();
assert.deepStrictEqual(Array.from(list, function (v) { return v.id; }), ['newestVideo', 'dQw4w9WgXcQ']);
assert.strictEqual(heard, 1);
assert.strictEqual(JSON.parse(h.storage['fmtv.videos']).date, today);
assert.strictEqual(list[0].reason, undefined, 'only what the row shows is kept');

// Within 5 minutes, only a forced refresh fetches again; a failed fetch keeps today's feed.
h.Videos.refresh(false);
assert.strictEqual(h.requests.length, 1);
h.Videos.refresh(true);
h.requests[1].onerror();
assert.strictEqual(h.Videos.list().length, 2);

// The server's answer for another day empties the row.
h.Videos.refresh(true);
h.requests[2].answer(200, {date: yesterday, items: [item]});
assert.strictEqual(h.Videos.list().length, 0);
assert.strictEqual(heard, 2);

// Observer: connect subscribes (no GET), each event replaces the feed, hidden closes the connection.
var o = setup(null, undefined, true), seen = 0;
o.Videos.onChange(function () { seen++; });
o.Videos.connect();
assert.strictEqual(o.sources.length, 1);
assert.strictEqual(o.sources[0].url, 'http://192.168.1.20:3330/tv.json');
assert.strictEqual(o.requests.length, 0, 'no polling while subscribed');
o.sources[0].emit({date: today, items: [item]});
assert.strictEqual(o.Videos.list().length, 1);
o.sources[0].emit({date: today, items: [{id: 'newestVideo', title: 'Newest'}, item]});
assert.deepEqual(Array.from(o.Videos.list(), function (v) { return v.id; }), ['newestVideo', 'dQw4w9WgXcQ']);
assert.strictEqual(seen, 2);
o.Videos.connect();
assert.strictEqual(o.sources.length, 1, 'connect twice keeps one subscription');
o.Videos.check();
assert.strictEqual(o.requests.length, 0, 'the 30 s tick checks only the date');
o.Videos.disconnect();
assert.ok(o.sources[0].closed);
assert.strictEqual(o.Videos.subscribed(), false);
o.Videos.connect();
assert.strictEqual(o.sources.length, 2, 'shown again: subscribed again');

// A dropped connection (CONNECTING) is left to the browser; a refused stream (CLOSED) reads once and retries later.
o.sources[1].readyState = 0;
o.sources[1].onerror();
assert.strictEqual(o.requests.length, 0);
o.sources[1].readyState = 2;
o.sources[1].onerror();
assert.strictEqual(o.requests.length, 1);
o.requests[0].answer(200, {date: today, items: [item]});
assert.strictEqual(o.timers[o.timers.length - 1].ms, 60000);
o.timers[o.timers.length - 1].fn();
assert.strictEqual(o.sources.length, 3);
o.sources[2].readyState = 2;
o.sources[2].onerror();
o.requests[1].answer(200, {date: today, items: [item]});
assert.strictEqual(o.timers[o.timers.length - 1].ms, 120000, 'each refusal waits twice as long');

// The PC off (the TV turned on first): nothing answers, so it tries again every 15 s, without waiting longer.
var off = setup(null, undefined, true);
off.Videos.connect();
for (var n = 0; n < 4; n++) {
  off.sources[n].readyState = 2;
  off.sources[n].onerror();
  off.requests[n].onerror();
  assert.strictEqual(off.timers[off.timers.length - 1].ms, 15000, 'unreachable: 15 s every time');
  off.timers[off.timers.length - 1].fn();
}
assert.strictEqual(off.sources.length, 5, 'subscribes again as soon as the PC is back');
// Hidden while the GET was out: no retry scheduled.
off.sources[4].readyState = 2;
off.sources[4].onerror();
var before = off.timers.length;
off.Videos.disconnect();
off.requests[4].onerror();
assert.strictEqual(off.timers.length, before);

// Without EventSource: a GET when shown, and the tick reads again only after 5 minutes.
var p = setup(null, undefined, false);
p.Videos.connect();
assert.strictEqual(p.requests.length, 1);
p.requests[0].answer(200, {date: today, items: [item]});
p.Videos.check();
assert.strictEqual(p.requests.length, 1);

assert.strictEqual(V.duration(245), '4:05');
assert.strictEqual(V.duration(3727), '1:02:07');
assert.strictEqual(V.duration(0), '');
assert.strictEqual(V.thumbnail('dQw4w9WgXcQ'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
assert.strictEqual(V.thumbnail('dQw4w9WgXcQ', true), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg');

console.log('WebVideosTest: all checks passed.');
