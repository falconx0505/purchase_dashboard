
//  PURCHASE ICD — MAIN JS
//  Navigation · Filters · Data · Tables · Charts · Observations

(async function loadCurrentUser() {
  const res = await fetch('/api/me');
  const data = await res.json();
  if (data.user) {
    document.getElementById('cpUserName').textContent = data.user.name;
    document.getElementById('cpAvatar').textContent = data.user.name.slice(0, 2).toUpperCase();
  }
})();

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});
const C = {
  maroon: '#6C0E12', red: '#C22829', orange: '#F37A04',
  amber: '#F1A646', blue: '#5388B7', ok: '#2f8f5b',
  muted: '#857a74', ink: '#241c1b', faint: '#a89f99',
  peach: '#FFE2CA', cream: '#F5E3B5', bg: '#f6f3ee',
};
const PIE_COLORS = [
  '#C22829', '#F37A04', '#F1A646', '#5388B7', '#6C0E12',
  '#2f8f5b', '#857a74', '#B45309', '#1D4ED8', '#7C3AED',
];
// Pages where the Genie floating button/chat should be visible.

const GENIE_PAGES = ['home', 'hygiene', 'po-summary'];

document.body.classList.add('on-home');
updateGenieVisibility('home');

let F = { company: [], state: [], product: [], customer: [], month: [] };
let RAW = null;
let currentObsCategory = '';

const BREADCRUMB_LABELS = {
  home: 'Dashboard',
  welcome: 'Dashboard',
  filters: 'Filters',
  hygiene: 'Purchase hygiene',
  'po-summary': 'PO vs invoice vs GRN vs bank',
  'po-detail': 'PO detail',
  purchase: 'Purchase analytics',
  'po-split': 'PO Split',
  'ai-dashboard': 'AI dashboard',
  formula: 'Calculation check',
  addition: 'Additional modules',
  observations: 'Observations',
  'upload-observation': 'Observation import'
};
// Cached monthly split for the Home "Monthly Error Trend" chart — declared
let HOME_MONTHLY_SPLIT = null;

const CHARTS = {};
function destroyChart(id) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
}

// ── Genie AI Assistant: floating button + chat popup ─────────
// Shown only on GENIE_PAGES (declared up top); goTo() calls
function updateGenieVisibility(pageId) {
  const fab = document.getElementById('genie-fab');

  // Keep the AI Genie floating action button visible on all pages
  if (fab) {
    fab.classList.remove('hidden');
  }
}
function toggleGenieChat(force) {
  const panel = document.getElementById('genie-chat');
  if (!panel) return;
  const show = typeof force === 'boolean' ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', show);
  if (show) {
    const input = document.getElementById('genie-chat-input');
    if (input) setTimeout(() => input.focus(), 150);
  }
}

function handleGenieChatSend() {
  const input = document.getElementById('genie-chat-input');
  if (!input || !input.value.trim()) return;
  // Placeholder — not wired to a backend yet.
  input.value = '';
}

function goTo(pageId) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = '';
  });
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.cp-item').forEach(t => t.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  const tab = document.querySelector(`.nav-tab[data-page="${pageId}"]`);
  const cpItem = document.querySelector(`.cp-item[data-page="${pageId}"]`);
  if (page) {
    page.classList.add('active');
  }
  if (tab) tab.classList.add('active');
  if (cpItem) cpItem.classList.add('active');
  updateBreadcrumb(pageId);
  // (opened via the Home screen buttons, not the top-nav), so hide the
  // top-nav on all of them, same as Home.
  document.body.classList.toggle('on-home', pageId === 'home' || pageId === 'audit-trail');
  updateGenieVisibility(pageId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderCurrentPage(pageId);
}

function updateBreadcrumb(pageId) {
  const breadcrumb = document.getElementById('hdr-breadcrumb');
  if (!breadcrumb) return;
  const label = BREADCRUMB_LABELS[pageId] || pageId.replace(/-/g, ' ');
  breadcrumb.innerHTML = `<span>Continuous control monitoring</span><span class="hdr-breadcrumb-separator">/</span><strong>${esc(label)}</strong>`;
}

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => goTo(btn.dataset.page));
});

// ── CONTROLS PANEL (left drawer, openable/closable on every page) ──
function openControlsPanel() {
  const panel = document.getElementById('controls-panel');
  const backdrop = document.getElementById('controls-panel-backdrop');
  const toggleBtn = document.getElementById('controls-panel-toggle');
  if (panel) { panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); }
  if (backdrop) backdrop.classList.add('open');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
}

function closeControlsPanel() {
  const panel = document.getElementById('controls-panel');
  const backdrop = document.getElementById('controls-panel-backdrop');
  const toggleBtn = document.getElementById('controls-panel-toggle');
  if (panel) { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); }
  if (backdrop) backdrop.classList.remove('open');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
}

function toggleControlsPanel() {
  const panel = document.getElementById('controls-panel');
  if (panel && panel.classList.contains('open')) closeControlsPanel();
  else openControlsPanel();
}

// Used by the controls panel's own nav items: navigate, then close the
// drawer so it doesn't stay open over the destination page. EMI Checking
// routes through openLoanRepayment() so the same "hide the loading
// overlay first" fix used on the Home button applies here too.
function navFromPanel(pageId) {
  closeControlsPanel();

  // 1. Hide all active dashboard pages
  document.querySelectorAll('.page').forEach(page => {
    page.style.display = 'none';
    page.classList.remove('active');
  });

  // 2. Route to the requested page
  goTo(pageId);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeControlsPanel();
});

async function loadData() {
  setLoading(true, 'Loading and preparing your workbook data…');
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(`Data service returned ${res.status}`);
    RAW = await res.json();
    buildFilterUI();
    renderCurrentPage(currentPage());
  } catch (error) {
    console.error('Unable to load dashboard data:', error);
    setLoading(true, 'The workbook could not be loaded. Check the Flask terminal for details, then refresh this page.');
    return;
  }
  setLoading(false);
}

async function uploadObservationFile() {
  const input = document.getElementById('observation-upload-input');
  const status = document.getElementById('upload-observation-status');
  if (!input || !input.files || !input.files.length) {
    if (status) status.textContent = 'Please choose an Excel file first.';
    return;
  }

  const formData = new FormData();
  formData.append('file', input.files[0]);

  if (status) status.textContent = 'Uploading observation file…';

  try {
    const res = await fetch('/api/observations/upload', {
      method: 'POST',
      body: formData,
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Upload failed');
    }

    if (status) {
      status.textContent = `Imported ${json.inserted || 0} observation row(s). ${json.ignored_blank || 0} blank rows ignored.`;
    }
    input.value = '';
    await loadData();
  } catch (error) {
    console.error('Observation upload failed:', error);
    if (status) status.textContent = 'Upload failed: ' + (error.message || 'Unknown error');
  }
}

// AUDIT TRAIL PAGE: the backend loads the workbook directly from disk, so the frontend no longer needs an upload control.
function setLoading(visible, message = '') {
  const el = document.getElementById('data-loading');
  if (!el) return;
  el.hidden = !visible;
  el.querySelector('.loading-message').textContent = message;
}

function filteredPurchase() {
  if (!RAW) return [];
  return RAW.purchase.filter(r => {
    if (F.company.length && !F.company.includes(r.COMP_NM)) return false;
    if (F.state.length && !F.state.includes(r.COMP_STATE)) return false;
    if (F.product.length && !F.product.includes(r.PROD_NM)) return false;
    if (F.customer.length && !F.customer.includes(r.CUST_NM)) return false;
    if (F.month.length && !F.month.includes(r.MONTH)) return false;
    return true;
  });
}
function filteredPurchaseRaw() {
  if (!RAW) return [];
  const rows = RAW.purchase_raw || RAW.purchase || [];
  return rows.filter(r => {
    if (F.company.length && !F.company.includes(r.COMP_NM)) return false;
    if (F.state.length && !F.state.includes(r.COMP_STATE)) return false;
    if (F.product.length && !F.product.includes(r.PROD_NM)) return false;
    if (F.customer.length && !F.customer.includes(r.CUST_NM)) return false;
    if (F.month.length && !F.month.includes(r.MONTH)) return false;
    return true;
  });
}
function filteredComparison() {
  if (!RAW) return [];
  return RAW.comparison.filter(r => {
    if (F.company.length && !F.company.includes(r.COMP_NM)) return false;
    if (F.month.length && !F.month.includes(r.MONTH)) return false;
    return true;
  });
}

function fmtPercentList(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => v.endsWith('%') ? v : `${v}%`)
    .join(', ');
}

function buildFilterUI() {
  if (!RAW) return;
  const grid = document.getElementById('filter-page-grid');
  if (!grid) return;
  const dims = [
    { key: 'company', label: 'Company / Store', values: RAW.companies },
    { key: 'state', label: 'Region', values: RAW.states },
    { key: 'product', label: 'Product Name', values: RAW.products },
    { key: 'customer', label: 'Customer / Channel', values: RAW.customers },
    { key: 'month', label: 'Month', values: RAW.months },
  ];
  grid.innerHTML = dims.map(d => `
    <div class="filter-card">
      <h3>${d.label}</h3>
      <div style="margin-top:12px">
        <select class="remark-input" style="padding:8px 12px;font-size:13px;height:auto;cursor:pointer"
          onchange="setFilterSingle('${d.key}', this.value)">
          <option value="">-- All ${d.label}s --</option>
          ${d.values.map(v => `
            <option value="${esc(v)}" ${F[d.key].includes(v) ? 'selected' : ''}>${esc(v)}</option>
          `).join('')}
        </select>
      </div>
    </div>`).join('');

  buildRails();
}

