// Ora's background worker: turns reminder alarms (scheduled by the page) into notifications —
// prayer times («prayer|…») and calendar events («event|…»).
chrome.alarms.onAlarm.addListener((a) => {
  const kind = a.name.split('|')[0];
  if (kind !== 'prayer' && kind !== 'event') return;
  const parts = a.name.split('|');
  const at = parts[2];
  const text = parts.slice(3).join('|');
  // An alarm that fires much later than planned (computer was asleep) is no longer useful.
  if (Date.now() - Number(at) > 20 * 60 * 1000) return;
  chrome.notifications.create(a.name, { type: 'basic', iconUrl: 'icons/128.png', title: kind === 'event' ? 'اورآ · تقویم' : 'اورآ', message: text, priority: 2 });
});
chrome.notifications.onClicked.addListener((id) => chrome.notifications.clear(id));
