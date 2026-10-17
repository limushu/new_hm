// In-memory workflow prototype. Programs retain independent information and files.
let caseView = null;
let materialSequence = 0;
const allObjectUrls = new Set();
function toggleCaseExpanded(pane) {
  pane.classList.toggle('full-case-page');
  const button=pane.querySelector('[data-expand-case]');
  if(button)button.textContent=pane.classList.contains('full-case-page')?'收起为侧页':'展开案件';
}
const makeProgram = (name, stage = '') => ({id:++materialSequence,name,stage,number:'',court:'',judge:'',materials:[],events:[]});

function prepareCase(item) {
  if (!item.programs) {
    const parts = (item.meta || '').split('·').map(s=>s.trim());
    const name = ['一审','二审','再审','执行'].includes(parts[0]) ? parts[0] : '一审';
    item.programs = [makeProgram(name,parts[1] || '')];
    Object.assign(item.programs[0],{number:item.number||'',court:item.court||'',judge:item.judge||''});
    item.currentProgram = item.programs[0].id;
  }
  item.materials ||= [];
  item.todos ||= item.isNew ? [] : [{title:'核对案件材料',done:false},{title:'与当事人确认后续安排',done:false}];
  return item;
}
const selectedProgram = () => caseView.item.programs.find(p=>p.id===caseView.item.currentProgram);
const activeMaterials = () => caseView.scope === 'shared' ? caseView.item.materials : selectedProgram().materials;
function updateBoardContext() {
  const p = selectedProgram();
  caseView.item.meta = [p.name,p.stage].filter(Boolean).join(' · ');
  caseView.item.number = p.number;
  render();
}

openCase = function(item,status) {
  closeCase();
  prepareCase(item);
  caseView = {item,status,tab:'overview',scope:'shared',folder:null,query:'',trash:false,pane:null};
  const pane = document.createElement('section');
  pane.className = 'detail-drawer creation-pane case-page';
  pane.setAttribute('aria-label','案件详情');
  document.body.append(pane);
  document.body.classList.add('detail-open');
  caseView.pane = pane;
  renderCasePage();
  pane.querySelector('#case-close').focus();
};

function renderCasePage() {
  if (!caseView || !document.body.contains(caseView.pane)) return;
  const v=caseView,p=selectedProgram();
  v.pane.innerHTML = `<div class="drawer-toolbar"><button class="icon-button" id="case-close" title="返回看板" aria-label="返回看板">»</button><span class="creation-context">案件 / ${esc(v.item.title)}</span><button class="expand-case" data-expand-case>${v.pane.classList.contains('full-case-page')?'收起为侧页':'展开案件'}</button></div>
  <div class="drawer-body"><div class="drawer-symbol">${icon('folder')}</div><h2>${esc(v.item.title)}</h2>
  <div class="case-properties"><div><label>案件状态</label><span class="creation-status"><i></i>${esc(v.status)}</span></div><div><label for="program-select">当前程序</label><select id="program-select">${v.item.programs.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><div><label>当前阶段</label><button class="inline-value" id="edit-stage">${esc(p.stage||'设置阶段')}</button></div></div>
  <div class="case-navigation" role="tablist" aria-label="案件内容">${[['overview','概览'],['materials','材料'],['info','案件信息'],['finance','收支']].map(([key,label])=>`<button role="tab" aria-selected="${v.tab===key}" class="${v.tab===key?'active':''}" data-tab="${key}">${label}</button>`).join('')}<button class="add-program" id="add-program">${icon('plus')}新增程序</button></div>
  <div id="case-tab-content" role="tabpanel">${v.tab==='overview'?overviewMarkup():v.tab==='materials'?materialsMarkup():v.tab==='info'?infoMarkup():'<section class="creation-section"><h3>收支</h3><p>收支页面待后续设计。</p></section>'}</div></div>`;
  v.pane.querySelector('#case-close').onclick=closeCase;
  v.pane.querySelector('[data-expand-case]').onclick=()=>toggleCaseExpanded(v.pane);
  v.pane.querySelector('#program-select').onchange=e=>{
    v.item.currentProgram=Number(e.target.value);v.folder=null;v.query='';v.trash=false;updateBoardContext();renderCasePage();
  };
  v.pane.querySelector('#edit-stage').onclick=()=>editForm('切换阶段','当前阶段',p.stage,value=>{p.stage=value;updateBoardContext();renderCasePage();});
  v.pane.querySelector('#add-program').onclick=addProgram;
  v.pane.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{v.tab=b.dataset.tab;menu.hidden=true;renderCasePage();});
  bindCaseContent();
}