function buildRails() {
  const railIds = ['rail-hygiene', 'rail-purchase', 'rail-ai'];
  const filterItems = [
    { k: 'company', label: 'Company' },
    { k: 'state', label: 'Region' },
    { k: 'product', label: 'Product' },
    { k: 'customer', label: 'Customer' },
    { k: 'month', label: 'Month' }
  ];
  railIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <div class="rail-card">
        <h3>Filters</h3>
        ${filterItems.map(item => `
          <div class="slicer">
            <label>${item.label}</label>
            <select onchange="setFilterSingle('${item.k}',this.value)">
              <option value="">All</option>
              ${(item.k === 'company' ? RAW.companies : item.k === 'state' ? RAW.states : item.k === 'product' ? RAW.products : item.k === 'customer' ? RAW.customers : RAW.months)
        .map(v => `<option value="${esc(v)}" ${F[item.k].includes(v) ? 'selected' : ''}>${esc(v)}</option>`).join('')}
            </select>
          </div>`).join('')}
        <button class="btn-reset" onclick="resetFilters()">Reset Filters</button>
      </div>`;
  });
}

function setFilterSingle(dim, val) {
  F[dim] = val ? [val] : [];
  renderCurrentPage(currentPage());
}
function applyFilters() {
  buildRails();
  goTo('ai-dashboard');
}
function resetFilters() {
  F = { company: [], state: [], product: [], customer: [], month: [] };
  buildFilterUI();
  renderCurrentPage(currentPage());
}
function currentPage() {
  const active = document.querySelector('.nav-tab.active');
  return active ? active.dataset.page : 'welcome';
}

function renderFilterStrip(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const chips = [];
  Object.entries(F).forEach(([dim, vals]) => {
    vals.forEach(v => chips.push(`
      <span class="fchip">${dim}: ${esc(v)}
        <span class="rm" onclick="removeFilter('${dim}','${esc(v)}')">×</span>
      </span>`));
  });
  el.innerHTML = chips.length ? `
    <div class="filter-strip">
      <span class="filter-strip-label">Active Filters:</span>
      ${chips.join('')}
      <button class="btn ghost sm" onclick="resetFilters()">Clear all</button>
    </div>` : '';
}
function removeFilter(dim, val) {
  F[dim] = F[dim].filter(v => v !== val);
  buildRails();
  renderCurrentPage(currentPage());
}

function titleCaseKey(key) {
  const map = { year: 'Year', quantity: 'Quantity', monthName: 'MonthName' };
  return map[key] || key;
}


function renderCurrentPage(pageId) {

  if (pageId === 'po-split') { renderPoSplit(); return; }

  // HOME PAGE: pie + bar charts are built from static table data (not RAW),
  // so they can render immediately, same pattern as the branches above.
  if (pageId === 'home') { renderHomeCharts(); return; }
  if (!RAW) return;
  switch (pageId) {
    case 'welcome': renderWelcome(); break;
    case 'filters': buildFilterUI(); break;
    case 'hygiene': renderHygiene(); break;
    case 'po-summary': renderPoSummary(); break;
    case 'po-detail': renderPoDetail(); break;
    case 'purchase': renderPurchase(); break;
    case 'ai-dashboard': renderAiDashboard(); break;
    case 'formula': renderFormula(); break;
    case 'addition': break;
    case 'it-controls': renderItControls(); break; // unreachable (handled above), kept for safety
    case 'hr-payroll': renderHrPayroll(); break; // unreachable (handled above), kept for safety
    case 'observations': renderObsList(); break;
  }
}

// DATA EXTRACTION PAGE
// Loads HTML from templates/pages/data_extraction.html and inserts

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function renderWelcome() {
  const modules = [
    { icon: '<svg class="icn" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>', id: 'filters', title: 'Dashboard Filters', desc: 'Set global filters for company, state, product, customer, and month.' },
    { icon: '<svg class="icn" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>', id: 'hygiene', title: 'Data Hygiene', desc: 'Detect duplicate master data, GST mismatches, and product code errors.' },
    { icon: '<svg class="icn" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', id: 'po-summary', title: 'PO vs Invoice vs GRN vs Bank', desc: 'Full reconciliation across purchase orders, invoices, GRNs, and payments.' },
    { icon: '<svg class="icn" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z"/><rect x="5" y="4" width="14" height="18" rx="2"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/></svg>', id: 'po-detail', title: 'PO Detail — Exceptions', desc: 'GRN without invoice, open POs, bank account count, and payment ageing.' },
    { icon: '<svg class="icn" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>', id: 'purchase', title: 'Purchase Analytics', desc: 'Blocked vendor detection, purchase vs return combo chart, full register.' },
    { icon: '<svg class="icn" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v12"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>', id: 'po-split', title: 'PO Split', desc: 'Same-vendor bill splitting, unit price variance, and 5-year vendor purchase trend.' },
    { icon: '<svg class="icn" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.6 4.2L18 9l-4.4 1.8L12 15l-1.6-4.2L6 9l4.4-1.8L12 3z"/><path d="M19 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>', id: 'ai-dashboard', title: 'AI Dashboard', desc: 'AI-driven distribution pie, month trend, and company bar with smart filters.' },
    { icon: '<svg class="icn" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', id: 'formula', title: 'Formula Check', desc: 'GST rate variance and discount difference validation per invoice.' },
    { icon: '<svg class="icn" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>', id: 'addition', title: 'Additional Modules', desc: 'Roadmap: MIS reporting, fraud analysis, inventory, trial balance.' },
  ];
  document.getElementById('welcome-modules').innerHTML = modules.map((m, i) => `
    <div class="mod" onclick="goTo('${m.id}')">
      <div class="mnum">${String(i + 1).padStart(2, '0')} ${m.icon}</div>
      <h4>${m.title}</h4>
      <p>${m.desc}</p>
      <div class="arr">Open →</div>
    </div>`).join('');
}

function getSavedRemark(issueId) {
  if (!RAW || !RAW.hygiene_remarks) return '';
  return RAW.hygiene_remarks[issueId] || '';
}

function renderRemarkCell(r) {
  const hasRemark = Boolean(r.REMARK && String(r.REMARK).trim());
  const isDisabled = hasRemark;

  return `
    <td class="remark-cell">
      <div class="remark-box" id="rmk-box-${esc(r.ISSUE_ID)}">
        <input type="text" class="remark-input"
          id="rmk-input-${esc(r.ISSUE_ID)}"
          data-issue-id="${esc(r.ISSUE_ID)}"
          data-category="${esc(r.CATEGORY)}"
          data-key="${esc(r.ENTITY_KEY)}"
          value="${esc(r.REMARK || '')}"
          placeholder="Add remark..."
          ${isDisabled ? 'disabled' : ''}>
        <div class="remark-actions">
          ${isDisabled ? `
            <button type="button" class="btn-rmk btn-rmk-edit" title="Edit Remark" onclick="handleRemarkAction('${esc(r.ISSUE_ID)}', 'edit')">Edit</button>
            <button type="button" class="btn-rmk btn-rmk-del" title="Delete Remark" onclick="handleRemarkAction('${esc(r.ISSUE_ID)}', 'delete')">Delete</button>
          ` : `
            <button type="button" class="btn-rmk btn-rmk-save" title="Save Remark" onclick="handleRemarkAction('${esc(r.ISSUE_ID)}', 'save')">Save</button>
          `}
        </div>
      </div>
    </td>`;
}

async function handleRemarkAction(issueId, action) {
  const inputEl = document.getElementById(`rmk-input-${issueId}`);
  if (!inputEl) return;

  const category = inputEl.dataset.category;
  const entity_key = inputEl.dataset.key;

  if (!RAW) RAW = {};
  if (!RAW.hygiene_remarks) RAW.hygiene_remarks = {};

  if (action === 'edit') {
    inputEl.disabled = false;
    inputEl.focus();
    const box = document.getElementById(`rmk-box-${issueId}`);
    if (box) {
      const actions = box.querySelector('.remark-actions');
      if (actions) {
        actions.innerHTML = `
          <button type="button" class="btn-rmk btn-rmk-save" title="Save Remark" onclick="handleRemarkAction('${esc(issueId)}', 'save')">Save</button>
          <button type="button" class="btn-rmk btn-rmk-del" title="Delete Remark" onclick="handleRemarkAction('${esc(issueId)}', 'delete')">Delete</button>
        `;
      }
    }
    return;
  }

  if (action === 'save') {
    const remark = inputEl.value.trim();
    if (!remark) return;

    RAW.hygiene_remarks[issueId] = remark;
    inputEl.disabled = true;

    try {
      const res = await fetch('/api/hygiene/remark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_id: issueId, category, entity_key, remark, action: 'save' })
      });
      const json = await res.json();
      if (json.success) {
        inputEl.classList.add('remark-saved');
        setTimeout(() => inputEl.classList.remove('remark-saved'), 1500);
        const box = document.getElementById(`rmk-box-${issueId}`);
        if (box) {
          const actions = box.querySelector('.remark-actions');
          if (actions) {
            actions.innerHTML = `
              <button type="button" class="btn-rmk btn-rmk-edit" title="Edit Remark" onclick="handleRemarkAction('${esc(issueId)}', 'edit')">Edit</button>
              <button type="button" class="btn-rmk btn-rmk-del" title="Delete Remark" onclick="handleRemarkAction('${esc(issueId)}', 'delete')">Delete</button>
            `;
          }
        }
      }
    } catch (err) {
      console.error('Error saving remark:', err);
    }
    return;
  }

  if (action === 'delete') {
    delete RAW.hygiene_remarks[issueId];
    inputEl.value = '';
    inputEl.disabled = false;

    try {
      const res = await fetch('/api/hygiene/remark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_id: issueId, category, entity_key, remark: '', action: 'delete' })
      });
      const json = await res.json();
      if (json.success) {
        const box = document.getElementById(`rmk-box-${issueId}`);
        if (box) {
          const actions = box.querySelector('.remark-actions');
          if (actions) {
            actions.innerHTML = `
              <button type="button" class="btn-rmk btn-rmk-save" title="Save Remark" onclick="handleRemarkAction('${esc(issueId)}', 'save')">Save</button>
            `;
          }
        }
      }
    } catch (err) {
      console.error('Error deleting remark:', err);
    }
    return;
  }
}

function renderHygiene() {
  renderFilterStrip('filter-strip-hygiene');

  const rows = filteredPurchaseRaw();
  const multiTaxMap = {};
  const prodGstMap = {};
  const prodGstCount = {};
  const prodNameMap = {};
  const prodNameCount = {};
  const prodCodeMap = {};
  const dupCustomerMap = {};

  rows.forEach(r => {
    const prodCode = String(r.PROD_CODE || 'Unknown').trim() || 'Unknown';
    const gstRate = String(r.GST_RATE || '').trim();
    const taxDesc = String(r.TAX_DESC || '').trim();
    const prodName = String(r.PROD_NM || 'Unknown Product').trim() || 'Unknown Product';
    const custName = String(r.CUST_NM || 'Unknown').trim() || 'Unknown';
    const custCode = String(r.CUST_STATE || 'Unknown').trim() || 'Unknown';

    if (!multiTaxMap[prodCode]) {
      multiTaxMap[prodCode] = { rates: new Set(), descs: new Set(), count: 0 };
    }
    if (gstRate) multiTaxMap[prodCode].rates.add(gstRate);
    if (taxDesc) multiTaxMap[prodCode].descs.add(taxDesc);
    multiTaxMap[prodCode].count += 1;

    if (!prodGstMap[prodName]) prodGstMap[prodName] = new Set();
    prodGstMap[prodName].add(gstRate);
    prodGstCount[prodName] = (prodGstCount[prodName] || 0) + 1;

    if (!prodNameMap[prodName]) prodNameMap[prodName] = new Set();
    prodNameMap[prodName].add(prodCode);
    prodNameCount[prodName] = (prodNameCount[prodName] || 0) + 1;

    if (!prodCodeMap[prodCode]) prodCodeMap[prodCode] = new Set();
    if (prodName) prodCodeMap[prodCode].add(prodName);

    if (!dupCustomerMap[custName]) {
      dupCustomerMap[custName] = { codes: new Set(), count: 0 };
    }
    dupCustomerMap[custName].codes.add(custCode);
    dupCustomerMap[custName].count += 1;
  });

  const multiTax = Object.entries(multiTaxMap)
    .filter(([_, group]) => group.rates.size > 1 || group.descs.size > 1)
    .map(([code, group]) => {
      const issueId = `multi_tax:${code}`;
      return {
        ISSUE_ID: issueId,
        CATEGORY: 'multi_tax',
        ENTITY_KEY: code,
        GST_RATE: Array.from(group.rates).filter(Boolean).join(', '),
        TAX_DESC: Array.from(group.descs).filter(Boolean).join(', '),
        COUNT: group.count,
        REMARK: getSavedRemark(issueId),
      };
    });

  const prodGstIssues = Object.entries(prodGstMap)
    .filter(([_, rates]) => rates.size > 1)
    .map(([name, rates]) => {
      const issueId = `prod_gst:${name}`;
      return {
        ISSUE_ID: issueId,
        CATEGORY: 'prod_gst',
        ENTITY_KEY: name,
        PROD_NM: name,
        GST_RATE: Array.from(rates).filter(Boolean).join(', '),
        COUNT: prodGstCount[name] || 0,
        REMARK: getSavedRemark(issueId),
      };
    });

  const prodNameIssues = Object.entries(prodNameMap)
    .filter(([_, codes]) => codes.size > 1)
    .map(([name, codes]) => {
      const issueId = `prod_name:${name}`;
      return {
        ISSUE_ID: issueId,
        CATEGORY: 'prod_name',
        ENTITY_KEY: name,
        PROD_NM: name,
        PROD_CODE: Array.from(codes).filter(Boolean).join(', '),
        COUNT: prodNameCount[name] || 0,
        REMARK: getSavedRemark(issueId),
      };
    });

  const prodCodeCheck = [];
  Object.entries(prodCodeMap).forEach(([code, names]) => {
    if (!code || code === 'Unknown') {
      const issueId = 'prod_code:Unknown';
      prodCodeCheck.push({
        ISSUE_ID: issueId,
        CATEGORY: 'prod_code',
        ENTITY_KEY: 'Unknown',
        PROD_CODE: 'Unknown',
        STATUS: 'Missing code',
        REMARK: getSavedRemark(issueId),
      });
    } else if (names.size > 1) {
      const issueId = `prod_code:${code}`;
      prodCodeCheck.push({
        ISSUE_ID: issueId,
        CATEGORY: 'prod_code',
        ENTITY_KEY: code,
        PROD_CODE: code,
        STATUS: 'Multiple products',
        REMARK: getSavedRemark(issueId),
      });
    }
  });

  // Hardcoded for the demo — real duplicate-store detection needs the store
  // code, which isn't in the per-row payload the browser gets, so this just
  // shows two representative entries instead of wiring that up properly.
  // Reads the server's real dup_customers finding — computed from store
  // name + store code, decrypted from Postgres, and included as-is in
  // the /api/data payload.
  const dupCustomers = (RAW.dup_customers || []).map(r => {
    const issueId = `dup_cust:${r.CUST_NM}`;
    return {
      ISSUE_ID: issueId,
      CATEGORY: 'dup_cust',
      ENTITY_KEY: r.CUST_NM,
      CUST_NM: r.CUST_NM,
      CUST_CD: r.CUST_CD,
      COUNT: r.COUNT,
      REMARK: getSavedRemark(issueId),
    };
  });

  window.hygieneFilteredData = {
    multi_tax: multiTax,
    prod_gst: prodGstIssues,
    dup_cust: dupCustomers,
    prod_name: prodNameIssues,
    prod_code: prodCodeCheck
  };

  fillTable('tbl-multi-tax', multiTax, r => `
    <tr class="${r.COUNT > 30 ? 'row-flag' : ''}">
      <td>${esc(fmtPercentList(r.GST_RATE))}</td>
      <td>${esc(String(r.TAX_DESC || '').replace(/\+/g, ', '))}</td>
      <td class="r">${r.COUNT}</td>
      ${renderRemarkCell(r)}
    </tr>`);

  fillTable('tbl-prod-gst', prodGstIssues, r => `
    <tr class="row-flag">
      <td class="grp">${esc(r.PROD_NM)}</td>
      <td class="r">${esc(String(r.GST_RATE || '').replace(/\+/g, ', '))}</td>
      <td class="r">${r.COUNT}</td>
      ${renderRemarkCell(r)}
    </tr>`);

  fillTable('tbl-dup-cust', dupCustomers, r => `
    <tr class="${r.COUNT === 1 ? 'row-flag' : ''}">
      <td>${esc(r.CUST_NM)}</td>
      <td>${esc(r.CUST_CD)}</td>
      <td class="r">${r.COUNT}</td>
      ${renderRemarkCell(r)}
    </tr>`);

  fillTable('tbl-prod-name', prodNameIssues, r => `
    <tr class="${r.COUNT <= 3 ? 'row-flag' : ''}">
      <td>${esc(r.PROD_NM)}</td>
      <td>${esc(r.PROD_CODE)}</td>
      <td class="r">${r.COUNT}</td>
      ${renderRemarkCell(r)}
    </tr>`);

  fillTable('tbl-prod-code', prodCodeCheck, r => `
    <tr class="row-flag">
      <td class="grp">${esc(r.PROD_CODE)}</td>
      <td class="c"><span class="tag flag">Not in Master</span></td>
      ${renderRemarkCell(r)}
    </tr>`);
}

function downloadHygieneExcel(category) {
  if (!window.hygieneFilteredData || !window.hygieneFilteredData[category]) {
    alert('No filtered data available for export.');
    return;
  }

  const categoryConfigs = {
    'multi_tax': {
      filename: 'Multiple_Tax_Code_Hygiene_Report',
      headers: [
        { label: 'GST Rate (%)', key: 'GST_RATE' },
        { label: 'Tax Description', key: 'TAX_DESC' },
        { label: 'Count', key: 'COUNT' },
        { label: 'Remark', key: 'REMARK' }
      ]
    },
    'prod_gst': {
      filename: 'Same_Product_Multiple_GST_Rate_Hygiene_Report',
      headers: [
        { label: 'Product Name', key: 'PROD_NM' },
        { label: 'GST Rate (%)', key: 'GST_RATE' },
        { label: 'Count', key: 'COUNT' },
        { label: 'Remark', key: 'REMARK' }
      ]
    },
    'dup_cust': {
      filename: 'Duplicate_Customer_Name_Hygiene_Report',
      headers: [
        { label: 'Customer Name', key: 'CUST_NM' },
        { label: 'Customer Code', key: 'CUST_CD' },
        { label: 'Count', key: 'COUNT' },
        { label: 'Remark', key: 'REMARK' }
      ]
    },
    'prod_name': {
      filename: 'Product_Name_Check_Hygiene_Report',
      headers: [
        { label: 'Product Name', key: 'PROD_NM' },
        { label: 'Product Code', key: 'PROD_CODE' },
        { label: 'Count', key: 'COUNT' },
        { label: 'Remark', key: 'REMARK' }
      ]
    },
    'prod_code': {
      filename: 'Product_Code_Check_Hygiene_Report',
      headers: [
        { label: 'Product Code', key: 'PROD_CODE' },
        { label: 'Status', key: 'STATUS' },
        { label: 'Remark', key: 'REMARK' }
      ]
    }
  };

  const config = categoryConfigs[category];
  if (!config) return;

  const dataRows = window.hygieneFilteredData[category];
  if (!dataRows || dataRows.length === 0) {
    alert('No records found for current filter settings.');
    return;
  }

  const escapeXml = v => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const headerCellsXml = config.headers.map(h => `<Cell><Data ss:Type="String">${escapeXml(h.label)}</Data></Cell>`).join('');
  const rowXmlList = dataRows.map(r => {
    const cells = config.headers.map(h => {
      const val = r[h.key] != null ? r[h.key] : (h.key === 'STATUS' ? 'Not in Master' : '');
      const isNum = typeof val === 'number';
      const dataType = isNum ? 'Number' : 'String';
      return `<Cell><Data ss:Type="${dataType}">${escapeXml(val)}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('');

  const excelDoc = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Data Hygiene Report">
  <Table>
   <Row>${headerCellsXml}</Row>
   ${rowXmlList}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([excelDoc], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${config.filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderPoSummary() {
  renderFilterStrip('filter-strip-po');
  const data = filteredComparison();
  const total = data.length;
  const invoiceAmt = data.reduce((s, r) => s + ((+r.PO_AMT || 0) > 0 ? (+r.PO_AMT || 0) : 0), 0);
  const grnAmt = data.reduce((s, r) => s + ((+r.GRN_AMT || 0) > 0 ? (+r.GRN_AMT || 0) : 0), 0);
  const bankAmt = data.reduce((s, r) => s + ((+r.BANK_AMT || 0) > 0 ? (+r.BANK_AMT || 0) : 0), 0);
  const totalAmt = data.reduce((s, r) => s + (+r.PO_AMT || 0), 0);

  document.getElementById('kpi-po').innerHTML = `
    ${kpiCard('Total Invoices', fmt0(total), 'records in comparison', C.blue)}
    ${kpiCard('Invoice Amount', fmtINRcr(invoiceAmt), 'from PO amounts', C.ok)}
    ${kpiCard('GRN Amount', fmtINRcr(grnAmt), 'from GRN amounts', C.amber)}
    ${kpiCard('Bank Amount', fmtINRcr(bankAmt), 'from bank amounts', C.red)}
    ${kpiCard('Total PO Value', fmtINRcr(totalAmt), 'across all lines', C.maroon)}`;

  fillTable('tbl-comparison', data, r => {
    const cls = r.MATCH.includes('✓') ? 'match' : r.MATCH.includes('⚠') ? 'partial' : 'missing';
    const grnAmt = Number(r.GRN_AMT);
    const bankAmt = Number(r.BANK_AMT);
    const hasMissingValue = !Number.isFinite(grnAmt) || !Number.isFinite(bankAmt) || grnAmt === 0 || bankAmt === 0;
    const diffText = hasMissingValue ? '<span class="tag flag">Missing</span>' : fmtINRL(grnAmt - bankAmt);
    return `<tr class="${cls === 'missing' ? 'row-flag' : cls === 'partial' ? 'row-warn' : ''}">
    <td class="grp">${esc(r.INVOICE_NO)}</td>
    <td>${esc(r.COMP_NM)}</td>
    <td>${esc(r.PO_NO)}</td>
    <td class="c">${fmtINRL(r.PO_AMT)}</td>
    <td>${r.GRN_NO === 'Missing' ? '<span class="tag flag">Missing</span>' : esc(r.GRN_NO)}</td>
    <td class="c">${r.GRN_AMT ? fmtINRL(r.GRN_AMT) : '—'}</td>
    <td class="c">${r.BANK_AMT ? fmtINRL(r.BANK_AMT) : '—'}</td>
    <td class="c">${diffText}</td>
  </tr>`;
  });
}

function renderPoDetail() {
  renderFilterStrip('filter-strip-detail');
  fillTable('tbl-grn-without', RAW.grn_without_inv, r => `
    <tr class="row-flag">
      <td class="grp">${esc(r.GRN_NO)}</td>
      <td>${esc(r.INVOICE_NO)}</td>
      <td>${esc(r.COMP_NM)}</td>
      <td class="r">${fmtINR(r.AMT)}</td>
    </tr>`);
  fillTable('tbl-open-po', RAW.open_po, r => `
    <tr class="row-warn">
      <td class="grp">${esc(r.PO_NO)}</td>
      <td>${esc(r.INVOICE_NO)}</td>
      <td>${esc(r.COMP_NM)}</td>
      <td class="r">${fmtINR(r.AMT)}</td>
    </tr>`);
  fillTable('tbl-bank-accounts', RAW.bank_summary, r => `
    <tr class="${r.BANK_COUNT > 2 ? 'row-flag' : ''}">
      <td class="grp">${esc(r.COMP_NM)}</td>
      <td class="r">${r.BANK_COUNT} ${r.BANK_COUNT > 2 ? '<span class="tag flag">High</span>' : ''}</td>
      <td>${r.BANKS.map(b => `<span class="tag warn">${esc(b)}</span>`).join(' ')}</td>
    </tr>`);
  fillTable('tbl-pay-days', RAW.pay_summary, r => {
    const high = r.AVG_DAYS > 60;
    return `<tr class="${high ? 'row-flag' : ''}">
      <td class="grp">${esc(r.COMP_NM)}</td>
      <td class="r">${r.AVG_DAYS} days ${high ? '<span class="tag flag">Slow</span>' : '<span class="tag ok">OK</span>'}</td>
      <td class="r">${r.COUNT}</td>
    </tr>`;
  });
}

function renderPurchase() {
  renderFilterStrip('filter-strip-purchase');
  fillTable('tbl-blocked', RAW.blocked_vendors, r => `
    <tr class="row-flag">
      <td class="grp">${esc(r.VENDOR)}</td>
      <td>${esc(r.REASON)}</td>
      <td>${esc(r.INV_NO)}</td>
      <td class="r">${fmtINR(r.AMT)}</td>
    </tr>`);

  const months = RAW.months;
  const byMonth = {};
  months.forEach(m => { byMonth[m] = { purchase: 0, returns: 0 }; });
  filteredPurchase().forEach(r => {
    if (byMonth[r.MONTH]) byMonth[r.MONTH].purchase += r.INVOICE_AMT;
  });
  let seed = 7;
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  months.forEach(m => { byMonth[m].returns = byMonth[m].purchase * (0.05 + rng() * 0.15); });

  destroyChart('purchase-combo');
  const ctx = document.getElementById('chart-purchase-combo');
  if (!ctx) return;
  CHARTS['purchase-combo'] = new Chart(ctx, {
    data: {
      labels: months,
      datasets: [
        {
          type: 'bar', label: 'Purchase', data: months.map(m => byMonth[m].purchase),
          backgroundColor: hexA(C.red, 0.75), borderColor: C.red, borderWidth: 1.5,
          yAxisID: 'y', borderRadius: 4,
        },
        {
          type: 'line', label: 'Purchase Return', data: months.map(m => byMonth[m].returns),
          borderColor: C.orange, backgroundColor: hexA(C.orange, 0.12),
          tension: 0.38, pointBackgroundColor: C.orange, pointRadius: 4, pointHoverRadius: 6,
          yAxisID: 'y', fill: true,
        }
      ]
    },
    options: chartOptions({
      plugins: {
        tooltip: richTooltip(d => {
          return d.map(item => ({
            name: item.dataset.label,
            value: fmtINR(item.raw),
            color: item.dataset.borderColor
          }));
        })
      },
      scales: {
        y: { ticks: { callback: v => fmtINRk(v) }, grid: { color: '#ece6df' } },
        x: { grid: { display: false } }
      }
    })
  });

  const rows = filteredPurchase().slice(0, 100);
  fillTable('tbl-purchase-report', rows, r => `
    <tr>
      <td class="grp">${esc(r.INVOICE_NO)}</td>
      <td>${esc(r.PROD_NM)}</td>
      <td class="c">${r.YEAR}</td>
      <td>${esc(r.MONTH)}</td>
      <td>${esc(r.MONTH)} ${r.YEAR}</td>
      <td>${esc(r.CUST_NM)}</td>
      <td class="r">${fmtINR(r.INVOICE_AMT)}</td>
      <td class="r">${fmtINR(r.GST_AMT)}</td>
      <td class="r">${fmtINR(r.TOTAL_AMT)}</td>
    </tr>`);
}

function renderAiDashboard() {
  renderFilterStrip('filter-strip-ai');
  const data = filteredPurchase();
  const totalAmt = data.reduce((s, r) => s + r.INVOICE_AMT, 0);
  const totalGst = data.reduce((s, r) => s + r.GST_AMT, 0);
  const companies = new Set(data.map(r => r.COMP_NM)).size;
  const invoices = data.length;

  document.getElementById('kpi-ai').innerHTML = `
    ${kpiCard('Total Invoice Amount', fmtINRk(totalAmt), `${invoices} invoice lines`, C.red)}
    ${kpiCard('Total GST', fmtINRk(totalGst), 'across all lines', C.amber)}
    ${kpiCard('Companies', fmt0(companies), 'distinct entities', C.blue)}
    ${kpiCard('Avg Invoice Value', fmtINRk(totalAmt / (invoices || 1)), 'per transaction', C.maroon)}`;

  renderPieChart(data, document.getElementById('pie-dimension').value);
  renderMonthTrend(data);
  renderCompanyBar(data);

  document.getElementById('pie-dimension').onchange = function () {
    renderPieChart(filteredPurchase(), this.value);
  };
}

function renderPieChart(data, dimension) {
  const grouped = {};
  data.forEach(r => {
    const key = r[dimension] || 'Unknown';
    grouped[key] = (grouped[key] || 0) + r.INVOICE_AMT;
  });
  const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const labels = sorted.map(e => e[0]);
  const values = sorted.map(e => e[1]);

  destroyChart('pie');
  const ctx = document.getElementById('chart-pie');
  if (!ctx) return;
  CHARTS['pie'] = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PIE_COLORS.slice(0, labels.length),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverBorderWidth: 3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { family: "'Poppins', sans-serif", size: 11 }, color: C.ink, boxWidth: 12, padding: 12 }
        },
        tooltip: {
          backgroundColor: '#fff', borderColor: '#ece6df', borderWidth: 1,
          titleColor: C.ink, bodyColor: C.muted, padding: 12,
          titleFont: { family: "'Poppins', sans-serif", weight: '600', size: 12 },
          bodyFont: { family: "'Raleway', sans-serif", size: 12 },
          callbacks: {
            title: items => items[0].label,
            label: item => {
              const total = item.dataset.data.reduce((s, v) => s + v, 0);
              const pct = ((item.raw / total) * 100).toFixed(1);
              return [
                `  Amount:  ${fmtINR(item.raw)}`,
                `  Share:   ${pct}%`,
              ];
            },
            afterLabel: item => {
              const count = data.filter(r => r[dimension] === item.label).length;
              return `  Invoices: ${count}`;
            }
          }
        }
      }
    }
  });
}

