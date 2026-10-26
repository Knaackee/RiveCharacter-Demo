export function createExclusiveRun(setBusy) {
  let active = null;
  return {
    begin() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      setBusy(true);
      return {
        controller,
        finish() {
          if (active !== controller) return;
          active = null;
          setBusy(false);
        },
      };
    },
    cancel() { active?.abort(); },
  };
}

export function createGenerationGuard(revision, currentRevision, dispose) {
  return {
    current() { return revision === currentRevision(); },
    async retain(promise, collection) {
      const value = await promise;
      collection.push(value);
      if (revision === currentRevision()) return value;
      dispose();
      return null;
    },
  };
}
