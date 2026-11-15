const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const createFaceTracker = runInNewContext(
  readFileSync(require('node:path').join(__dirname, '../shared/face-tracking.js'), 'utf8') + '\ncreateFaceTracker',
);

function camera(detect = () => ({ faceLandmarks: [[{ x: .5, y: .5 }]] })) {
  const video = { readyState: 2, videoWidth: 640, videoHeight: 480, currentTime: 0 };
  const queued = new Map(), results = [], errors = [], times = [];
  let nextId = 0;
  const tracker = createFaceTracker({
    video, model: { detectForVideo(frame, time) { times.push(time); return detect(frame, time); } },
    onResult: result => results.push(result), onError: error => errors.push(error),
    schedule: callback => { queued.set(++nextId, callback); return nextId; },
    cancel: id => queued.delete(id),
  });
  function advance(time = 10) {
    const [id, callback] = queued.entries().next().value;
    queued.delete(id);
    callback(time);
  }
  return { video, queued, results, errors, times, tracker, advance };
}

test('waits for decoded video and only processes new frames', () => {
  const c = camera();
  c.video.videoWidth = 0;
  c.tracker.start(); c.advance();
  assert.equal(c.results.length, 0);
  c.video.videoWidth = 640;
  c.advance(); c.advance();
  assert.equal(c.results.length, 1);
  c.video.currentTime = .04;
  c.advance();
  assert.equal(c.results.length, 2);
  assert.ok(c.times[1] > c.times[0], 'MediaPipe requires increasing timestamps');
});

test('reports inference failures and stops instead of waiting for a nonexistent face', () => {
  const failure = Error('WASM inference failed');
  const c = camera(() => { throw failure; });
  c.tracker.start(); c.advance();
  assert.equal(c.errors[0], failure);
  assert.equal(c.queued.size, 0);
  assert.equal(c.results.length, 0);
});

test('stopping cancels callbacks, including a callback already dequeued by the browser', () => {
  const c = camera();
  c.tracker.start();
  const callback = c.queued.values().next().value;
  c.tracker.stop(); callback(20);
  assert.equal(c.queued.size, 0);
  assert.equal(c.results.length, 0);
});

test('a new camera session detects frame zero even when the previous session ended there', () => {
  const first = camera();
  first.tracker.start(); first.advance(); first.tracker.stop();
  const second = camera();
  second.tracker.start(); second.advance();
  assert.equal(second.results.length, 1);
});

test('starting twice does not create parallel detection loops', () => {
  const c = camera();
  c.tracker.start(); c.tracker.start();
  assert.equal(c.queued.size, 1);
});
