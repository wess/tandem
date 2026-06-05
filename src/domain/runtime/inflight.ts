// Tracks in-flight agent streams per channel and a per-channel epoch used to
// cancel a whole cascade. "Stop" aborts live streams (image gen) and bumps the
// epoch, so any queued or streaming turn sees the change and bails.
const controllers = new Map<number, Set<AbortController>>();
const epochs = new Map<number, number>();

export const currentEpoch = (channelId: number): number => epochs.get(channelId) ?? 0;

export const register = (channelId: number, controller: AbortController): void => {
  const set = controllers.get(channelId) ?? new Set<AbortController>();
  set.add(controller);
  controllers.set(channelId, set);
};

export const unregister = (channelId: number, controller: AbortController): void => {
  const set = controllers.get(channelId);
  if (!set) return;
  set.delete(controller);
  if (set.size === 0) controllers.delete(channelId);
};

export const abortChannel = (channelId: number): void => {
  const set = controllers.get(channelId);
  if (set) {
    for (const controller of set) controller.abort();
    controllers.delete(channelId);
  }
  epochs.set(channelId, currentEpoch(channelId) + 1);
};