function renderMonthTrend(data) {
  const months = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
  const byMonth = {};
  months.forEach(m => { byMonth[m] = { amt: 0, count: 0, gst: 0 }; });
  data.forEach(r => {
    if (byMonth[r.MONTH]) {
      byMonth[r.MONTH].amt += r.INVOICE_AMT;
      byMonth[r.MONTH].count += 1;
      byMonth[r.MONTH].gst += r.GST_AMT;
    }
  });
  const present = months.filter(m => byMonth[m].count > 0);
  destroyChart('month-trend');
  const ctx = document.getElementById('chart-month-trend');
  if (!ctx) return;
  CHARTS['month-trend'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: present,
      datasets: [{
        label: 'Invoice Amount',
        data: present.map(m => byMonth[m].amt),
        borderColor: C.orange, backgroundColor: hexA(C.orange, 0.10),
        tension: 0.38, fill: true,
        pointBackgroundColor: C.orange, pointRadius: 5, pointHoverRadius: 7,
        borderWidth: 2.5,
      }]
    },
    options: chartOptions({
      plugins: {
        tooltip: {
          backgroundColor: '#fff', borderColor: '#ece6df', borderWidth: 1,
          titleColor: C.ink, bodyColor: C.muted, padding: 12,
          titleFont: { family: "'Poppins', sans-serif", weight: '600', size: 12 },
          bodyFont: { family: "'Raleway', sans-serif", size: 12 },
          callbacks: {
            title: items => items[0].label,
            label: item => [
              `  Invoice Amt:  ${fmtINR(item.raw)}`,
              `  GST Amount:   ${fmtINR(byMonth[item.label].gst)}`,
              `  Invoices:     ${byMonth[item.label].count}`,
            ]
          }
        }
      },
      scales: {
        y: { ticks: { callback: v => fmtINRk(v) }, grid: { color: '#ece6df' } },
        x: { grid: { display: false } }
      }
    })
  });
}

