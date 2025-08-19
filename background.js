// Reschedule alarms for tasks and daily study nudge
async function rescheduleAlarms(){
  await chrome.alarms.clearAll();
  const {tasks=[]} = await chrome.storage.local.get('tasks');
  const now = Date.now();
  for(const t of tasks){
    if(t.due){
      const when = new Date(t.due).getTime();
      if(when > now){
        // Use unique name to avoid collision
        chrome.alarms.create('task:'+t.id, { when });
      }
    }
  }
  const {dailyNudgeEnabled, dailyNudgeTime='21:00'} = await chrome.storage.local.get(['dailyNudgeEnabled','dailyNudgeTime']);
  if(dailyNudgeEnabled){
    // schedule at next daily time
    const [hh,mm] = dailyNudgeTime.split(':').map(Number);
    const nxt = new Date();
    nxt.setHours(hh, mm, 0, 0);
    if(nxt.getTime() <= now) nxt.setDate(nxt.getDate()+1);
    chrome.alarms.create('daily-nudge', { when: nxt.getTime(), periodInMinutes: 24*60 });
  }
}

chrome.runtime.onInstalled.addListener(rescheduleAlarms);
chrome.runtime.onStartup.addListener(rescheduleAlarms);
chrome.runtime.onMessage.addListener((msg)=>{
  if(msg?.type==='reschedule') rescheduleAlarms();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if(alarm.name.startsWith('task:')){
    const id = alarm.name.split(':')[1];
    const {tasks=[]} = await chrome.storage.local.get('tasks');
    const t = tasks.find(x=>x.id===id);
    if(t){
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Task Reminder',
        message: `${t.title} ${t.due?('at '+new Date(t.due).toLocaleString()):''}`,
        priority: 2
      });
    }
  }else if(alarm.name==='daily-nudge'){
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Study Nudge 📖',
      message: 'Time to review your notes or plan tomorrow. You got this!',
      priority: 1
    });
  }
});

// Quick add note via context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'addNoteSelection',
    title: 'Save selection as Note',
    contexts: ['selection']
  });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if(info.menuItemId === 'addNoteSelection'){
    const text = info.selectionText || '';
    const note = { id: Math.random().toString(36).slice(2), title: 'From page: '+(tab?.title||'Untitled'), body: text, pinned:false, created:Date.now(), updated:Date.now() };
    const {notes=[]} = await chrome.storage.local.get('notes');
    notes.push(note);
    await chrome.storage.local.set({notes});
    chrome.notifications.create({
      type:'basic', iconUrl:'icons/icon48.png',
      title:'Note saved', message:text.slice(0,120)
    });
  }
});