function overviewMarkup() {
  const v=caseView,p=selectedProgram();
  return `<section class="creation-section"><h3>近期安排</h3><p class="${v.item.deadline?'deadline-text':''}">${esc(v.item.next||'暂无安排')}</p></section>
    <section class="creation-section"><h3>待办</h3>${v.item.todos.length?v.item.todos.map((t,i)=>`<label class="todo-row"><input type="checkbox" data-todo="${i}" ${t.done?'checked':''}>${esc(t.title)}</label>`).join(''):'<p>暂无待办</p>'}</section>
    <section class="creation-section"><div class="section-heading"><h3>材料</h3><button id="overview-materials">查看全部 ${icon('folder')}</button></div><p>${v.item.materials.filter(x=>!x.deleted).length} 项案件共用材料 · ${p.materials.filter(x=>!x.deleted).length} 项${esc(p.name)}材料</p></section>
    <section class="creation-section"><div class="section-heading"><h3>程序事件</h3><button id="record-event">${icon('plus')}记录事件</button></div>${p.events.length?p.events.map(e=>`<div class="case-event"><time>${esc(e.date)}</time><span>${esc(e.text)}</span></div>`).join(''):'<p>暂无事件记录</p>'}</section>
    <section class="creation-section"><h3>工作记录</h3>${v.item.isNew?'<p>暂无工作记录</p>':'<div class="work-row">已整理现有材料，待补充相关信息。<small>今天 · 示例记录</small></div>'}</section>`;
}

function addProgram() {
  dialog.innerHTML=`<form><h2>新增办理程序</h2><p class="form-intro">原程序的信息与材料会保留。</p><label for="new-program-name">办理程序</label><select id="new-program-name"><option>二审</option><option>再审</option><option>执行</option><option>一审</option></select><label for="new-program-stage">当前阶段</label><input id="new-program-stage" placeholder="可稍后填写"><div class="dialog-actions"><button type="button" id="program-cancel">取消</button><button class="primary">新增程序</button></div></form>`;
  dialog.querySelector('#program-cancel').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const p=makeProgram(dialog.querySelector('#new-program-name').value,dialog.querySelector('#new-program-stage').value.trim());caseView.item.programs.push(p);caseView.item.currentProgram=p.id;caseView.scope='program';caseView.folder=null;caseView.query='';caseView.trash=false;dialog.close();updateBoardContext();renderCasePage();};
  dialog.showModal();dialog.querySelector('select').focus();
}

function infoMarkup() {
  const v=caseView,p=selectedProgram();
  return `<section class="creation-section"><h3>案件共用信息</h3><div class="case-info-grid"><label>当事人<input data-case-field="party" value="${esc(v.item.party||'')}" placeholder="未填写"></label><label>案件类型<input readonly value="${esc(v.item.type||'民商事诉讼')}"></label></div></section>
    <section class="creation-section"><h3>${esc(p.name)}信息</h3><div class="case-info-grid">${[['number','案号'],['court','法院'],['judge','法官']].map(([key,label])=>`<label>${label}<input data-program-field="${key}" value="${esc(p[key])}" placeholder="未填写"></label>`).join('')}</div></section>`;
}

function materialsMarkup() {
  const v=caseView,all=activeMaterials(),p=selectedProgram(),parent=all.find(x=>x.id===v.folder);
  let files=all.filter(x=>v.trash?x.deleted:!x.deleted && x.parent===v.folder);
  if(v.query) files=all.filter(x=>x.deleted===v.trash && x.name.toLocaleLowerCase().includes(v.query.toLocaleLowerCase()));
  files.sort((a,b)=>Number(b.folder)-Number(a.folder)||a.name.localeCompare(b.name,'zh-CN'));
  return `<div class="material-scope"><button data-scope="shared" class="${v.scope==='shared'?'active':''}">案件共用</button><button data-scope="program" class="${v.scope==='program'?'active':''}">${esc(p.name)}材料</button><button id="show-trash" class="trash-toggle ${v.trash?'active':''}">回收站${all.some(x=>x.deleted)?` · ${all.filter(x=>x.deleted).length}`:''}</button></div>
    <div class="material-tools"><button id="folder-root">${v.trash?'回收站':'全部材料'}</button>${parent&&!v.trash?`<span> / </span><button id="folder-parent">${esc(parent.name)}</button>`:''}<div class="material-search">${icon('search')}<input id="material-search" aria-label="搜索文件名" placeholder="搜索文件名" value="${esc(v.query)}"></div>${!v.trash?`<button id="new-folder">${icon('folder')}新建文件夹</button><button id="import-materials">${icon('plus')}添加材料</button>`:''}</div>
    <div class="material-list" id="material-drop-zone"><div class="material-row material-header"><span>名称</span><span>大小</span><span></span></div>${files.map(x=>`<div class="material-row" data-file-id="${x.id}"><button class="file-open" data-open="${x.id}" title="${esc(x.folder?'打开文件夹':'双击打开材料')}">${icon(x.folder?'folder':'file')}<span>${esc(x.name)}</span></button><span class="file-size">${x.folder?'—':formatSize(x.size)}</span>${v.trash?`<button class="restore-file" data-restore="${x.id}">恢复</button>`:`<button class="icon-button" data-file-menu="${x.id}" title="${esc(x.name)}的操作">${icon('more')}</button>`}</div>`).join('')}${files.length?'':`<div class="material-empty">${icon('folder')}<p>${v.query?'没有匹配的材料':v.trash?'回收站为空':'尚未添加材料'}</p>${!v.trash&&!v.query?'<span>拖入文件，或点击“添加材料”</span>':''}</div>`}</div><input type="file" id="material-input" multiple hidden><p class="material-feedback" id="material-feedback" role="status"></p>`;
}

