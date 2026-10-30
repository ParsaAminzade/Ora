// Ora's background worker:
// · turns reminder alarms (scheduled by the page) into notifications — prayer times («prayer|…»)
//   and calendar events («event|…»)
// · every two hours asks the Ora server for the newest version; when there is a newer one it
//   shows a system notification, again every 12 hours until Ora is updated.
const DEFAULT_SERVER = 'https://ora.p128parsa.workers.dev';
const CHECK = 'ora-update-check';
const AGAIN_MS = 12 * 3600 * 1000;

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === CHECK) { void checkUpdate(); return; }
  if (a.name === DISK) { void reloadIfReplaced(); return; }
  const kind = a.name.split('|')[0];
  if (kind !== 'prayer' && kind !== 'event') return;
  const parts = a.name.split('|');
  const at = parts[2];
  const text = parts.slice(3).join('|');
  // An alarm that fires much later than planned (computer was asleep) is no longer useful.
  if (Date.now() - Number(at) > 20 * 60 * 1000) return;
  chrome.notifications.create(a.name, { type: 'basic', iconUrl: 'icons/128.png', title: kind === 'event' ? 'اورآ · تقویم' : 'اورآ', message: text, priority: 2 });
});

/* ---------- new versions ---------- */
const DISK = 'ora-disk-check';
const ensureAlarm = () => {
  chrome.alarms.get(CHECK, (a) => { if (!a) chrome.alarms.create(CHECK, { delayInMinutes: 1, periodInMinutes: 120 }); });
  chrome.alarms.get(DISK, (a) => { if (!a) chrome.alarms.create(DISK, { delayInMinutes: 1, periodInMinutes: 1 }); });
};
/* Ora-Update.cmd (or you, by hand) replaced the files in Ora's folder: Chrome keeps running the old
   version until the extension is reloaded, so reload it ourselves — no trip to chrome://extensions. */
async function reloadIfReplaced() {
  try {
    const onDisk = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' }).then((r) => r.json());
    if (onDisk?.version && onDisk.version !== chrome.runtime.getManifest().version) chrome.runtime.reload();
  } catch { /* half-copied files: try again next minute */ }
}
chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); });
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); void checkUpdate(); });
ensureAlarm();

function isNewer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function checkUpdate(force = false) {
  // The page keeps these in step with «تنظیمات › حریم خصوصی و داده‌ها».
  const st = await chrome.storage.local.get(['oraServer', 'oraReceive', 'oraUpdateTold']);
  const server = (st.oraServer ?? DEFAULT_SERVER).replace(/\/+$/, '');
  if (!server || st.oraReceive === false) return;
  let latest;
  try {
    const res = await fetch(`${server}/api/latest`, { cache: 'no-store' });
    if (!res.ok) return;
    latest = await res.json();
  } catch { return; }
  const mine = chrome.runtime.getManifest().version;
  if (!latest?.version || !isNewer(latest.version, mine)) { await chrome.storage.local.set({ oraLatest: null }); return; }
  await chrome.storage.local.set({ oraLatest: latest });
  const told = st.oraUpdateTold ?? {};
  if (!force && told.v === latest.version && Date.now() - (told.at ?? 0) < AGAIN_MS) return;
  await chrome.storage.local.set({ oraUpdateTold: { v: latest.version, at: Date.now() } });
  chrome.notifications.create(`update|${latest.version}`, {
    type: 'basic',
    iconUrl: 'icons/128.png',
    title: `نسخه‌ی ${latest.version} اورآ آمد`,
    message: (latest.notes || 'نسخه‌ی تازه‌ی اورآ آماده است.').slice(0, 220),
    contextMessage: `نسخه‌ی تو: ${mine} · دو دقیقه طول می‌کشد`,
    buttons: [{ title: 'به‌روزرسانی' }],
    requireInteraction: true,
    priority: 2,
  });
}

const openUpdate = () => chrome.tabs.create({ url: chrome.runtime.getURL('index.html?update=1') });
chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('update|')) openUpdate();
  chrome.notifications.clear(id);
});
chrome.notifications.onButtonClicked.addListener((id) => {
  if (id.startsWith('update|')) { openUpdate(); chrome.notifications.clear(id); }
});
// The page can ask for a check right away (after the server address changes, for example).
chrome.runtime.onMessage.addListener((m) => { if (m === 'ora:check-update') void checkUpdate(); if (m === 'ora:disk-check') void reloadIfReplaced(); });