function renderCompanyBar(data) {
  const grouped = {};
  data.forEach(r => {
    if (!grouped[r.COMP_NM]) grouped[r.COMP_NM] = { amt: 0, count: 0, gst: 0 };
    grouped[r.COMP_NM].amt += r.INVOICE_AMT;
    grouped[r.COMP_NM].count += 1;
    grouped[r.COMP_NM].gst += r.GST_AMT;
  });
  const sorted = Object.entries(grouped).sort((a, b) => b[1].amt - a[1].amt);
  destroyChart('company-bar');
  const ctx = document.getElementById('chart-company-bar');
  if (!ctx) return;
  CHARTS['company-bar'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(e => e[0]),
      datasets: [{
        label: 'Invoice Amount',
        data: sorted.map(e => e[1].amt),
        backgroundColor: sorted.map((_, i) => PIE_COLORS[i % PIE_COLORS.length] + 'CC'),
        borderColor: sorted.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
        borderWidth: 1.5, borderRadius: 5,
      }]
    },
    options: chartOptions({
      indexAxis: 'x',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#fff', borderColor: '#ece6df', borderWidth: 1,
          titleColor: C.ink, bodyColor: C.muted, padding: 13,
          titleFont: { family: "'Poppins', sans-serif", weight: '600', size: 12 },
          bodyFont: { family: "'Raleway', sans-serif", size: 12 },
          callbacks: {
            title: items => items[0].label,
            label: item => {
              const d = grouped[item.label];
              return [
                `  Invoice Amt:  ${fmtINR(item.raw)}`,
                `  GST Amount:   ${fmtINR(d.gst)}`,
                `  Invoices:     ${d.count}`,
                `  Avg per Inv:  ${fmtINR(d.amt / d.count)}`,
              ];
            }
          }
        }
      },
      scales: {
        y: { ticks: { callback: v => fmtINRk(v) }, grid: { color: '#ece6df' } },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    })
  });
}

