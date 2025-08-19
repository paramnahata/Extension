// Storage helpers
const get = (k) => new Promise(res => chrome.storage.local.get(k, d => res(d[k])));
const set = (obj) => new Promise(res => chrome.storage.local.set(obj, res));

// DOM refs
const tabs = document.querySelectorAll('.tabs button');
const sections = document.querySelectorAll('.tab');
tabs.forEach(btn=>btn.onclick=()=>{
  tabs.forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  sections.forEach(s=>s.classList.remove('active')); document.getElementById(btn.dataset.tab).classList.add('active');
});

// Theme
(async () => {
  let theme = await get('theme') || 'dark';
  document.documentElement.classList.toggle('light', theme === 'light');
  document.getElementById('toggleTheme').onclick = async () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('light', theme === 'light');
    await set({theme});
  };
})();

// ---- TASKS ----
const els = id => document.getElementById(id);
const taskTitle=els('taskTitle'), taskDue=els('taskDue'), taskPriority=els('taskPriority'), taskPin=els('taskPin');
const addTask=els('addTask'), taskList=els('taskList'), taskSort=els('taskSort'), taskSearch=els('taskSearch'), taskFilter=els('taskFilter');
const progressBar=els('progressBar'), progressText=els('progressText');

function uid(){return Math.random().toString(36).slice(2)+Date.now().toString(36)}

async function upsertTask(t){
  const tasks = await get('tasks') || [];
  const ix = tasks.findIndex(x=>x.id===t.id);
  if(ix>=0) tasks[ix]=t; else tasks.push(t);
  await set({tasks});
  renderTasks();
  // re-schedule alarms
  chrome.runtime.sendMessage({type:'reschedule'});
}

addTask.onclick = async () => {
  const title = taskTitle.value.trim();
  if(!title) return;
  const t = {
    id: uid(),
    title,
    due: taskDue.value || null,
    priority: taskPriority.value,
    pinned: !!taskPin.checked,
    done:false,
    created: Date.now()
  };
  await upsertTask(t);
  taskTitle.value=''; taskDue.value=''; taskPriority.value='low'; taskPin.checked=false;
};

function priorityWeight(p){return p==='high'?0: p==='medium'?1:2}

async function renderTasks(){
  const q=(taskSearch.value||'').toLowerCase();
  const sort=taskSort.value, filter=taskFilter.value;
  let tasks = await get('tasks') || [];
  const total = tasks.length, done = tasks.filter(t=>t.done).length;
  const pct = total? Math.round(done*100/total):0;
  progressBar.style.width = pct + '%'; progressText.textContent = pct + '% done';

  tasks = tasks.filter(t => t.title.toLowerCase().includes(q));
  if(filter==='open') tasks = tasks.filter(t=>!t.done);
  if(filter==='done') tasks = tasks.filter(t=>t.done);
  if(filter==='pinned') tasks = tasks.filter(t=>t.pinned);
  if(filter==='today'){
    const today=new Date(); const y=today.getFullYear(), m=today.getMonth(), d=today.getDate();
    const start=new Date(y,m,d).getTime(), end=new Date(y,m,d+1).getTime();
    tasks = tasks.filter(t=>t.due && new Date(t.due).getTime()>=start && new Date(t.due).getTime()<end);
  }
  tasks.sort((a,b)=>{
    if(a.pinned!==b.pinned) return a.pinned?-1:1;
    if(sort==='dueAsc') return (a.due?new Date(a.due).getTime():Infinity) - (b.due?new Date(b.due).getTime():Infinity);
    if(sort==='dueDesc') return (b.due?new Date(b.due).getTime():-Infinity) - (a.due?new Date(a.due).getTime():-Infinity);
    if(sort==='prio') return priorityWeight(a.priority)-priorityWeight(b.priority);
    return a.created-b.created;
  });

  taskList.innerHTML='';
  tasks.forEach(t=>{
    const li=document.createElement('li'); li.className='item';
    const left=document.createElement('input'); left.type='checkbox'; left.checked=t.done; left.onchange=async()=>{t.done=left.checked; await upsertTask(t)};
    const meta=document.createElement('div'); meta.className='meta';
    const title=document.createElement('div'); title.className='title'; title.textContent=t.title;
    const sub=document.createElement('div'); sub.className='sub';
    const dueTxt = t.due ? new Date(t.due).toLocaleString() : 'No deadline';
    sub.textContent = `${dueTxt}`;
    const pr=document.createElement('span'); pr.className='badge ' + (t.priority); pr.textContent=t.priority;
    sub.append(' • ', pr);
    meta.append(title, sub);

    const actions=document.createElement('div'); actions.className='row-right';
    const pin=document.createElement('button'); pin.className='icon-btn'; pin.title='Pin'; pin.textContent=t.pinned?'📌':'📍'; pin.onclick=async()=>{t.pinned=!t.pinned; await upsertTask(t)};
    const edit=document.createElement('button'); edit.className='icon-btn'; edit.title='Edit'; edit.textContent='✏️'; edit.onclick=()=>editTask(t);
    const del=document.createElement('button'); del.className='icon-btn'; del.title='Delete'; del.textContent='🗑️'; del.onclick=async()=>{await deleteTask(t.id)};
    actions.append(pin, edit, del);

    li.append(left, meta, actions);
    taskList.append(li);
  });
}
async function deleteTask(id){
  const tasks = await get('tasks') || [];
  await set({tasks: tasks.filter(t=>t.id!==id)});
  renderTasks();
  chrome.runtime.sendMessage({type:'reschedule'});
}
function editTask(t){
  const title=prompt('Edit task title', t.title); if(title===null) return;
  const due=prompt('Edit due (YYYY-MM-DDTHH:MM) or empty', t.due||''); if(due===null) return;
  const pr=prompt('Priority low|medium|high', t.priority); if(pr===null) return;
  t.title=title.trim()||t.title; t.due=due||null; t.priority=(['low','medium','high'].includes(pr)?pr:t.priority);
  upsertTask(t);
}
['change','keyup'].forEach(e=>{taskSearch.addEventListener(e,renderTasks)});
[taskSort, taskFilter].forEach(el=>el.addEventListener('change',renderTasks));
renderTasks();

