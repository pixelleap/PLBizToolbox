window.toolboxDataReady.then(({ modules, filterOptions, filterLabels }) => {
const storageKey = 'plbiz-toolbox-plan-v2';
const filters = Object.fromEntries(Object.keys(filterOptions).map(key => [key, new Set()]));
let plan = { name: '我的选型方案', selections: {} };
let activeModule = null;
let previousFocus = null;
let groupBy = 'selection';
const byId = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const count = () => Object.keys(plan.selections).length;
const selectedVariants = id => plan.selections[id] || [];
const selectedVariant = (id, name) => selectedVariants(id).find(selection => selection.name === name);
const selectedFeatCount = id => selectedVariants(id).reduce((total, variant) => total + variant.feats.length, 0);
const selectedSummary = id => selectedVariants(id).map(variant => variant.feats.length ? `${escapeHtml(variant.name)}（${variant.feats.map(escapeHtml).join('、')}）` : escapeHtml(variant.name)).join(' / ');

function updateCatalogStats() {
  const familyCount = new Set(modules.map(module => module.family)).size;
  byId('library-count').textContent = modules.length;
  byId('overview-total').innerHTML = `${modules.length} <em>个模组族</em>`;
  byId('overview-families').innerHTML = `${familyCount} <em>大能力领域</em>`;
}
function updateMobileDimensions() {
  byId('mobile-dimension').innerHTML = '<option value="">全部模组</option>' + Object.keys(filterOptions).map(key => `<option value="${escapeHtml(key)}">${escapeHtml(filterLabels[key])}</option>`).join('');
}

function savePlan() {
  try { localStorage.setItem(storageKey, JSON.stringify(plan)); }
  catch { notify('浏览器无法保存方案，请导出文件备份'); }
  updateCounts();
}
function updateCounts() {
  byId('side-count').textContent = count();
  byId('header-count').textContent = count();
  byId('overview-count').innerHTML = `${count()} <em>个已选模组</em>`;
}
function notify(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('visible'), 3000);
}
function moduleMatches(module) {
  const query = byId('search').value.trim().toLowerCase();
  const matchesSearch = !query || [module.name, module.family, ...module.variants.flatMap(variant => [variant.name, ...variant.feats]), ...module.tags].join(' ').toLowerCase().includes(query);
  const values = { condition: module.conditions, goal: module.goals.length ? module.goals : ['待补充'], cost: module.costs };
  return matchesSearch && Object.keys(filters).every(key => !filters[key].size || [...filters[key]].some(value => (values[key] || []).includes(value)));
}
function renderFilters() {
  byId('filters').innerHTML = Object.entries(filterOptions).map(([key, options]) => `<section class="filter-group"><h3>${filterLabels[key]} <span>⌄</span></h3><div class="filter-options">${options.map(value => `<label><input type="checkbox" data-filter="${key}" value="${escapeHtml(value)}" ${filters[key].has(value) ? 'checked' : ''}><span>${escapeHtml(value)}</span></label>`).join('')}</div></section>`).join('');
  byId('active-filters').innerHTML = Object.entries(filters).flatMap(([key, values]) => [...values].map(value => `<button class="filter-chip" data-remove-filter="${key}" data-value="${escapeHtml(value)}">${filterLabels[key]}：${escapeHtml(value)} <span>×</span></button>`)).join('');
}
function renderGrid() {
  const matches = modules.filter(moduleMatches);
  byId('result-count').textContent = matches.length;
  byId('empty-state').hidden = matches.length > 0;
  const families = [...new Set(modules.map(module => module.family))];
  const groups = groupBy === 'selection'
    ? [['已选模组', matches.filter(module => Object.hasOwn(plan.selections, module.id))], ['未选模组', matches.filter(module => !Object.hasOwn(plan.selections, module.id))]]
    : families.map(family => [family, matches.filter(module => module.family === family)]).filter(([, items]) => items.length);
  const cardHtml = module => {
    const selected = Object.hasOwn(plan.selections, module.id);
    const familyClass = families.indexOf(module.family) % 5;
    return `<article class="module-card"><div class="card-top"><span class="module-symbol family-${familyClass}">${['◇','✧','▣','◈','⌘'][familyClass]}</span><button class="select-button ${selected ? 'selected' : ''}" data-toggle="${module.id}" aria-label="${selected ? '移除' : '选择'}${escapeHtml(module.name)}" title="${selected ? '移除模组' : '选择模组'}">${selected ? '✓' : '+'}</button></div><button class="card-detail" data-detail="${module.id}"><span class="family-label">${escapeHtml(module.family)}</span><h3>${escapeHtml(module.name)}</h3><p>${module.variants.slice(0, 4).map(variant => escapeHtml(variant.name)).join(' / ')}</p><div class="card-tags">${module.tags.slice(0, 2).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div><span class="card-link">查看详情 <span>↗</span></span></button></article>`;
  };
  byId('module-grid').innerHTML = matches.length ? groups.map(([name, items]) => `<section class="module-group"><h3>${escapeHtml(name)} <span>${items.length}</span></h3>${items.length ? `<div class="module-grid">${items.map(cardHtml).join('')}</div>` : '<p class="group-empty">暂无模组</p>'}</section>`).join('') : '';
}
function render() { renderFilters(); renderGrid(); updateCounts(); }
function clearFilters() {
  Object.values(filters).forEach(set => set.clear());
  byId('search').value = '';
  byId('mobile-dimension').value = '';
  updateMobileOptions();
  render();
}
function openDrawer(html) {
  previousFocus = document.activeElement;
  byId('drawer-content').innerHTML = html;
  byId('overlay').hidden = false;
  byId('drawer').hidden = false;
  document.body.classList.add('drawer-open');
  byId('drawer').querySelector('button, input')?.focus();
}
function closeDrawer() {
  byId('drawer').hidden = true;
  byId('overlay').hidden = true;
  document.body.classList.remove('drawer-open');
  activeModule = null;
  previousFocus?.focus();
}
function detailsHtml(module) {
  const selected = Object.hasOwn(plan.selections, module.id);
  const dependency = module.name === '内容包解锁' ? '组合示例：通用商店 + 内容包解锁 + 支付与权益。' : module.name === '失败挽救' ? '组合示例：失败挽救 + 广告接入与控制 + 奖励与经济。' : '待补充';
  const selectedCount = selectedVariants(module.id).length;
  const featCount = selectedFeatCount(module.id);
  const variantHtml = module.variants.map(variant => {
    const selection = selectedVariant(module.id, variant.name);
    const featHtml = selection && variant.feats.length ? `<div class="feat-list">${variant.feats.map(feat => `<label class="feat"><input type="checkbox" data-variant="${escapeHtml(variant.name)}" data-feat="${escapeHtml(feat)}" ${selection.feats.includes(feat) ? 'checked' : ''}><span>${escapeHtml(feat)}</span></label>`).join('')}</div><div class="feat-actions"><button class="text-button" data-feat-all="${escapeHtml(variant.name)}">全选</button><button class="text-button" data-feat-clear="${escapeHtml(variant.name)}">清空</button></div>` : '';
    const featMeta = variant.feats.length ? `${selection?.feats.length || 0}/${variant.feats.length} feat` : '无 feat';
    return `<div class="variant-option"><label class="variant"><input type="checkbox" data-variant="${escapeHtml(variant.name)}" ${selection ? 'checked' : ''}><span>${escapeHtml(variant.name)}</span><small>${featMeta}</small></label>${featHtml}</div>`;
  }).join('');
  return `<div class="drawer-header"><div><span class="drawer-eyebrow">模组详情 / ${escapeHtml(module.family)}</span><h2>${escapeHtml(module.name)}</h2></div><button class="icon-button" data-close aria-label="关闭">×</button></div><div class="drawer-body"><div class="detail-intro"><span>模组族</span><p>${module.variants.map(variant => escapeHtml(variant.name)).join(' / ')}</p><div class="card-tags">${module.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div></div><section class="detail-section"><div class="section-title"><h3>选择变体与 feat</h3><span>${selectedCount} 个变体 / ${featCount} 个 feat</span></div><p class="muted">变体可多选；启用变体后可继续多选功能 feat</p><div class="variant-list">${variantHtml}</div></section><section class="detail-section"><h3>适配条件</h3><p>${module.conditions.map(escapeHtml).join(' / ')}</p></section><section class="detail-section"><h3>玩家价值与触发</h3><p>待补充</p></section><section class="detail-section"><h3>变体与 UI 模板</h3><p>变体和 feat 配置来自 data.yaml。</p></section><section class="detail-section"><h3>依赖与配置</h3><p>${dependency}</p></section><section class="detail-section"><h3>异常与体验护栏</h3><p>${module.name === '抽奖与随机商品' ? '需合规审查；具体规则待补充。' : '待补充'}</p></section><section class="detail-section"><h3>开发 / 内容 / 运营成本</h3><p>待补充</p></section><section class="detail-section"><h3>指标与适配案例</h3><p>待补充</p></section></div><div class="drawer-footer"><button class="button ${selected ? 'secondary' : 'primary'} full" data-toggle="${module.id}">${selected ? '从方案中移除' : '+ 加入选型方案'}</button></div>`;
}
function showDetails(id) {
  const module = modules.find(item => item.id === id);
  if (!module) return;
  activeModule = id;
  openDrawer(detailsHtml(module));
}
function refreshDetails(id) {
  const module = modules.find(item => item.id === id);
  if (module) byId('drawer-content').innerHTML = detailsHtml(module);
}
function planHtml() {
  const entries = modules.filter(module => Object.hasOwn(plan.selections, module.id));
  return `<div class="drawer-header"><div><span class="drawer-eyebrow">工作空间 / 我的选型</span><h2>我的选型方案 <span class="heading-count">${entries.length}</span></h2></div><button class="icon-button" data-close aria-label="关闭">×</button></div><div class="drawer-body"><label class="field-label" for="plan-name">方案名称</label><input class="name-input" id="plan-name" maxlength="100" value="${escapeHtml(plan.name)}" placeholder="输入方案名称"><div class="plan-list-heading"><h3>已选模组</h3><span>${entries.length} 个模组</span></div>${entries.length ? entries.map(module => `<div class="plan-item"><div><span class="family-label">${escapeHtml(module.family)}</span><strong>${escapeHtml(module.name)}</strong><p>${selectedSummary(module.id) || '尚未选择变体'}</p><button class="text-button" data-edit="${module.id}">编辑变体 ↗</button></div><button class="icon-button remove-button" data-remove="${module.id}" aria-label="移除${escapeHtml(module.name)}">×</button></div>`).join('') : '<div class="plan-empty"><span>▤</span><strong>还没有选择模组</strong><p>从模组库中选择适合项目的能力</p></div>'}</div><div class="drawer-footer"><button class="button secondary" data-import>↑ 导入方案</button><button class="button primary" data-export>↓ 导出 JSON</button></div>`;
}
function showPlan() { activeModule = null; openDrawer(planHtml()); }
function toggleModule(id) {
  if (Object.hasOwn(plan.selections, id)) delete plan.selections[id];
  else plan.selections[id] = [];
  savePlan(); renderGrid();
  if (activeModule === id && !byId('drawer').hidden) refreshDetails(id);
}
function validatePlan(data) {
  if (!data || data.version !== 2 || typeof data.name !== 'string' || data.name.length > 100 || !Array.isArray(data.modules)) throw new Error('文件格式或版本不正确');
  const selections = {};
  const seen = new Set();
  const unknown = [];
  for (const entry of data.modules) {
    if (!entry || typeof entry.id !== 'string' || !Array.isArray(entry.variants) || !entry.variants.every(variant => variant && typeof variant.name === 'string' && Array.isArray(variant.feats) && variant.feats.every(feat => typeof feat === 'string')) || seen.has(entry.id)) throw new Error('模组数据格式不正确');
    seen.add(entry.id);
    const module = modules.find(item => item.id === entry.id);
    if (!module) { unknown.push(`未知模组：${entry.id}`); continue; }
    const moduleVariants = new Map(module.variants.map(variant => [variant.name, variant]));
    const selected = [];
    for (const variant of entry.variants) {
      const definition = moduleVariants.get(variant.name);
      if (!definition) { unknown.push(`${module.name}的未知变体：${variant.name}`); continue; }
      const missingFeats = variant.feats.filter(feat => !definition.feats.includes(feat));
      if (missingFeats.length) unknown.push(`${module.name}/${variant.name}的未知 feat：${missingFeats.join('、')}`);
      selected.push({ name: variant.name, feats: [...new Set(variant.feats.filter(feat => definition.feats.includes(feat)))] });
    }
    selections[entry.id] = selected;
  }
  return { name: data.name, selections, unknown };
}
function exportPlan() {
  const payload = { version: 2, name: plan.name, modules: modules.filter(module => Object.hasOwn(plan.selections, module.id)).map(module => ({ id: module.id, variants: plan.selections[module.id] })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = '商业化模组选型方案.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('方案已导出');
}
async function importPlan(file) {
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('文件超过 1 MB');
    const parsed = validatePlan(JSON.parse(await file.text()));
    if (parsed.unknown.length) { alert(`方案包含无法识别的内容，未导入，也未修改当前方案：\n${parsed.unknown.join('\n')}`); return; }
    if (!confirm(`导入“${parsed.name || '未命名方案'}”将替换当前方案，是否继续？`)) return;
    plan = { name: parsed.name, selections: parsed.selections }; savePlan(); render();
    if (!byId('drawer').hidden) { activeModule = null; byId('drawer-content').innerHTML = planHtml(); }
    notify('方案已导入');
  } catch (error) { alert(`无法导入方案：${error instanceof SyntaxError ? '不是有效的 JSON 文件' : error.message}`); }
}
function updateMobileOptions() {
  const dimension = byId('mobile-dimension').value;
  byId('mobile-value').innerHTML = '<option value="">全部</option>' + (filterOptions[dimension] || []).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
}

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && typeof saved.name === 'string' && saved.selections && typeof saved.selections === 'object' && !Array.isArray(saved.selections)) {
    const checked = validatePlan({ version: 2, name: saved.name, modules: Object.entries(saved.selections).map(([id, variants]) => ({ id, variants })) });
    plan = { name: checked.name, selections: checked.selections };
  }
} catch { notify('本地方案无法读取，已打开空方案'); }
updateCatalogStats();
updateMobileDimensions();
render();
document.addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.group) {
    groupBy = target.dataset.group;
    document.querySelectorAll('[data-group]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.group === groupBy)));
    renderGrid();
  }
  else if (target.dataset.toggle) {
    const id = target.dataset.toggle;
    const inGrid = Boolean(target.closest('#module-grid'));
    toggleModule(id);
    if (inGrid) [...byId('module-grid').querySelectorAll('[data-toggle]')].find(button => button.dataset.toggle === id)?.focus();
  }
  else if ((target.dataset.featAll || target.dataset.featClear) && activeModule) {
    const module = modules.find(item => item.id === activeModule);
    const name = target.dataset.featAll || target.dataset.featClear;
    const selection = selectedVariant(activeModule, name);
    const definition = module?.variants.find(variant => variant.name === name);
    if (selection && definition) {
      selection.feats = target.dataset.featAll ? [...definition.feats] : [];
      savePlan();
      refreshDetails(activeModule);
      const action = target.dataset.featAll ? 'featAll' : 'featClear';
      [...byId('drawer').querySelectorAll('button')].find(button => button.dataset[action] === name)?.focus();
    }
  }
  else if (target.dataset.detail) showDetails(target.dataset.detail);
  else if (target.hasAttribute('data-close')) closeDrawer();
  else if (target.dataset.edit) showDetails(target.dataset.edit);
  else if (target.dataset.remove) { delete plan.selections[target.dataset.remove]; savePlan(); renderGrid(); byId('drawer-content').innerHTML = planHtml(); }
  else if (target.hasAttribute('data-export')) exportPlan();
  else if (target.hasAttribute('data-import')) byId('import-file').click();
  else if (target.dataset.removeFilter) { filters[target.dataset.removeFilter].delete(target.dataset.value); render(); }
});
document.addEventListener('change', event => {
  const target = event.target;
  if (target.dataset.filter) { target.checked ? filters[target.dataset.filter].add(target.value) : filters[target.dataset.filter].delete(target.value); render(); }
  if (target.dataset.variant && activeModule) {
    const module = modules.find(item => item.id === activeModule);
    const variants = selectedVariants(activeModule);
    const current = selectedVariant(activeModule, target.dataset.variant);
    if (target.dataset.feat) {
      if (!current) return;
      current.feats = target.checked ? [...new Set([...current.feats, target.dataset.feat])] : current.feats.filter(feat => feat !== target.dataset.feat);
    } else {
      plan.selections[activeModule] = target.checked
        ? current ? variants : [...variants, { name: target.dataset.variant, feats: [] }]
        : variants.filter(variant => variant.name !== target.dataset.variant);
    }
    savePlan(); renderGrid(); refreshDetails(module.id);
    [...byId('drawer').querySelectorAll('[data-variant]')].find(input => input.dataset.variant === target.dataset.variant && (target.dataset.feat ? input.dataset.feat === target.dataset.feat : !input.dataset.feat))?.focus();
  }
});
document.addEventListener('input', event => { if (event.target.id === 'plan-name') { plan.name = event.target.value; savePlan(); } });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !byId('drawer').hidden) closeDrawer();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); byId('search').focus(); }
  if (event.key === 'Tab' && !byId('drawer').hidden) {
    const items = [...byId('drawer').querySelectorAll('button:not([disabled]), input:not([disabled])')];
    if (items.length && event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
    else if (items.length && !event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  }
});
byId('search').addEventListener('input', renderGrid);
byId('reset-filters').addEventListener('click', clearFilters);
byId('empty-reset').addEventListener('click', clearFilters);
byId('open-plan').addEventListener('click', showPlan);
byId('plan-nav').addEventListener('click', showPlan);
byId('library-nav').addEventListener('click', () => { closeDrawer(); byId('search').focus(); });
byId('overlay').addEventListener('click', closeDrawer);
byId('import-button').addEventListener('click', () => byId('import-file').click());
byId('import-file').addEventListener('change', event => { importPlan(event.target.files[0]); event.target.value = ''; });
byId('mobile-dimension').addEventListener('change', updateMobileOptions);
byId('mobile-value').addEventListener('change', event => { const key = byId('mobile-dimension').value; if (key && event.target.value) filters[key].add(event.target.value); event.target.value = ''; render(); });
});

window.toolboxDataReady.catch(error => {
  console.error(error);
  const grid = document.getElementById('module-grid');
  if (grid) grid.innerHTML = `<div class="empty-state"><strong>模组配置加载失败</strong><p>请确认 data.yaml 与 data.js 位于同一目录，然后刷新页面。</p><p>${escapeHtml(error.message || '无法读取配置文件')}</p></div>`;
});