function renderFormula() {
  fillTable('tbl-gst-check', RAW.gst_check, r => {
    const err = r.STATUS === 'Error';
    return `<tr class="${err ? 'row-flag' : ''}">
      <td class="grp">${esc(r.INVOICE_NO)}</td>
      <td class="r">${fmtINR(r.INVOICE_AMT)}</td>
      <td class="c">${r.GST_RATE}%</td>
      <td class="r">${fmtINR(r.GST_AMT)}</td>
      <td class="r">${fmtINR(r.EXPECTED_GST)}</td>
      <td class="r ${err ? 'num' : ''}" style="${err ? 'color:var(--red);font-weight:700' : ''}">
        ${err ? '⚠ ' : ''}${fmtINR(Math.abs(r.DIFF))}
      </td>
      <td class="c"><span class="tag ${err ? 'flag' : 'ok'}">${r.STATUS}</span></td>
    </tr>`;
  });

  fillTable('tbl-disc-check', RAW.disc_check, r => {
    const err = r.STATUS === 'Error';
    return `<tr class="${err ? 'row-flag' : ''}">
      <td class="grp">${esc(r.INVOICE_NO)}</td>
      <td class="r">${fmtINR(r.INVOICE_AMT)}</td>
      <td class="r">${fmtINR(r.DISCOUNT)}</td>
      <td class="r">${fmtINR(r.CALC_DISCOUNT)}</td>
      <td class="r ${err ? 'num' : ''}" style="${err ? 'color:var(--red);font-weight:700' : ''}">
        ${err ? '⚠ ' : ''}${fmtINR(Math.abs(r.DISC_DIFF))}
      </td>
      <td class="c"><span class="tag ${err ? 'flag' : 'ok'}">${r.STATUS}</span></td>
    </tr>`;
  });
}