// ---- NOTES ----
const noteTitle=els('noteTitle'), noteBody=els('noteBody'), notePin=els('notePin');
const addNote=els('addNote'), noteList=els('noteList'), noteSearch=els('noteSearch'), noteSort=els('noteSort');

async function upsertNote(n){
  const notes = await get('notes') || [];
  const ix = notes.findIndex(x=>x.id===n.id);
  if(ix>=0) notes[ix]=n; else notes.push(n);
  await set({notes}); renderNotes();
}
addNote.onclick = async () => {
  const title = noteTitle.value.trim()||'Untitled';
  const body = noteBody.value.trim();
  if(!body && !title) return;
  const n = { id: uid(), title, body, pinned: !!notePin.checked, created: Date.now(), updated: Date.now() };
  await upsertNote(n);
  noteTitle.value=''; noteBody.value=''; notePin.checked=false;
};

async function renderNotes(){
  const q=(noteSearch.value||'').toLowerCase(); const sort=noteSort.value;
  let notes = await get('notes') || [];
  notes = notes.filter(n => (n.title+n.body).toLowerCase().includes(q));
  notes.sort((a,b)=>{
    if(a.pinned!==b.pinned && sort==='pinned') return a.pinned?-1:1;
    if(sort==='title') return a.title.localeCompare(b.title);
    return b.updated - a.updated;
  });
  noteList.innerHTML='';
  notes.forEach(n=>{
    const li=document.createElement('li'); li.className='item';
    const meta=document.createElement('div'); meta.className='meta';
    const title=document.createElement('div'); title.className='title'; title.textContent=n.title;
    const sub=document.createElement('div'); sub.className='sub'; sub.textContent=new Date(n.updated).toLocaleString();
    const body=document.createElement('div'); body.textContent=n.body;
    meta.append(title, sub, body);
    const actions=document.createElement('div'); actions.className='row-right';
    const pin=document.createElement('button'); pin.className='icon-btn'; pin.title='Pin'; pin.textContent=n.pinned?'📌':'📍'; pin.onclick=async()=>{n.pinned=!n.pinned; n.updated=Date.now(); await upsertNote(n)};
    const edit=document.createElement('button'); edit.className='icon-btn'; edit.title='Edit'; edit.textContent='✏️'; edit.onclick=()=>editNote(n);
    const del=document.createElement('button'); del.className='icon-btn'; del.title='Delete'; del.textContent='🗑️'; del.onclick=async()=>{await deleteNote(n.id)};
    actions.append(pin, edit, del);
    li.append(meta, actions);
    noteList.append(li);
  });
}
async function deleteNote(id){
  const notes = await get('notes') || [];
  await set({notes: notes.filter(n=>n.id!==id)});
  renderNotes();
}
function editNote(n){
  const title=prompt('Edit note title', n.title); if(title===null) return;
  const body=prompt('Edit note body', n.body); if(body===null) return;
  n.title=title.trim()||n.title; n.body=body; n.updated=Date.now();
  upsertNote(n);
}
['change','keyup'].forEach(e=>{noteSearch.addEventListener(e,renderNotes)});
noteSort.addEventListener('change',renderNotes);
renderNotes();

// ---- Import/Export ----
document.getElementById('exportBtn').onclick = async () => {
  const data = {
    tasks: await get('tasks') || [],
    notes: await get('notes') || [],
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'study-task-data.json'; a.click();
  URL.revokeObjectURL(url);
};
document.getElementById('importFile').onchange = async (e) => {
  const file = e.target.files[0]; if(!file) return;
  const text = await file.text();
  try{
    const data = JSON.parse(text);
    if(data.tasks) await set({tasks: data.tasks});
    if(data.notes) await set({notes: data.notes});
    alert('Import successful!');
    renderTasks(); renderNotes();
    chrome.runtime.sendMessage({type:'reschedule'});
  }catch(err){ alert('Invalid file.'); }
};

// open options tab link
document.getElementById('openOptions').onclick = (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};
