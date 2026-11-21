/* Today's videos: only the TV's own day is shown, bad items are dropped, and the feed is fetched and kept. */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
var source = fs.readFileSync(path.join(__dirname, '..', 'web', 'data.js'), 'utf8');
var from = source.indexOf('var Videos = (function');
assert(from >= 0, 'Videos found in data.js');
var code = source.slice(from);

function setup(stored, url) {
  var storage = {}, requests = [];
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
    XMLHttpRequest: XHR, Date: Date, JSON: JSON, Math: Math
  });
  vm.runInContext(code + '\nthis.Videos = Videos;', context);
  return {Videos: context.Videos, requests: requests, storage: storage};
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

assert.strictEqual(V.duration(245), '4:05');
assert.strictEqual(V.duration(3727), '1:02:07');
assert.strictEqual(V.duration(0), '');
assert.strictEqual(V.thumbnail('dQw4w9WgXcQ'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
assert.strictEqual(V.thumbnail('dQw4w9WgXcQ', true), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg');

console.log('WebVideosTest: all checks passed.');