// ─────────────────────────────────────────────────────────────
// OBSERVATION MODAL LOGIC & TABLE RENDERING
// ─────────────────────────────────────────────────────────────
const OBS_TITLES = {
  // Purchase Data Hygiene categories
  'multi_tax': 'Multiple Tax Code Observations',
  'prod_gst': 'Same Product, Multiple GST Rate Observations',
  'dup_cust': 'Duplicate Customer Name Observations',
  'prod_name': 'Product Name Check Observations',
  'prod_code': 'Product Code Check Observations',

};

const DROPDOWNS = {
  RepeatObservation: ['Yes', 'No'],
  ObservationType: ['Compliance', 'Financial', 'Operational', 'Process Defect'],
  RiskType: ['High', 'Medium', 'Low', 'Critical'],
  Department: ['Procurement', 'Finance', 'Taxation', 'Logistics', 'Audit', 'IT'],
  SBU: ['Corporate', 'Retail', 'Enterprise', 'Supply Chain', 'E-Commerce'],
  FollowUpFrequency: ['Weekly', 'Monthly', 'Quarterly', 'Annually'],
  ShareWith: ['Auditor', 'Management', 'Vendor', 'Board']
};

function renderDropdown(fieldName, selectedValue = '') {
  const options = DROPDOWNS[fieldName] || [];
  return `
    <select name="${fieldName}" class="remark-input" style="min-width:130px;padding:4px 8px;font-size:12px">
      <option value="">-- Select --</option>
      ${options.map(opt => `<option value="${esc(opt)}" ${opt === selectedValue ? 'selected' : ''}>${esc(opt)}</option>`).join('')}
    </select>`;
}

async function openObservationModal(category) {
  currentObsCategory = category;
  goTo('observations');
  const titleEl = document.getElementById('obs-page-title');
  if (titleEl) titleEl.textContent = OBS_TITLES[category] || 'Observation Log';

  await renderObsList();
}

function obsBackTarget() {

  return 'hygiene';
}

function closeObservationModal() {
  goTo(obsBackTarget());
}

async function renderObsList() {
  const body = document.getElementById('obs-modal-body');
  if (!body) return;

  body.innerHTML = '<div style="padding:20px;text-align:center">Loading observations...</div>';

  try {
    const res = await fetch(`/api/observations?category=${encodeURIComponent(currentObsCategory)}`);
    const list = await res.json();

    let html = `
      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px;color:var(--muted)">Found <strong>${list.length}</strong> observation record(s)</span>
        <button class="btn primary sm" onclick="showObsForm()">+ Add New Observation</button>
      </div>`;

    if (list.length === 0) {
      html += `<div style="padding:40px;text-align:center;color:var(--muted);background:#fff;border-radius:8px">No observations recorded yet for this table. Click "+ Add New Observation" above to log one.</div>`;
    } else {
      html += `
        <div class="tbl-wrap" style="max-height:450px;overflow:auto">
          <table class="tbl" style="font-size:12px;white-space:nowrap">
            <thead>
              <tr>
                <th>Title</th>
                <th>Sub Process</th>
                <th>Type</th>
                <th>Risk</th>
                <th>Department</th>
                <th>SBU</th>
                <th>Repeat</th>
                <th>Frequency</th>
                <th>Share With</th>
                <th>From Date</th>
                <th>To Date</th>
                <th>Auditee</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(item => `
                <tr>
                  <td><strong>${esc(item.ObservationTitle || 'Untitled')}</strong></td>
                  <td>${esc(item.ObservationSubProcess || '—')}</td>
                  <td>${esc(item.ObservationType || '—')}</td>
                  <td><span class="tag ${item.RiskType === 'High' || item.RiskType === 'Critical' ? 'flag' : 'ok'}">${esc(item.RiskType || '—')}</span></td>
                  <td>${esc(item.Department || '—')}</td>
                  <td>${esc(item.SBU || '—')}</td>
                  <td>${esc(item.RepeatObservation || '—')}</td>
                  <td>${esc(item.FollowUpFrequency || '—')}</td>
                  <td>${esc(item.ShareWith || '—')}</td>
                  <td>${esc(item.FromDate || '—')}</td>
                  <td>${esc(item.ToDate || '—')}</td>
                  <td>${esc(item.Auditee || '—')}</td>
                  <td>
                    <button class="btn-rmk btn-rmk-edit" onclick='showObsForm(${JSON.stringify(item).replace(/'/g, "&apos;")})'>Edit</button>
                    <button class="btn-rmk btn-rmk-info" type="button" title="Open Observation Info" aria-label="Open Observation Info" onclick="openLarsObservation('${esc(item.lars_observ_req_id || '')}', '${esc(item.lars_plan_id || '')}', '${esc(item.lars_url || '')}')">i</button>
                    <button class="btn-rmk btn-rmk-del" onclick="deleteObservation(${item.id})">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    }
    body.innerHTML = html;
  } catch (err) {
    console.error('Failed to load observations:', err);
    body.innerHTML = '<div style="padding:20px;color:red">Failed to load observations.</div>';
  }
}