function formatSize(size) {return size>=1048576?`${(size/1048576).toFixed(1)} MB`:size>=1024?`${Math.ceil(size/1024)} KB`:`${size} B`;}
function uniqueMaterialName(name,files,parent,except=null) {
  const taken=new Set(files.filter(x=>x.parent===parent&&!x.deleted&&x.id!==except).map(x=>x.name.toLocaleLowerCase()));
  if(!taken.has(name.toLocaleLowerCase()))return name;
  const dot=name.lastIndexOf('.'),base=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
  let i=2;while(taken.has(`${base} (${i})${ext}`.toLocaleLowerCase()))i++;
  return `${base} (${i})${ext}`;
}
function importFiles(files) {
  const list=activeMaterials();
  for(const file of files) {
    const url=URL.createObjectURL(file);allObjectUrls.add(url);
    list.push({id:++materialSequence,parent:caseView.folder,name:uniqueMaterialName(file.name,list,caseView.folder),folder:false,deleted:false,size:file.size,type:file.type,url});
  }
  renderCasePage();
}
function openMaterial(file) {
  if(file.folder){caseView.folder=file.id;caseView.query='';renderCasePage();return;}
  const pdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),img=file.type.startsWith('image/'),audio=file.type.startsWith('audio/');
  if(!pdf&&!img&&!audio){caseView.pane.querySelector('#material-feedback').textContent='此类材料的系统应用打开功能将在桌面版接入。';return;}
  const preview=document.createElement('section');preview.className='material-preview';preview.setAttribute('aria-label','材料预览');
  preview.innerHTML=`<header><span>${esc(file.name)}</span><button id="preview-close" aria-label="关闭预览">×</button></header><div class="material-preview-body">${pdf?`<iframe title="${esc(file.name)}" src="${file.url}"></iframe>`:img?`<img src="${file.url}" alt="${esc(file.name)}">`:`<audio src="${file.url}" controls></audio>`}</div>`;
  document.body.append(preview);preview.querySelector('button').onclick=()=>preview.remove();preview.querySelector('button').focus();
}

