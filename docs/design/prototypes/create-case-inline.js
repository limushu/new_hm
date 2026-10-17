// DESIGN-NOTION-DETAIL: study creation in a side page before finalizing the flow.
let activeCreation = null;
const closePreviousCase = closeCase;

function commitCreation() {
  if (!activeCreation) return true;
  const draft = activeCreation;
  const name = draft.pane.querySelector('#inline-case-name').value.trim();
  if (!name) return false;
  draft.item.title = name;
  if (!draft.committed) {
    draft.column.items.push(draft.item);
    draft.committed = true;
  }
  search.value = '';
  render();
  const index = draft.column.items.indexOf(draft.item);
  const ci = columns.indexOf(draft.column);
  document.querySelector(`[data-case="${ci},${index}"]`)?.classList.add('selected-case');
  return true;
}

closeCase = function () {
  if (activeCreation) {
    commitCreation();
    activeCreation = null;
    render();
  }
  closePreviousCase();
};

function createCase(ci) {
  closeCase();
  menu.hidden = true;
  const item = {title:'', type:'民商事诉讼', meta:'一审', next:'', isNew:true};
  const column = columns[ci];
  const pane = document.createElement('section');
  pane.className = 'detail-drawer creation-pane';
  pane.setAttribute('aria-label', '新建案件');
  pane.innerHTML = `
    <div class="drawer-toolbar">
      <button class="icon-button" id="close-creation" aria-label="关闭新建案件" title="关闭">»</button>
      <span class="creation-context">案件 / 新建案件</span>
      <button class="expand-case" data-expand-case>展开案件</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-symbol">${icon('folder')}</div>
      <input class="case-name-input" id="inline-case-name" aria-label="案件名称，必填" maxlength="120" placeholder="新建案件" autocomplete="off">
      <details class="creation-details">
        <summary>补充案件信息</summary>
        <div class="inline-detail-grid">
          <label>案号<input data-field="number" aria-label="案号" placeholder="未填写"></label>
          <label>法院<input data-field="court" aria-label="法院" placeholder="未填写"></label>
          <label>法官<input data-field="judge" aria-label="法官" placeholder="未填写"></label>
        </div>
      </details>
      <div class="inline-properties">
        <div class="inline-property"><label>${icon('board-icon')}案件状态</label><span class="creation-status"><i></i>${esc(column.name)}</span></div>
        <div class="inline-property"><label>${icon('file')}案件类型</label><select id="inline-case-type" aria-label="案件类型"><option>民商事诉讼</option><option>其他案件</option></select></div>
        <div class="inline-property"><label>${icon('users')}当事人</label><input data-field="party" aria-label="当事人" placeholder="未填写"></div>
      </div>
      <div class="creation-divider"></div>
      <section class="creation-section"><h3>近期安排</h3><p>暂无安排</p></section>
      <section class="creation-section"><h3>待办</h3><p>暂无待办</p></section>
      <section class="creation-section"><h3>材料</h3><div class="creation-empty">${icon('folder')}尚未添加材料</div></section>
      <section class="creation-section"><h3>工作记录</h3><p>暂无工作记录</p></section>
    </div>`;
  document.body.append(pane);
  document.body.classList.add('detail-open');
  activeCreation = {item, column, pane, committed:false};
  const title = pane.querySelector('#inline-case-name');
  const cards = document.querySelectorAll('.cards')[ci];
  const placeholder = document.createElement('button');
  placeholder.className = 'case selected-case draft-placeholder';
  placeholder.textContent = '新建案件';
  placeholder.onclick = () => title.focus();
  cards.append(placeholder);
  title.addEventListener('input', () => {
    const name = title.value.trim();
    placeholder.textContent = name || '新建案件';
    if (activeCreation?.committed && name) {
      item.title = name;
      commitCreation();
    }
  });
  title.addEventListener('blur', commitCreation);
  title.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (commitCreation()) pane.querySelector('#inline-case-type').focus();
    }
  });
  pane.querySelector('#inline-case-type').onchange = e => {
    item.type = e.target.value;
    item.meta = item.type === '民商事诉讼' ? '一审' : item.type;
    commitCreation();
  };
  pane.querySelectorAll('[data-field]').forEach(input => {
    input.addEventListener('input', () => {item[input.dataset.field] = input.value.trim();});
  });
  pane.querySelector('#close-creation').onclick = closeCase;
  pane.querySelector('[data-expand-case]').onclick=()=>toggleCaseExpanded(pane);
  title.focus();
};
