// A tracker owns one camera/model pair. Old animation callbacks cannot update a new session.
function createFaceTracker({ video, model, onResult, onError, schedule = requestAnimationFrame, cancel = cancelAnimationFrame }) {
  let frame = null, active = false, previousTime = -1, previousTimestamp = -1;
  function stop() {
    active = false;
    if (frame !== null) cancel(frame);
    frame = null;
  }
  function tick(timestamp) {
    if (!active) return;
    try {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && video.currentTime !== previousTime) {
        const detectionTime = Math.max(timestamp, previousTimestamp + 1);
        const result = model.detectForVideo(video, detectionTime);
        previousTime = video.currentTime;
        previousTimestamp = detectionTime;
        onResult(result);
      }
    } catch (error) {
      stop();
      onError(error);
      return;
    }
    if (active) frame = schedule(tick);
  }
  return {
    start() {
      if (active) return;
      active = true;
      previousTime = previousTimestamp = -1;
      frame = schedule(tick);
    },
    stop,
  };
}