function bindCaseContent() {
  const v=caseView,p=selectedProgram(),pane=v.pane;
  pane.querySelectorAll('[data-todo]').forEach(input=>input.onchange=()=>{v.item.todos[Number(input.dataset.todo)].done=input.checked;});
  pane.querySelector('#overview-materials')?.addEventListener('click',()=>{v.tab='materials';renderCasePage();});
  pane.querySelector('#record-event')?.addEventListener('click',()=>editForm('记录事件','发生的事情','',value=>{p.events.unshift({text:value,date:new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).format(new Date())});renderCasePage();}));
  pane.querySelectorAll('[data-case-field]').forEach(input=>input.onchange=()=>{v.item[input.dataset.caseField]=input.value.trim();});
  pane.querySelectorAll('[data-program-field]').forEach(input=>input.onchange=()=>{p[input.dataset.programField]=input.value.trim();updateBoardContext();});
  pane.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{v.scope=b.dataset.scope;v.folder=null;v.query='';v.trash=false;renderCasePage();});
  pane.querySelector('#show-trash')?.addEventListener('click',()=>{v.trash=!v.trash;v.query='';renderCasePage();});
  pane.querySelector('#folder-root')?.addEventListener('click',()=>{v.folder=null;v.query='';renderCasePage();});
  pane.querySelector('#folder-parent')?.addEventListener('click',()=>{v.folder=activeMaterials().find(x=>x.id===v.folder)?.parent??null;renderCasePage();});
  pane.querySelector('#new-folder')?.addEventListener('click',()=>editForm('新建文件夹','文件夹名称','',value=>{const files=activeMaterials();files.push({id:++materialSequence,parent:v.folder,name:uniqueMaterialName(value,files,v.folder),folder:true,deleted:false});renderCasePage();}));
  pane.querySelector('#import-materials')?.addEventListener('click',()=>pane.querySelector('#material-input').click());
  pane.querySelector('#material-input')?.addEventListener('change',e=>importFiles(e.target.files));
  pane.querySelector('#material-search')?.addEventListener('input',e=>{const position=e.target.selectionStart;v.query=e.target.value;renderCasePage();const input=pane.querySelector('#material-search');input.focus();input.setSelectionRange(position,position);});
  pane.querySelectorAll('[data-open]').forEach(b=>{const file=activeMaterials().find(x=>x.id===Number(b.dataset.open));if(v.trash)return;b.addEventListener(file.folder?'click':'dblclick',()=>openMaterial(file));});
  pane.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{const files=activeMaterials(),file=files.find(x=>x.id===Number(b.dataset.restore));let parent=files.find(x=>x.id===file.parent);while(parent){parent.deleted=false;parent=files.find(x=>x.id===parent.parent);}file.name=uniqueMaterialName(file.name,files,file.parent,file.id);const restore=id=>{files.filter(x=>x.id===id||x.parent===id).forEach(x=>{x.deleted=false;if(x.id!==id&&x.folder)restore(x.id);});};restore(file.id);renderCasePage();});
  pane.querySelectorAll('[data-file-menu]').forEach(b=>b.onclick=()=>materialMenu(b,Number(b.dataset.fileMenu)));
  const drop=pane.querySelector('#material-drop-zone');
  if(drop&&!v.trash){drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragover');};drop.ondragleave=()=>drop.classList.remove('dragover');drop.ondrop=e=>{e.preventDefault();importFiles(e.dataTransfer.files);};}
}

function materialMenu(button,id) {
  const files=activeMaterials(),file=files.find(x=>x.id===id);
  menu.innerHTML=`<button data-action="rename">重命名</button><button data-action="move">移动到文件夹…</button>${!file.folder?'<button data-action="export">导出副本…</button>':''}<hr><button data-action="delete">移入回收站</button>`;
  const r=button.getBoundingClientRect();menu.style.left=Math.min(r.right-170,innerWidth-180)+'px';menu.style.top=Math.min(r.bottom+4,innerHeight-190)+'px';menu.hidden=false;
  menu.onclick=e=>{const action=e.target.dataset.action;if(!action)return;menu.hidden=true;
    if(action==='rename')editForm('重命名','名称',file.name,value=>{file.name=uniqueMaterialName(value,files,file.parent,file.id);renderCasePage();});
    if(action==='export'){const a=document.createElement('a');a.href=file.url;a.download=file.name;a.click();}
    if(action==='delete'){const remove=id=>files.filter(x=>x.id===id||x.parent===id).forEach(x=>{x.deleted=true;if(x.id!==id&&x.folder)remove(x.id);});remove(id);renderCasePage();}
    if(action==='move')moveMaterial(file);
  };
}
function moveMaterial(file) {
  const files=activeMaterials(),excluded=new Set([file.id]);
  let more=true;while(more){more=false;files.forEach(x=>{if(excluded.has(x.parent)&&!excluded.has(x.id)){excluded.add(x.id);more=true;}});}
  dialog.innerHTML=`<form><h2>移动到文件夹</h2><label for="move-folder">目标文件夹</label><select id="move-folder"><option value="">全部材料</option>${files.filter(x=>x.folder&&!x.deleted&&!excluded.has(x.id)).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><div class="dialog-actions"><button type="button" id="move-cancel">取消</button><button class="primary">移动</button></div></form>`;
  dialog.querySelector('#move-cancel').onclick=()=>dialog.close();dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const value=dialog.querySelector('select').value,parent=value?Number(value):null;file.name=uniqueMaterialName(file.name,files,parent,file.id);file.parent=parent;dialog.close();renderCasePage();};dialog.showModal();
}
document.addEventListener('click',e=>{if(e.target.closest('[data-file-menu]'))menu.hidden=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('.material-preview')?.remove();});
window.addEventListener('pagehide',()=>allObjectUrls.forEach(url=>URL.revokeObjectURL(url)));
