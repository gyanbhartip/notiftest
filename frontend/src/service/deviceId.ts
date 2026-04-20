// Random per-launch id. Harness only — not persisted across reloads.
const deviceId =
    'dev-' +
    Math.random().toString(36).slice(2, 10) +
    '-' +
    Date.now().toString(36);

export const getDeviceId = () => deviceId;
