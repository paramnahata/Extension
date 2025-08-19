const get = (k) => new Promise(res => chrome.storage.local.get(k, d => res(d[k])));
const set = (obj) => new Promise(res => chrome.storage.local.set(obj, res));

(async () => {
  const enabled = await get('dailyNudgeEnabled') ?? true;
  const time = await get('dailyNudgeTime') || '21:00';
  document.getElementById('dailyNudgeEnabled').checked = !!enabled;
  document.getElementById('dailyNudgeTime').value = time;
})();

document.getElementById('saveOpt').onclick = async () => {
  const enabled = document.getElementById('dailyNudgeEnabled').checked;
  const time = document.getElementById('dailyNudgeTime').value || '21:00';
  await set({ dailyNudgeEnabled: enabled, dailyNudgeTime: time });
  chrome.runtime.sendMessage({type:'reschedule'});
  alert('Saved! Reminders rescheduled.');
};