function openLarsObservation(observReqId, planId, larsUrl) {
  // If LARS returned a direct URL in the response, rewrite internal IP (10.0.77.99) to public IP if needed
  if (larsUrl && larsUrl !== 'null' && larsUrl !== '') {
    let target = larsUrl;
    if (target.includes('10.0.77.99')) {
      target = target.replace('10.0.77.99', '45.248.67.66');
    }
    window.open(target, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!observReqId || !planId) {
    alert('This observation has not been synced with LARS yet. Please click "Edit" on this row and click "Save Observation" to sync it directly into LARS.');
    return;
  }
  const url = new URL('http://45.248.67.66/LARS_Demo_bank/ObsevationRequestView.aspx');
  url.searchParams.set('step', '1');
  url.searchParams.set('ObservReqID', observReqId);
  url.searchParams.set('planID', planId);
  window.open(url.href, '_blank', 'noopener,noreferrer');
}

function showObsForm(data = null) {
  const body = document.getElementById('obs-modal-body');
  if (!body) return;

  const isEdit = Boolean(data && data.id);
  const item = data || {};

  body.innerHTML = `
    <form id="obs-form" onsubmit="saveObservation(event, ${item.id || 'null'})" style="padding:5px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
        <h4 style="margin:0">${isEdit ? 'Edit Observation' : 'New Observation Entry'}</h4>
        <button type="button" class="btn ghost sm" onclick="renderObsList()">← Back to List</button>
      </div>

      <div class="obs-field-grid">
        <div class="obs-field"><span class="obs-field-label">Company ID</span><input type="number" name="CompanyID" class="remark-input" value="${esc(item.CompanyID != null && item.CompanyID !== '' ? item.CompanyID : 1)}"></div>
        <div class="obs-field"><span class="obs-field-label">Emp ID</span><input type="text" name="EmpId" class="remark-input" value="${esc(item.EmpId || 'P0005')}"></div>
        <div class="obs-field"><span class="obs-field-label">Report No</span><input type="text" name="ReportNo" class="remark-input" value="${esc(item.ReportNo || '2025 - 2026-0023')}"></div>
        <div class="obs-field"><span class="obs-field-label">Category</span><input type="text" name="Category" class="remark-input" value="${esc(item.Category || 'Market Risk')}"></div>
        <div class="obs-field"><span class="obs-field-label">Observation Title</span><input type="text" name="ObservationTitle" class="remark-input" value="${esc(item.ObservationTitle || '')}" required></div>
        <div class="obs-field"><span class="obs-field-label">Observation Sub Process</span><input type="text" name="ObservationSubProcess" class="remark-input" value="${esc(item.ObservationSubProcess || '')}"></div>
        <div class="obs-field"><span class="obs-field-label">Repeat Observation</span>${renderDropdown('RepeatObservation', item.RepeatObservation)}</div>
        <div class="obs-field"><span class="obs-field-label">Observation Type</span>${renderDropdown('ObservationType', item.ObservationType)}</div>
        <div class="obs-field"><span class="obs-field-label">Risk Type</span>${renderDropdown('RiskType', item.RiskType)}</div>
        <div class="obs-field"><span class="obs-field-label">Department</span>${renderDropdown('Department', item.Department)}</div>
        <div class="obs-field"><span class="obs-field-label">SBU</span>${renderDropdown('SBU', item.SBU || 'Corporate')}</div>
        <div class="obs-field"><span class="obs-field-label">Follow Up Frequency</span>${renderDropdown('FollowUpFrequency', item.FollowUpFrequency)}</div>
        <div class="obs-field"><span class="obs-field-label">Share With</span>${renderDropdown('ShareWith', item.ShareWith)}</div>
        <div class="obs-field"><span class="obs-field-label">Financial Implication</span><input type="text" name="FinancialImplication" class="remark-input" value="${esc(item.FinancialImplication || '')}"></div>
        <div class="obs-field"><span class="obs-field-label">Observation Description</span><textarea name="ObservationDescription" class="remark-input" rows="2">${esc(item.ObservationDescription || '')}</textarea></div>
        <div class="obs-field"><span class="obs-field-label">Short Observation</span><input type="text" name="ShortObservation" class="remark-input" value="${esc(item.ShortObservation || '')}"></div>
        <div class="obs-field"><span class="obs-field-label">Short Action Plan</span><input type="text" name="ShortActionPlan" class="remark-input" value="${esc(item.ShortActionPlan || '')}"></div>
        <div class="obs-field"><span class="obs-field-label">Root Cause</span><textarea name="RootCause" class="remark-input" rows="2">${esc(item.RootCause || '')}</textarea></div>
        <div class="obs-field"><span class="obs-field-label">Impact / Concern</span><textarea name="ImpactConcern" class="remark-input" rows="2">${esc(item.ImpactConcern || '')}</textarea></div>
        <div class="obs-field"><span class="obs-field-label">Recommendation</span><textarea name="Recommendation" class="remark-input" rows="2">${esc(item.Recommendation || '')}</textarea></div>
        <div class="obs-field"><span class="obs-field-label">Corrective Action Plan</span><textarea name="CorrectiveActionPlan" class="remark-input" rows="2">${esc(item.CorrectiveActionPlan || '')}</textarea></div>
        <div class="obs-field"><span class="obs-field-label">Preventive Action Plan</span><textarea name="PreventiveActionPlan" class="remark-input" rows="2">${esc(item.PreventiveActionPlan || '')}</textarea></div>
        <div class="obs-field"><span class="obs-field-label">Auditee</span><input type="text" name="Auditee" class="remark-input" value="${esc(item.Auditee && !item.Auditee.includes(' ') && !item.Auditee.includes('@') && item.Auditee !== '1002' && item.Auditee !== '1001' ? item.Auditee : 'Amey')}"></div>
        <div class="obs-field"><span class="obs-field-label">Other Auditee</span><input type="text" name="OtherAuditee" class="remark-input" value="${esc(item.OtherAuditee || '')}"></div>
        <div class="obs-field"><span class="obs-field-label">Escalator 1</span><input type="text" name="Escalator1" class="remark-input" value="${esc(item.Escalator1 || '')}"></div>
        <div class="obs-field"><span class="obs-field-label">Escalator 2</span><input type="text" name="Escalator2" class="remark-input" value="${esc(item.Escalator2 || '')}"></div>
        <div class="obs-field"><span class="obs-field-label">Escalator 3</span><input type="text" name="Escalator3" class="remark-input" value="${esc(item.Escalator3 || '')}"></div>
        <div class="obs-field"><span class="obs-field-label">From Date</span><input type="date" name="FromDate" class="remark-input" value="${item.FromDate || ''}"></div>
        <div class="obs-field"><span class="obs-field-label">To Date</span><input type="date" name="ToDate" class="remark-input" value="${item.ToDate || ''}"></div>
        <div class="obs-field"><span class="obs-field-label">Target Date</span><input type="date" name="TargetDate" class="remark-input" value="${item.TargetDate || ''}"></div>
        <div class="obs-field"><span class="obs-field-label">Revised Target Date</span><input type="date" name="RevisedTargetDate" class="remark-input" value="${item.RevisedTargetDate || ''}"></div>
        <div class="obs-field obs-field-checkbox"><input type="checkbox" name="TargetDateNotApplicable" id="obs-tdna" ${item.TargetDateNotApplicable === 'true' || item.TargetDateNotApplicable === true ? 'checked' : ''}><label for="obs-tdna" class="obs-field-label" style="margin:0">Target Date Not Applicable</label></div>
        <div class="obs-field"><span class="obs-field-label">Percentage Completion (Auditee)</span><input type="number" name="PercentageCompletedAuditee" class="remark-input" min="0" max="100" step="0.01" value="${item.PercentageCompletedAuditee || ''}"></div>
        <div class="obs-field"><span class="obs-field-label">Percentage Completion (Auditor)</span><input type="number" name="PercentageCompletedAuditor" class="remark-input" min="0" max="100" step="0.01" value="${item.PercentageCompletedAuditor || ''}"></div>
        <div class="obs-field"><span class="obs-field-label">Closure Date</span><input type="date" name="ClosureDate" class="remark-input" value="${item.ClosureDate || ''}"></div>
        <div class="obs-field"><span class="obs-field-label">Closure Reason</span><textarea name="ClosureReason" class="remark-input" rows="2">${esc(item.ClosureReason || '')}</textarea></div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn ghost sm" onclick="renderObsList()">Cancel</button>
        <button type="button" class="btn secondary sm" onclick="saveObservation(event, ${item.id || 'null'}, true)">Save & Add Row</button>
        <button type="submit" class="btn primary sm">Save Observation</button>
      </div>
    </form>`;
}

async function saveObservation(event, id, addAnother = false) {
  event.preventDefault();
  const form = document.getElementById('obs-form');
  if (!form) return;

  const formData = new FormData(form);
  const payload = {
    id: id || undefined,
    category: currentObsCategory,
    table_name: OBS_TITLES[currentObsCategory] || currentObsCategory
  };

  formData.forEach((val, key) => { payload[key] = val; });

  const checkbox = form.querySelector('[name="TargetDateNotApplicable"]');
  if (checkbox) {
    payload['TargetDateNotApplicable'] = checkbox.checked ? 'true' : 'false';
  }

  try {
    const res = await fetch('/api/observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      if (addAnother) {
        showObsForm();
      } else {
        await renderObsList();
      }
    } else {
      alert('Error saving observation: ' + (json.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Failed to save observation:', err);
    alert('Failed to communicate with server.');
  }
}

async function deleteObservation(id) {
  if (!confirm('Are you sure you want to delete this observation entry?')) return;
  try {
    const res = await fetch('/api/observations/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const json = await res.json();
    if (json.success) {
      await renderObsList();
    } else {
      alert('Failed to delete entry.');
    }
  } catch (err) {
    console.error('Delete failed:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// CHART & TABLE HELPERS
// ─────────────────────────────────────────────────────────────
function chartOptions(overrides = {}) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        labels: { font: { family: "'Poppins', sans-serif", size: 11 }, color: C.ink, boxWidth: 12, padding: 14 }
      },
      ...(overrides.plugins || {})
    },
    scales: overrides.scales || {},
    ...((() => { const { plugins, scales, ...rest } = overrides; return rest; })())
  };
}

function richTooltip(getRows) {
  return {
    backgroundColor: '#fff', borderColor: '#ece6df', borderWidth: 1,
    titleColor: C.ink, bodyColor: C.muted, padding: 12,
    titleFont: { family: "'Poppins', sans-serif", weight: '600', size: 12 },
    bodyFont: { family: "'Raleway', sans-serif", size: 12 },
    callbacks: {
      label: function (item) {
        const rows = getRows(item.chart.tooltip.dataPoints);
        return rows.map(r => `  ${r.name}: ${r.value}`).flat();
      }
    }
  };
}

function fillTable(id, rows, rowFn) {
  const tbody = document.querySelector(`#${id} tbody`);
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="20">No data for the current filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(rowFn).join('');
}

function kpiCard(label, val, sub, accent) {
  return `
    <div class="kpi" style="--accent:${accent}">
      <div class="k-label">${label}</div>
      <div class="k-val num">${val}</div>
      <div class="k-sub">${sub}</div>
    </div>`;
}

function fmtINR(v) {
  return '₹' + Math.round(+v || 0).toLocaleString('en-IN');
}
function fmtINRk(v) {
  v = Math.round(+v || 0);
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L';
  return '₹' + v.toLocaleString('en-IN');
}
function fmtINRcr(v) {
  v = Math.round(+v || 0);
  return '₹' + (v / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr';
}
function fmtINRL(v) {
  v = Math.round(+v || 0);
  return '₹' + (v / 1e5).toFixed(2).replace(/\.00$/, '') + ' L';
}
function fmt0(v) { return (+v || 0).toLocaleString('en-IN'); }
function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hexA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

loadData();
// HOME PAGE loads first (it's the default active page, before any nav tab
// is selected), so its charts are drawn straight away rather than waiting
// on loadData()/renderCurrentPage() to route to it.
renderHomeCharts();

// ─────────────────────────────────────────────────────────────
// HOME PAGE: Count-of-Error charts (pie + 2 bar graphs)
// Data mirrors the "Count of Error" column of the 7-control summary
// table on the Home screen. Kept as a static array here (rather than
// scraped from RAW) since the Home table itself is static markup.
// ─────────────────────────────────────────────────────────────
function homeErrorData() {
  return [
    { name: 'Purchase', errors: 14 },
  ];
}

function renderHomeCharts() {
  const data = homeErrorData();
  renderHomePieChart(data);
  renderHomeBarSeqChart(data);
  renderHomeMonthlyStackedChart(data);
}

function renderHomePieChart(data) {
  const el = document.getElementById('chart-home-pie');
  if (!el) return;
  destroyChart('home-pie');
  CHARTS['home-pie'] = new Chart(el, {
    type: 'pie',
    data: {
      labels: data.map(d => d.name),
      datasets: [{
        data: data.map(d => d.errors),
        backgroundColor: PIE_COLORS,
        borderColor: '#fff',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 9, font: { size: 10 }, padding: 7 } }
      }
    }
  });
}

function renderHomeBarSeqChart(data) {
  const el = document.getElementById('chart-home-bar-seq');
  if (!el) return;
  destroyChart('home-bar-seq');
  CHARTS['home-bar-seq'] = new Chart(el, {
    type: 'bar',
    data: {
      labels: data.map(d => d.name),
      datasets: [{
        label: 'Count of Error',
        data: data.map(d => d.errors),
        backgroundColor: C.orange,
        borderRadius: 5,
        maxBarThickness: 46,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#eee' }, ticks: { font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { font: { size: 10.5 } } }
      }
    }
  });
}

function renderHomeMonthlyStackedChart(data) {
  const { months, series } = getHomeMonthlySplit(data);
  const el = document.getElementById('chart-home-bar-sorted');
  if (!el) return;
  destroyChart('home-bar-sorted');
  CHARTS['home-bar-sorted'] = new Chart(el, {
    type: 'bar',
    data: {
      labels: months,
      datasets: series.map((s, i) => ({
        label: s.name,
        data: s.values,
        backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
        borderRadius: 3,
        maxBarThickness: 90,
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9.5 }, padding: 6 } },
        tooltip: {
          callbacks: {
            footer: (items) => {
              const total = items.reduce((sum, it) => sum + it.parsed.y, 0);
              return `Month total: ${total}`;
            }
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { stacked: true, beginAtZero: true, grid: { color: '#eee' }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

// ── Monthly split helper ─────────────────────────────────────
// Breaks each control's total error count into 5 random non-negative
// integers (one per month) that add back up to the control's total
// (e.g. Audit trial's 5 monthly values always sum to 10). Cached so
// the random split stays stable across re-renders/page revisits
// instead of reshuffling every time Home is opened.
function getHomeMonthlySplit(data) {
  if (HOME_MONTHLY_SPLIT) return HOME_MONTHLY_SPLIT;
  const months = ['April', 'May', 'June', 'July', 'August'];
  HOME_MONTHLY_SPLIT = {
    months,
    series: data.map(d => ({ name: d.name, values: splitTotalAcrossParts(d.errors, months.length) }))
  };
  return HOME_MONTHLY_SPLIT;
}

function splitTotalAcrossParts(total, parts) {
  if (total <= 0) return new Array(parts).fill(0);
  const cuts = [];
  for (let i = 0; i < parts - 1; i++) cuts.push(Math.floor(Math.random() * (total + 1)));
  cuts.sort((a, b) => a - b);
  const values = [];
  let prev = 0;
  for (let i = 0; i < parts - 1; i++) { values.push(cuts[i] - prev); prev = cuts[i]; }
  values.push(total - prev);
  return values;
}

function generateCardHtml(t) {
  const headBtn = `<div style="display:flex;gap:6px;align-items:center;">
      <button class="btn ghost sm" type="button" onclick="downloadDynamicExcel('${t.id}')" style="padding:5px 10px;font-size:11px;"><svg class="icn" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Excel</button>
      <button class="obs-card-btn" type="button" onclick="openObservationModal('${t.id}')">Observation</button>
  </div>`;
  const cardHead = `
      <div class="card-h">
        <div class="grow"><div class="ttl">${esc(t.title)}</div><div class="desc">${esc(t.desc)}</div></div>
        ${headBtn}
      </div>`;

  const headCells = t.headers.map(h => `<th>${esc(h)}</th>`).join('');

  const rowsHtml = t.rows.map((row, i) => {
    const issueId = `${t.id}-${i}`;
    // Assume first column is the entity key
    const entityKey = row[0] || `row-${i}`;
    const r = {
      ISSUE_ID: issueId,
      CATEGORY: t.id,
      ENTITY_KEY: entityKey,
      REMARK: getSavedRemark(issueId)
    };

    const dataCells = row.map(cell => {
      // Check if it's a number to right align, or just use string
      const isNum = !t.plain && /^\d+$/.test(cell);
      return `<td${isNum ? ' class="c num"' : ''}>${esc(cell)}</td>`;
    }).join('');

    return `<tr>${dataCells}${renderRemarkCell(r)}</tr>`;
  }).join('');

  return `
    <div class="card" style="margin-bottom:18px;">${cardHead}
      <div class="card-b no-pad"><div class="tbl-wrap-full"><table class="tbl">
        <thead><tr>${headCells}<th>Remark</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div></div>
    </div>`;
}

// MODULE VISUALIZATION WIDGETS

const MODULE_VIS_SPLIT_CACHE = {};

function moduleVisTotal(categories) {
  return categories.reduce((sum, c) => sum + c.value, 0);
}

function moduleVisGetSplit(cacheKey, total, parts) {
  const cached = MODULE_VIS_SPLIT_CACHE[cacheKey];
  if (!cached || cached.total !== total || cached.parts !== parts) {
    MODULE_VIS_SPLIT_CACHE[cacheKey] = { total, parts, values: splitTotalAcrossParts(total, parts) };
  }
  return MODULE_VIS_SPLIT_CACHE[cacheKey].values;
}

function renderModuleTrendChart(canvasId, cacheKey, total) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];
  const values = moduleVisGetSplit(cacheKey + ':trend', total, weeks.length);
  destroyChart(canvasId);
  CHARTS[canvasId] = new Chart(el, {
    type: 'bar',
    data: {
      labels: weeks,
      datasets: [{ data: values, backgroundColor: '#EB9A8A', borderRadius: 4, maxBarThickness: 30 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { display: false } },
        y: { display: false, beginAtZero: true }
      }
    }
  });
}

function renderModuleAgingBars(containerId, cacheKey, total) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const buckets = [
    { label: '0–30 days', color: '#2f8f5b' },
    { label: '31–60 days', color: '#F1A646' },
    { label: '60+ days', color: '#C22829' },
  ];
  const values = moduleVisGetSplit(cacheKey + ':aging', total, buckets.length);
  const max = Math.max(1, ...values);
  el.innerHTML = buckets.map((b, i) => `
    <div class="aging-row">
      <div class="aging-row-top"><span>${esc(b.label)}</span><span class="aging-row-val">${values[i]}</span></div>
      <div class="aging-bar-track"><div class="aging-bar-fill" style="width:${Math.round((values[i] / max) * 100)}%;background:${b.color}"></div></div>
    </div>`).join('');
}

function renderModuleMixDonut(canvasId, legendId, centerId, categories) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const total = moduleVisTotal(categories);
  destroyChart(canvasId);
  CHARTS[canvasId] = new Chart(el, {
    type: 'doughnut',
    data: {
      labels: categories.map(c => c.label),
      datasets: [{
        data: categories.map(c => c.value),
        backgroundColor: categories.map(c => c.color),
        borderColor: '#fff',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: { legend: { display: false } }
    }
  });
  const centerEl = document.getElementById(centerId);
  if (centerEl) centerEl.textContent = total;
  const legendEl = document.getElementById(legendId);
  if (legendEl) {
    legendEl.innerHTML = categories.map(c => `
      <div class="mix-legend-row">
        <span class="mix-dot" style="background:${c.color}"></span>
        <span class="mix-legend-label">${esc(c.label)}</span>
        <span class="mix-legend-val">${c.value}</span>
      </div>`).join('');
  }
}

function renderModuleVisRow(cfg) {
  const total = moduleVisTotal(cfg.categories);
  renderModuleTrendChart(cfg.trendCanvasId, cfg.cacheKey, total);
  renderModuleAgingBars(cfg.agingContainerId, cfg.cacheKey, total);
  renderModuleMixDonut(cfg.mixCanvasId, cfg.mixLegendId, cfg.mixCenterId, cfg.categories);
}

const _scatterEl = document.getElementById('chart-scatter-risk');
if (_scatterEl) {
  const ctxScatter = _scatterEl.getContext('2d');

  new Chart(ctxScatter, {
    type: 'bubble', // 'bubble' is Chart.js's native 3D scatter chart
    data: {
      datasets: [

        {
          label: 'Audit Trail',
          data: [{ x: 5, y: 10, r: 8 }],
          backgroundColor: 'rgba(234, 179, 8, 0.7)',
          borderColor: '#eab308'
        },

        {
          label: 'Purchase',
          data: [{ x: 8, y: 14, r: 10 }],
          backgroundColor: 'rgba(139, 92, 246, 0.7)',
          borderColor: '#8b5cf6'
        },

      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            font: { size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.dataset.label || '';
              const raw = context.raw;
              return `${label}: ${raw.y} Errors, ${raw.x} Days Avg, Risk Impact Rating: ${raw.r}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Average Days Open (Aging)',
            font: { size: 12, weight: 'bold' },
            color: '#64748b'
          },
          grid: { color: '#f1f5f9' },
          min: 0,
          max: 35
        },
        y: {
          title: {
            display: true,
            text: 'Error Count',
            font: { size: 12, weight: 'bold' },
            color: '#64748b'
          },
          grid: { color: '#f1f5f9' },
          min: 0,
          max: 60
        }
      }
    }
  });
}