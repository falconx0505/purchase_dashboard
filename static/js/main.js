/* ═══════════════════════════════════════════════════════════════
   PURCHASE ICD — MAIN JS
   Navigation · Filters · Data · Tables · Charts · Observations
═══════════════════════════════════════════════════════════════ */

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
// Declared here (top of file, with the other constants) rather than
// down by updateGenieVisibility(), because that function gets called
// immediately below on page load — a `const` declared further down
// would still be in its temporal dead zone at that point and throw.
const GENIE_PAGES = ['home', 'hygiene', 'po-summary'];

document.body.classList.add('on-home');
updateGenieVisibility('home');

let F = { company: [], state: [], product: [], customer: [], month: [] };
let RAW = null;
let currentObsCategory = '';
// Cached monthly split for the Home "Monthly Error Trend" chart — declared
// up top (not down near the chart function) because renderHomeCharts() is
// invoked immediately below on page load, before the script has finished
// running top-to-bottom. A `let` declared further down would still be in
// its temporal dead zone at that point and throw a ReferenceError.
let HOME_MONTHLY_SPLIT = null;

const CHARTS = {};
function destroyChart(id) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
}

// ── Genie AI Assistant: floating button + chat popup ─────────
// Shown only on GENIE_PAGES (declared up top); goTo() calls
// updateGenieVisibility() on every navigation so this stays in sync
// without duplicating the button per page.
function updateGenieVisibility(pageId) {
  const fab = document.getElementById('genie-fab');
  const show = GENIE_PAGES.includes(pageId);
  if (fab) fab.classList.toggle('hidden', !show);
  if (!show) toggleGenieChat(false);
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
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  const tab = document.querySelector(`[data-page="${pageId}"]`);
  if (page) page.classList.add('active');
  if (tab) tab.classList.add('active');
  // 'it-controls', 'control-inventory', 'hr-payroll', 'loan-repayment' and 'audit-trail' are Home-only pages
  // (opened via the Home screen buttons, not the top-nav), so hide the
  // top-nav on all of them, same as Home.
  document.body.classList.toggle('on-home', pageId === 'home' || pageId === 'it-controls' || pageId === 'control-inventory' || pageId === 'hr-payroll' || pageId === 'loan-repayment' || pageId === 'audit-trail' || pageId === 'kyc' || pageId === 'other-loan');
  updateGenieVisibility(pageId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderCurrentPage(pageId);
}

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => goTo(btn.dataset.page));
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
        <button class="btn-reset" onclick="resetFilters()">↺ Reset Filters</button>
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

async function loadAuditTrailData() {
  try {
    const res = await fetch('/api/audit-trail', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Audit trail service returned ${res.status}`);
    const payload = await res.json();
    window.auditTrailData = payload;
    window.auditTrailFilters = {};
    renderAuditTrailPage();
  } catch (error) {
    console.error('Unable to load audit trail data:', error);
    const status = document.getElementById('audit-trail-upload-status');
    if (status) status.textContent = 'Unable to load audit trail data.';
  }
}

function renderAuditTrailPage() {
  // AUDIT TRAIL PAGE: render grouped tables and filter dropdowns from the backend payload.
  const payload = window.auditTrailData || { rows: [], filters: {}, summary: {} };
  const filtersHost = document.getElementById('audit-trail-filters');
  const summaryHost = document.getElementById('audit-trail-summary');
  const tablesHost = document.getElementById('audit-trail-tables');
  if (!filtersHost || !summaryHost || !tablesHost) return;

  const allRows = payload.rows || [];
  const filterState = window.auditTrailFilters || {};

  const ALL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const ALL_QUANTITIES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

  const years = payload.filters?.year?.length ? payload.filters.year : Array.from(new Set(allRows.map(r => r.Year).filter(Boolean))).sort();
  const quantities = ALL_QUANTITIES;
  const monthNames = ALL_MONTHS;
  const vendors = Array.from(new Set(allRows.map(r => r.VendorName).filter(Boolean))).sort();

  const filterFields = [
    { key: 'year', label: 'Year', values: years, rowKey: 'Year' },
    { key: 'quantity', label: 'Quantity', values: quantities, rowKey: 'Quantity' },
    { key: 'monthName', label: 'Month Name', values: monthNames, rowKey: 'MonthName' },
    { key: 'vendorName', label: 'Vendor Name', values: vendors, rowKey: 'VendorName' },
  ];

  filtersHost.innerHTML = filterFields.map(field => `
    <div>
      <label style="display:block;font-size:12px;margin-bottom:6px;color:var(--muted)">${esc(field.label)}</label>
      <select class="remark-input" style="width:100%" onchange="setAuditTrailFilter('${field.key}', this.value)">
        <option value="">All ${esc(field.label)}s</option>
        ${field.values.map(v => `<option value="${esc(v)}" ${filterState[field.key] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
      </select>
    </div>`).join('');

  const filteredRows = allRows.filter(row => {
    for (const field of filterFields) {
      const selected = filterState[field.key];
      if (selected && String(row[field.rowKey] || '') !== String(selected)) {
        return false;
      }
    }
    return true;
  });

  const activeFilterCount = Object.keys(filterState).length;
  summaryHost.innerHTML = `
    <div class="filter-strip">
      <span class="filter-strip-label">Summary:</span>
      <span class="fchip">Matching Rows: ${filteredRows.length} / ${allRows.length}</span>
      ${activeFilterCount > 0 ? `<span class="fchip" style="background:var(--peach)">Active Filters: ${activeFilterCount}</span>` : ''}
      <button class="btn ghost sm" onclick="resetAuditTrailFilters()">Clear filters</button>
    </div>`;

  // 1. Dynamic Vendor Summary Table
  const vendorGroups = {};
  filteredRows.forEach(row => {
    const vName = String(row.VendorName || '').trim();
    if (!vName) return;
    if (!vendorGroups[vName]) {
      vendorGroups[vName] = { vendorName: vName, banklCount: 0, financialServicesOutsourcingCount: 0, panNumberCount: 0, servicesCount: 0, grandTotal: 0 };
    }
    const fc = String(row.FieldChanged || '').toLowerCase().trim();
    if (fc === 'bankl') vendorGroups[vName].banklCount++;
    else if (fc === 'financial services outsourcing') vendorGroups[vName].financialServicesOutsourcingCount++;
    else if (fc === 'pan number') vendorGroups[vName].panNumberCount++;
    else if (fc === 'services') vendorGroups[vName].servicesCount++;
    vendorGroups[vName].grandTotal++;
  });

  const vendorRowsHtml = Object.keys(vendorGroups).sort().map(k => vendorGroups[k]).map(row => `
    <tr>
      <td style="font-weight:600">${esc(row.vendorName)}</td>
      <td>${esc(row.banklCount)}</td>
      <td>${esc(row.financialServicesOutsourcingCount)}</td>
      <td>${esc(row.panNumberCount)}</td>
      <td>${esc(row.servicesCount)}</td>
      <td style="font-weight:600">${esc(row.grandTotal)}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">No records match selected filters.</td></tr>';

  // 2. Dynamic Field Description Table (Replaces Field Risk Summary)
  const fieldDescGroups = {};
  filteredRows.forEach(row => {
    let desc = String(row.FieldDescription || '').trim();
    if (!desc || desc === 'Unspecified') {
      desc = String(row.FieldChanged || '').trim() || 'Unspecified';
    }
    if (!fieldDescGroups[desc]) {
      fieldDescGroups[desc] = { fieldDescription: desc, highRiskCount: 0, lowRiskCount: 0, grandTotal: 0 };
    }
    const r = String(row.Risk || '').toLowerCase().trim();
    if (r === 'high') {
      fieldDescGroups[desc].highRiskCount++;
    } else {
      fieldDescGroups[desc].lowRiskCount++;
    }
    fieldDescGroups[desc].grandTotal++;
  });

  const fieldDescRowsHtml = Object.keys(fieldDescGroups).sort().map(k => fieldDescGroups[k]).map(row => `
    <tr>
      <td style="font-weight:600">${esc(row.fieldDescription)}</td>
      <td><span class="tag ${row.highRiskCount > 0 ? 'flag' : 'ok'}">${esc(row.highRiskCount)}</span></td>
      <td>${esc(row.lowRiskCount)}</td>
      <td style="font-weight:600">${esc(row.grandTotal)}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">No records match selected filters.</td></tr>';

  // 3. Detailed Audit Log Table
  const detailRowsHtml = filteredRows.map(row => `
    <tr>
      <td>${esc(row.VendorNo || '—')}</td>
      <td><strong>${esc(row.VendorName || '—')}</strong></td>
      <td>${esc(row.FieldChanged || '—')}</td>
      <td>${esc(row.FieldDescription || '—')}</td>
      <td><span class="tag ${row.Indicator === 'Deleted' ? 'flag' : row.Indicator === 'Inserted' ? 'ok' : ''}">${esc(row.Indicator || '—')}</span></td>
      <td>${esc(row.OldValue || '—')}</td>
      <td>${esc(row.NewValue || '—')}</td>
      <td>${esc(row.ChangedBy || '—')}</td>
      <td><span class="tag ${String(row.Risk || '').toLowerCase() === 'high' ? 'flag' : 'ok'}">${esc(row.Risk || '—')}</span></td>
      <td>${esc(row.Year || '—')}</td>
      <td>${esc(row.Quantity || '—')}</td>
      <td>${esc(row.MonthName || '—')}</td>
    </tr>`).join('') || '<tr><td colspan="12" style="text-align:center;color:var(--muted)">No records match selected filters.</td></tr>';

  tablesHost.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-h"><div class="grow"><div class="ttl">Vendor Summary</div><div class="desc">Vendor-wise change counts (BANKL, Financial Services Outsourcing, PAN Number, Services) based on active filters</div></div></div>
      <div class="card-b no-pad"><div class="tbl-wrap-full"><table class="tbl">
        <thead><tr><th>Vendor</th><th>BANKL</th><th>Financial Services Outsourcing</th><th>PAN Number</th><th>Services</th><th>Grand Total</th></tr></thead>
        <tbody>${vendorRowsHtml}</tbody>
      </table></div></div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div class="card-h"><div class="grow"><div class="ttl">Field Description Summary</div><div class="desc">Summary breakdown by Field Description with High/Low risk breakdown based on active filters</div></div></div>
      <div class="card-b no-pad"><div class="tbl-wrap-full"><table class="tbl">
        <thead><tr><th>Field Description</th><th>High Risk</th><th>Low/Medium Risk</th><th>Grand Total</th></tr></thead>
        <tbody>${fieldDescRowsHtml}</tbody>
      </table></div></div>
    </div>
    <div class="card">
      <div class="card-h"><div class="grow"><div class="ttl">Detailed Audit Trail Log</div><div class="desc">Individual audit record details matching active filters </div></div></div>
      <div class="card-b no-pad"><div class="tbl-wrap-full"><table class="tbl" style="white-space:nowrap">
        <thead><tr><th>Vendor No</th><th>Vendor Name</th><th>Field Changed</th><th>Field Description</th><th>Indicator</th><th>Old Value</th><th>New Value</th><th>Changed By</th><th>Risk</th><th>Year</th><th>Qty</th><th>Month</th></tr></thead>
        <tbody>${detailRowsHtml}</tbody>
      </table></div></div>
    </div>`;
}

function titleCaseKey(key) {
  const map = { year: 'Year', quantity: 'Quantity', monthName: 'MonthName' };
  return map[key] || key;
}

function setAuditTrailFilter(key, value) {
  window.auditTrailFilters = window.auditTrailFilters || {};
  if (value) window.auditTrailFilters[key] = value; else delete window.auditTrailFilters[key];
  renderAuditTrailPage();
}

function resetAuditTrailFilters() {
  window.auditTrailFilters = {};
  renderAuditTrailPage();
}

function renderCurrentPage(pageId) {
  // IT CONTROLS MODULE, HR AND PAYROLL MODULE, and LOAN AND REPAYMENT
  // SCHEDULE MODULE are handled before the RAW-data guard below because
  // all three render from hardcoded local data (IT_TABLES / HR_TABLES /
  // LOAN_CALC_ROWS+LOAN_BANK_ROWS+LOAN_DIFF_ROWS) and don't need
  // RAW.purchase data to be loaded.
  if (pageId === 'it-controls') { renderItControls(); return; }
  if (pageId === 'control-inventory') { renderControlInventory(); return; }
  if (pageId === 'hr-payroll') { renderHrPayroll(); return; }
  // Loan and Repayment Schedule: routes to renderLoanRepayment(), added
  // alongside the two lines above for the same Home-only, no-RAW-needed reason.
  if (pageId === 'loan-repayment') { renderLoanRepayment(); return; }
  // KYC DETAILS: static hardcoded page, no rendering function needed —
  // markup lives directly in index.html (#page-kyc), same Home-only pattern.
  if (pageId === 'kyc') { renderKyc(); return; }
  // OTHER LOAN DETAILS: static hardcoded page, no rendering function needed —
  // markup lives directly in index.html (#page-other-loan), same Home-only pattern.
  if (pageId === 'other-loan') { renderLoan(); return; }
  // AUDIT TRAIL PAGE: this page uses its own backend endpoint and should render
  // even before the main purchase workbook has finished loading.
  if (pageId === 'audit-trail') { loadAuditTrailData(); return; }
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
    case 'audit-trail': (async () => { await loadAuditTrailData(); })(); break;
    case 'addition': break;
    case 'it-controls': renderItControls(); break; // unreachable (handled above), kept for safety
    case 'hr-payroll': renderHrPayroll(); break; // unreachable (handled above), kept for safety
    case 'observations': renderObsList(); break;
  }
}

// ─────────────────────────────────────────────────────────────
// IT CONTROLS MODULE
// Home-screen-only page (#page-it-controls). Uses hardcoded mock data
// (IT_EMPLOYEES / IT_TABLES) rather than RAW purchase data. Each card's
// "Observation" button opens the shared observation log filtered to
// that card's category (see openObservationModal / OBS_TITLES below).
// ─────────────────────────────────────────────────────────────
const IT_EMPLOYEES = ['Priya Sharma', 'Rohit Verma', 'Ananya Iyer', 'Karan Mehta', 'Sneha Reddy', 'Arjun Nair', 'Divya Pillai'];

// Each card gives a [min, max] range instead of a fixed list, so the
// metric values are generated randomly (and independently per card)
// every time the IT Controls page renders, instead of always showing
// the same hardcoded numbers.
const IT_TABLES = [
  {
    id: 'access_lwd', category: 'itc_access_lwd',
    title: 'Access After Last Working Day',
    desc: 'System access retained after employee exit',
    metricLabel: 'Days After Last Working Day',
    min: 1, max: 20,
    employees: ['Priya Sharma', 'Rohit Verma', 'Ananya Iyer', 'Karan Mehta', 'Sneha Reddy', 'Arjun Nair', 'Divya Pillai']
  },
  {
    id: 'inactive_90', category: 'itc_inactive_90',
    title: 'Users Not Logged In for 90+ Days',
    desc: 'Dormant accounts still active in the system',
    metricLabel: 'Days Not Logged In',
    min: 91, max: 400,
    employees: ['Vikram Singh', 'Neha Kulkarni', 'Aditya Rao', 'Ishita Desai', 'Manish Gupta', 'Pooja Joshi', 'Siddharth Kapoor']
  },
  {
    id: 'pwd_stale', category: 'itc_pwd_stale',
    title: 'Password Not Changed',
    desc: 'Accounts exceeding password rotation policy',
    metricLabel: 'Days Since Password Changed',
    min: 91, max: 250,
    employees: ['Ravi Kumar', 'Meera Nair', 'Sanjay Patil', 'Kavya Menon', 'Nikhil Chandra', 'Anjali Rao', 'Deepak Bhatt']
  },
  {
    id: 'after_hours', category: 'itc_after_hours',
    title: 'Login Outside Business Hours',
    desc: 'Sign-ins recorded outside approved working hours',
    metricLabel: 'Logins After Office Hours',
    min: 1, max: 15,
    employees: ['Tanvi Shah', 'Aakash Bose', 'Ritika Malhotra', 'Varun Sethi', 'Shreya Agarwal', 'Harsh Vardhan', 'Nisha Kohli']
  },
  {
    id: 'failed_login', category: 'itc_failed_login',
    title: 'Multiple Failed Login Attempts',
    desc: 'Repeated unsuccessful sign-in attempts',
    metricLabel: 'Failed Login Attempts',
    min: 5, max: 45,
    employees: ['Gaurav Khanna', 'Swati Deshmukh', 'Yash Thakur', 'Preeti Saxena', 'Manoj Tiwari', 'Radhika Iyengar', 'Aman Chopra']
  },
  {
    id: 'above_limit', category: 'itc_above_limit',
    title: 'Approved Above Authorized Limit',
    desc: 'Transactions approved beyond the approver\u2019s authority',
    metricLabel: 'Transactions Above Limit',
    min: 3, max: 35,
    employees: ['Ramesh Iyer', 'Sunita Bhatia', 'Kunal Oberoi', 'Lavanya Pillai', 'Rahul Dutta', 'Simran Bakshi', 'Ajay Mathur']
  }
];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function itControlCardHtml(t) {
  const rowsHtml = t.employees.map((name, i) => {
    const issueId = `itc-${t.id}-${name.toLowerCase().replace(/\s+/g, '-')}`;
    const r = {
      ISSUE_ID: issueId,
      CATEGORY: t.category,
      ENTITY_KEY: name,
      REMARK: getSavedRemark(issueId)
    };
    const value = randInt(t.min, t.max);
    return `<tr><td>${esc(name)}</td><td class="r">${value}</td>${renderRemarkCell(r)}</tr>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-h">
        <div class="grow"><div class="ttl">${esc(t.title)}</div><div class="desc">${esc(t.desc)}</div></div>
        <button class="obs-card-btn" type="button" onclick="openObservationModal('${t.category}')">Observation</button>
      </div>
      <div class="card-b no-pad"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Employee Name</th><th class="r">${esc(t.metricLabel)}</th><th>Remark</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div></div>
    </div>`;
}

function renderItControls() {
  const row1 = document.getElementById('itc-row-1');
  const row2 = document.getElementById('itc-row-2');
  if (!row1 || !row2) return;
  row1.innerHTML = IT_TABLES.slice(0, 3).map(itControlCardHtml).join('');
  row2.innerHTML = IT_TABLES.slice(3, 6).map(itControlCardHtml).join('');
}

const CONTROL_INVENTORY = [
  {
    control: 'IT controls', subcontrols: [
      'access after last working day',
      'user not logged in for 90+ days',
      'password not changed',
      'login outside business hours',
      'multiple failed login attempts',
      'approved above authorized limit'
    ]
  },
  {
    control: 'hr and payroll', subcontrols: [
      'multiple employees using same bank account',
      'duplicate pan/aadhaar/bank account',
      'employees without PAN/Aadhaar bank account',
      'missing department/location/grade',
      'same PAN for multiple employees'
    ]
  },
  { control: 'Audit trail', subcontrols: [] },
  {
    control: 'Loan and repayment schedule', subcontrols: [
      'as per calculation, as per bank, as per difference'
    ]
  },
  {
    control: 'Purchase control dashboard', subcontrols: [
      'Multiple tax code',
      'same product multiple gst rate',
      'duplicate customer name',
      'product name check',
      'product code check'
    ]
  }
];

const CONTROL_INVENTORY_REGIONS = ['Bangalore', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad'];
const CONTROL_INVENTORY_EMAILS = [
  'aarav.shah@example.com', 'ananya.iyer@example.com', 'arjun.nair@example.com',
  'divya.pillai@example.com', 'karan.mehta@example.com', 'priya.sharma@example.com',
  'rohit.verma@example.com', 'sneha.reddy@example.com', 'vikram.singh@example.com'
];

function controlInventoryDetails(index) {
  const end = new Date(2026, randInt(6, 11), randInt(1, 28));
  const start = new Date(end);
  start.setMonth(start.getMonth() - (randInt(0, 1) ? 3 : 6));
  const formatDate = date => date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const emails = [...CONTROL_INVENTORY_EMAILS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .join(', ');
  return {
    start: formatDate(start),
    end: formatDate(end),
    region: CONTROL_INVENTORY_REGIONS[index % CONTROL_INVENTORY_REGIONS.length],
    emails
  };
}

function renderControlInventory() {
  const body = document.getElementById('control-inventory-body');
  if (!body) return;
  let index = 0;
  body.innerHTML = CONTROL_INVENTORY.map(group => {
    if (!group.subcontrols.length) {
      return `<tr><td>${esc(group.control)}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    }
    const rows = group.subcontrols.map((subcontrol, subcontrolIndex) => {
      const details = controlInventoryDetails(index++);
      const controlCell = subcontrolIndex === 0
        ? `<td rowspan="${group.subcontrols.length}">${esc(group.control)}</td>`
        : '';
      return `<tr>${controlCell}<td>${esc(subcontrol)}</td><td>${esc(details.start)}</td><td>${esc(details.end)}</td><td>${esc(details.region)}</td><td>${esc(details.emails)}</td><td></td><td></td></tr>`;
    });
    return rows.join('');
  }).join('');
}
// ─────────────────────────────────────────────────────────────
// END IT CONTROLS MODULE
// ─────────────────────────────────────────────────────────────

// ═════════════════════════════════════════════════════════════
// HR AND PAYROLL MODULE (new)
// Home-screen-only page (#page-hr-payroll), mirrors the IT Controls
// pattern above: hardcoded mock data (HR_EMPLOYEES / HR_TABLES), one
// card per check with its own "Observation" button + editable Remark
// column per row (renderRemarkCell / handleRemarkAction, shared with
// Data Hygiene and IT Controls). Data/columns for each of the 6 cards
// are generalized via HR_TABLES[i].cols instead of a single fixed
// metric column, since HR checks have different column shapes.
// ═════════════════════════════════════════════════════════════
const HR_EMPLOYEES = ['Priya Sharma', 'Rohit Verma', 'Ananya Iyer', 'Karan Mehta', 'Sneha Reddy', 'Arjun Nair', 'Divya Pillai'];

// Table titles below are kept exactly as shown in the reference layout:
// "Multiple employees using same bank account", "Duplicate PAN/Aadhaar/
// Bank Account", "Employees without PAN/ Aadhaar Bank Account", "Missing
// Department/Location/Grade", "Same PAN for multiple employees" (plus the
// two pre-existing cards not shown in that layout, left as they were).
//
// mode: 'rows'     → table is fully described by cols/rows as-is, one
//                     row per record (used where a single row already
//                     lists multiple employee names together, e.g. the
//                     bank-account / PAN duplicate tables).
// mode: 'employee' → one row per HR_EMPLOYEES entry (default; unchanged
//                     pattern from before), with an optional nameLabel
//                     to relabel the employee-name column.
const HR_TABLES = [
  {
    id: 'dup_bank', category: 'hr_dup_bank', mode: 'rows',
    title: 'Multiple employees using same bank account',
    desc: 'Same bank account number mapped to more than one employee',
    cols: [{ label: 'Bank account number', key: 'acct' }, { label: 'Employee Name', key: 'names' }],
    rows: [
      { acct: '50100234567891', names: 'Priya Sharma, Rohit Verma' },
      { acct: '50100987654321', names: 'Ananya Iyer, Karan Mehta, Sneha Reddy' },
      { acct: '50100456789012', names: 'Arjun Nair, Divya Pillai' },
      { acct: '50100112233445', names: 'Priya Sharma, Ananya Iyer' },
      { acct: '50100556677889', names: 'Rohit Verma, Karan Mehta' },
      { acct: '50100998877665', names: 'Sneha Reddy, Divya Pillai' },
      { acct: '50100223344556', names: 'Arjun Nair, Priya Sharma' },
    ]
  },
  {
    id: 'dup_pan_aadhaar', category: 'hr_dup_pan_aadhaar', mode: 'rows',
    title: 'Duplicate PAN/Aadhaar/Bank Account',
    desc: 'Same statutory ID or bank account number recorded against more than one employee',
    cols: [{ label: 'Particulars', key: 'particulars' }, { label: 'Employee Name', key: 'names' }],
    rows: [
      { particulars: 'PAN', names: 'Priya Sharma, Rohit Verma' },
      { particulars: 'Aadhaar', names: 'Ananya Iyer, Karan Mehta' },
      { particulars: 'Bank Account', names: 'Sneha Reddy, Arjun Nair' },
      { particulars: 'PAN', names: 'Divya Pillai, Priya Sharma' },
      { particulars: 'PAN', names: 'Rohit Verma, Sneha Reddy' },
      { particulars: 'PAN', names: 'Karan Mehta, Ananya Iyer' },
      { particulars: 'PAN', names: 'Arjun Nair, Divya Pillai' },
    ]
  },
  {
    id: 'missing_ids', category: 'hr_missing_ids', mode: 'employee', nameLabel: 'Name of Employee',
    title: 'Employees without PAN/ Aadhaar Bank Account',
    desc: 'Statutory or payment details missing from employee master',
    cols: [{ label: 'Missing Detail', key: 'missing' }],
    rows: [
      { missing: 'Bank Account' },
      { missing: 'PAN' },
      { missing: 'Aadhaar' },
      { missing: 'Bank Account' },
      { missing: 'PAN' },
      { missing: 'Aadhaar' },
      { missing: 'Bank Account' },
    ]
  },
  {
    id: 'missing_master', category: 'hr_missing_master', mode: 'employee', nameLabel: 'Name of Employee',
    title: 'Missing Department/Location/Grade',
    desc: 'Core master fields left blank in the employee record',
    cols: [{ label: 'Missing Detail', key: 'missing' }],
    rows: [
      { missing: 'Department Missing' },
      { missing: 'Location Missing' },
      { missing: 'Grade Missing' },
      { missing: 'Department Missing' },
      { missing: 'Location Missing' },
      { missing: 'Grade Missing' },
      { missing: 'Department Missing' },
    ]
  },
  {
    id: 'same_pan', category: 'hr_same_pan', mode: 'rows',
    title: 'Same PAN for multiple employees',
    desc: 'Same PAN number recorded against more than one employee',
    cols: [{ label: 'Pan Number', key: 'pan' }, { label: 'Employee Name', key: 'names' }],
    rows: [
      { pan: 'ABCPS1234M', names: 'Priya Sharma, Rohit Verma' },
      { pan: 'BXTRV5678K', names: 'Ananya Iyer, Karan Mehta' },
      { pan: 'CMNPK9081L', names: 'Sneha Reddy, Arjun Nair' },
      { pan: 'DPQRX3345F', names: 'Divya Pillai, Priya Sharma' },
      { pan: 'EFGHT7729Q', names: 'Rohit Verma, Sneha Reddy' },
      { pan: 'FGHIJ1122W', names: 'Karan Mehta, Ananya Iyer' },
      { pan: 'GHTYU5566E', names: 'Arjun Nair, Divya Pillai' },
    ]
  }
];

function hrControlCardHtml(t) {
  const headBtn = `<button class="obs-card-btn" type="button" onclick="openObservationModal('${t.category}')">Observation</button>`;
  const cardHead = `
      <div class="card-h">
        <div class="grow"><div class="ttl">${esc(t.title)}</div><div class="desc">${esc(t.desc)}</div></div>
        ${headBtn}
      </div>`;

  if (t.mode === 'rows') {
    const rowsHtml = t.rows.map((data, i) => {
      const issueId = `hr-${t.id}-${i}`;
      const r = {
        ISSUE_ID: issueId,
        CATEGORY: t.category,
        ENTITY_KEY: data.names || data.acct || data.pan || `row-${i}`,
        REMARK: getSavedRemark(issueId)
      };
      const dataCells = t.cols.map(c => `<td${c.r ? ' class="r"' : ''}>${esc(data[c.key] != null ? data[c.key] : '')}</td>`).join('');
      return `<tr>${dataCells}${renderRemarkCell(r)}</tr>`;
    }).join('');
    const headCells = t.cols.map(c => `<th${c.r ? ' class="r"' : ''}>${esc(c.label)}</th>`).join('');

    return `
    <div class="card">${cardHead}
      <div class="card-b no-pad"><div class="tbl-wrap"><table class="tbl">
        <thead><tr>${headCells}<th>Remark</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div></div>
    </div>`;
  }

  const nameLabel = t.nameLabel || 'Employee Name';
  const rowsHtml = HR_EMPLOYEES.map((name, i) => {
    const data = t.rows[i] || {};
    const issueId = `hr-${t.id}-${name.toLowerCase().replace(/\s+/g, '-')}`;
    const r = {
      ISSUE_ID: issueId,
      CATEGORY: t.category,
      ENTITY_KEY: name,
      REMARK: getSavedRemark(issueId)
    };
    const dataCells = t.cols.map(c => `<td${c.r ? ' class="r"' : ''}>${esc(data[c.key] != null ? data[c.key] : '')}</td>`).join('');
    return `<tr><td>${esc(name)}</td>${dataCells}${renderRemarkCell(r)}</tr>`;
  }).join('');

  const headCells = t.cols.map(c => `<th${c.r ? ' class="r"' : ''}>${esc(c.label)}</th>`).join('');

  return `
    <div class="card">${cardHead}
      <div class="card-b no-pad"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>${esc(nameLabel)}</th>${headCells}<th>Remark</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div></div>
    </div>`;
}

function renderHrPayroll() {
  const row1 = document.getElementById('hr-row-1');
  const row2 = document.getElementById('hr-row-2');
  if (!row1 || !row2) return;
  row1.innerHTML = HR_TABLES.slice(0, 3).map(hrControlCardHtml).join('');
  row2.innerHTML = HR_TABLES.slice(3, 5).map(hrControlCardHtml).join('');
}
// ═════════════════════════════════════════════════════════════
// END HR AND PAYROLL MODULE
// ═════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════
// LOAN AND REPAYMENT SCHEDULE MODULE
// Reached only from the Home screen "Loan and Repayment Schedule"
// button (no top-nav tab). No filters, no Observation button — a
// plain read-only, three-table comparison of the repayment schedule
// exactly as it appears in the source workbook's "Loan part" sheet:
// As per Calculation, As per Bank, and the Difference between them.
// Row order/columns/values are copied as-is; any empty Difference
// cell is shown as 0 rather than left blank.
// ═════════════════════════════════════════════════════════════

// Loan Type / Location per borrower — not present in the source workbook,
// so these are placeholder tags for the filter bar until real values are
// supplied. Update this map when the actual loan type/location per
// borrower is available; it does not affect any figures in the tables.
const LOAN_META = {
  'Ram': { type: 'Home Loan', location: 'Bangalore' },
  'Shyam': { type: 'Vehicle Loan', location: 'Mumbai' },
  'Pranjali': { type: 'Personal Loan', location: 'Delhi' },
};
const LOAN_TYPE_OPTIONS = ['Home Loan', 'Vehicle Loan', 'Personal Loan', 'Business Loan', 'Education Loan'];
const LOAN_LOCATION_OPTIONS = ['Bangalore', 'Mumbai', 'Delhi', 'Chennai', 'Pune'];

function loanFilterOptionsInit() {
  const typeSel = document.getElementById('loan-filter-type');
  const locSel = document.getElementById('loan-filter-location');
  if (typeSel && typeSel.options.length <= 1) {
    LOAN_TYPE_OPTIONS.forEach(t => typeSel.insertAdjacentHTML('beforeend', `<option value="${esc(t)}">${esc(t)}</option>`));
  }
  if (locSel && locSel.options.length <= 1) {
    LOAN_LOCATION_OPTIONS.forEach(l => locSel.insertAdjacentHTML('beforeend', `<option value="${esc(l)}">${esc(l)}</option>`));
  }
}

// Each row: [Person Name, Month, Opening Balance, Interest, Principal, EMI, Closing Balance, Interest Rate, Other Charge]
const LOAN_CALC_ROWS = [
  ["Ram", 1, 2000000, 21667, 73417, 95084, 1926583, 0.13, null],
  ["Ram", 2, 1926583, 20871, 74213, 95084, 1852370, 0.13, null],
  ["Ram", 3, 1852370, 20109, 74975, 95084, 1777395, 0.13, null],
  ["Ram", 4, 1777395, 19306, 75778, 95084, 1701617, 0.13, null],
  ["Ram", 5, 1701617, 18434, 76650, 95084, 1624967, 0.13, null],
  ["Ram", 6, 1624967, 17604, 77480, 95084, 1547487, 0.13, null],
  ["Ram", 7, 1547487, 16765, 78319, 95084, 1469168, 0.13, null],
  ["Ram", 8, 1469168, 15916, 79168, 95084, 1390000, 0.13, null],
  ["Ram", 9, 1390000, 15058, 80026, 95084, 1309974, 0.13, null],
  ["Ram", 10, 1309974, 14192, 80892, 95084, 1229082, 0.13, null],
  ["Ram", 11, 1229082, 13315, 81769, 95084, 1147313, 0.13, null],
  ["Ram", 12, 1147313, 12430, 82654, 95084, 1064659, 0.13, null],
  ["Ram", 13, 1064659, 11533, 83551, 95084, 981108, 0.13, null],
  ["Ram", 14, 981108, 10629, 84455, 95084, 896653, 0.13, 400],
  ["Ram", 15, 896653, 9714, 85370, 95084, 811283, 0.13, null],
  ["Ram", 16, 811283, 8789, 86295, 95084, 724988, 0.13, null],
  ["Ram", 17, 724988, 7854, 87230, 95084, 637758, 0.13, null],
  ["Ram", 18, 637758, 6909, 88175, 95084, 549583, 0.13, null],
  ["Ram", 19, 549583, 5954, 89130, 95084, 460453, 0.13, null],
  ["Ram", 20, 460453, 4988, 90096, 95084, 370357, 0.13, null],
  ["Ram", 21, 370357, 4020, 91064, 95084, 279293, 0.13, null],
  ["Ram", 22, 279293, 3026, 92058, 95084, 187235, 0.13, null],
  ["Ram", 23, 187235, 2029, 93055, 95084, 94180, 0.13, null],
  ["Ram", 24, 94180, 1020, 94064, 95084, 0, 0.13, null],
  ["Shyam", 1, 5500000, 32083, 76823, 108907, 5423177, 0.07, null],
  ["Shyam", 2, 5423177, 31635, 77271, 108907, 5345905, 0.07, null],
  ["Shyam", 3, 5345905, 31184, 77722, 108907, 5268183, 0.07, null],
  ["Shyam", 4, 5268183, 30731, 78176, 108907, 5190008, 0.07, null],
  ["Shyam", 5, 5190008, 30275, 78632, 108907, 5111376, 0.07, null],
  ["Shyam", 6, 5111376, 29816, 79090, 108907, 5032286, 0.07, null],
  ["Shyam", 7, 5032286, 29355, 79552, 108907, 4952734, 0.07, null],
  ["Shyam", 8, 4952734, 28891, 80016, 108907, 4872719, 0.07, null],
  ["Shyam", 9, 4872719, 28424, 80482, 108907, 4792236, 0.07, null],
  ["Shyam", 10, 4792236, 27955, 80952, 108907, 4711284, 0.07, null],
  ["Shyam", 11, 4711284, 27482, 81424, 108907, 4629860, 0.07, null],
  ["Shyam", 12, 4629860, 27008, 81899, 108907, 4547961, 0.07, null],
  ["Shyam", 13, 4547961, 26530, 82377, 108907, 4465584, 0.07, null],
  ["Shyam", 14, 4465584, 26049, 82857, 108907, 4382727, 0.07, null],
  ["Shyam", 15, 4382727, 25566, 83341, 108907, 4299386, 0.07, null],
  ["Shyam", 16, 4299386, 25080, 83827, 108907, 4215560, 0.07, null],
  ["Shyam", 17, 4215560, 24591, 84316, 108907, 4131244, 0.07, null],
  ["Shyam", 18, 4131244, 24099, 84808, 108907, 4046436, 0.07, null],
  ["Shyam", 19, 4046436, 23604, 85302, 108907, 3961134, 0.07, null],
  ["Shyam", 20, 3961134, 23107, 85800, 108907, 3875334, 0.07, null],
  ["Shyam", 21, 3875334, 22606, 86300, 108907, 3789033, 0.07, null],
  ["Shyam", 22, 3789033, 22103, 86804, 108907, 3702229, 0.07, null],
  ["Shyam", 23, 3702229, 21596, 87310, 108907, 3614919, 0.07, null],
  ["Shyam", 24, 3614919, 21087, 87820, 108907, 3527099, 0.07, null],
  ["Shyam", 25, 3527099, 20575, 88332, 108907, 3438768, 0.07, null],
  ["Shyam", 26, 3438768, 20059, 88847, 108907, 3349921, 0.07, null],
  ["Shyam", 27, 3349921, 19541, 89365, 108907, 3260555, 0.07, null],
  ["Shyam", 28, 3260555, 19020, 89887, 108907, 3170668, 0.07, null],
  ["Shyam", 29, 3170668, 18496, 90411, 108907, 3080257, 0.07, null],
  ["Shyam", 30, 3080257, 17968, 90938, 108907, 2989319, 0.07, null],
  ["Shyam", 31, 2989319, 17438, 91469, 108907, 2897850, 0.07, null],
  ["Shyam", 32, 2897850, 16904, 92002, 108907, 2805848, 0.07, null],
  ["Shyam", 33, 2805848, 16367, 92539, 108907, 2713308, 0.07, null],
  ["Shyam", 34, 2713308, 15828, 93079, 108907, 2620230, 0.07, null],
  ["Shyam", 35, 2620230, 15285, 93622, 108907, 2526608, 0.07, null],
  ["Shyam", 36, 2526608, 14739, 94168, 108907, 2432440, 0.07, null],
  ["Shyam", 37, 2432440, 14189, 94717, 108907, 2337722, 0.07, null],
  ["Shyam", 38, 2337722, 13637, 95270, 108907, 2242452, 0.07, null],
  ["Shyam", 39, 2242452, 13081, 95826, 108907, 2146627, 0.07, null],
  ["Shyam", 40, 2146627, 12522, 96385, 108907, 2050242, 0.07, null],
  ["Shyam", 41, 2050242, 11960, 96947, 108907, 1953295, 0.07, null],
  ["Shyam", 42, 1953295, 11394, 97512, 108907, 1855783, 0.07, null],
  ["Shyam", 43, 1855783, 10825, 98081, 108907, 1757702, 0.07, null],
  ["Shyam", 44, 1757702, 10253, 98653, 108907, 1659048, 0.07, null],
  ["Shyam", 45, 1659048, 9678, 99229, 108907, 1559820, 0.07, null],
  ["Shyam", 46, 1559820, 9099, 99808, 108907, 1460012, 0.07, null],
  ["Shyam", 47, 1460012, 8517, 100390, 108907, 1359622, 0.07, null],
  ["Shyam", 48, 1359622, 7931, 100975, 108907, 1258647, 0.07, null],
  ["Shyam", 49, 1258647, 7342, 101564, 108907, 1157082, 0.07, null],
  ["Shyam", 50, 1157082, 6750, 102157, 108907, 1054925, 0.07, null],
  ["Shyam", 51, 1054925, 6154, 102753, 108907, 952172, 0.07, null],
  ["Shyam", 52, 952172, 5554, 103352, 108907, 848820, 0.07, null],
  ["Shyam", 53, 848820, 4951, 103955, 108907, 744865, 0.07, null],
  ["Shyam", 54, 744865, 4345, 104562, 108907, 640303, 0.07, null],
  ["Shyam", 55, 640303, 3735, 105171, 108907, 535132, 0.07, null],
  ["Shyam", 56, 535132, 3122, 105785, 108907, 4, 0.07, null],
  ["Pranjali", 1, 500000, 2917, 48701, 51618, 451299, 0.07, null],
  ["Pranjali", 2, 451299, 2633, 48986, 51618, 402313, 0.07, null],
  ["Pranjali", 3, 402313, 2347, 49271, 51618, 353042, 0.07, null],
  ["Pranjali", 4, 353042, 2059, 49559, 51618, 303483, 0.07, null],
  ["Pranjali", 5, 303483, 1770, 49848, 51618, 253635, 0.07, null],
  ["Pranjali", 6, 253635, 2536, 49723, 52259, 203912, 0.12, null],
  ["Pranjali", 7, 203912, 2039, 50220, 52259, 153693, 0.12, null],
  ["Pranjali", 8, 153693, 1537, 50722, 52259, 102971, 0.12, null],
  ["Pranjali", 9, 102971, 1030, 51229, 52259, 51741, 0.12, null],
  ["Pranjali", 10, 51741, 517, 51741, 52259, 0, 0.12, null],
];

// Each row: [Person Name, Month, Opening Balance, Interest, Principal, EMI, Closing Balance, Interest Rate]
const LOAN_BANK_ROWS = [
  ["Ram", 1, 2000000, 21667, 73417, 95084, 1926583, 0.13],
  ["Ram", 2, 1926583, 20871, 74213, 95084, 1852370, 0.13],
  ["Ram", 3, 1852370, 20109, 74975, 95084, 1777395, 0.13],
  ["Ram", 4, 1777395, 19306, 75778, 95084, 1701617, 0.13],
  ["Ram", 5, 1701617, 18434, 76650, 95084, 1624967, 0.13],
  ["Ram", 6, 1624967, 17604, 77480, 95084, 1547487, 0.13],
  ["Ram", 7, 1547487, 16765, 78319, 95084, 1469168, 0.13],
  ["Ram", 8, 1469168, 15916, 79168, 95084, 1390000, 0.13],
  ["Ram", 9, 1390000, 15058, 80026, 95084, 1309974, 0.13],
  ["Ram", 10, 1309974, 14192, 80892, 95084, 1229082, 0.13],
  ["Ram", 11, 1229082, 13315, 81769, 95084, 1147313, 0.13],
  ["Ram", 12, 1147313, 12430, 82654, 95084, 1064659, 0.13],
  ["Ram", 13, 1064659, 11533, 83551, 95084, 981108, 0.13],
  ["Ram", 14, 981108, 10629, 84455, 95084, 896653, 0.14],
  ["Ram", 15, 896653, 10000, 85370, 95084, 811283, 0.13],
  ["Ram", 16, 811283, 8789, 86295, 95084, 724988, 0.13],
  ["Ram", 17, 724988, 7854, 87230, 95084, 637758, 0.13],
  ["Ram", 18, 637758, 6909, 88175, 95084, 549583, 0.13],
  ["Ram", 19, 549583, 5954, 89130, 95084, 460453, 0.13],
  ["Ram", 20, 460453, 4988, 90096, 95084, 370357, 0.13],
  ["Ram", 21, 370357, 4020, 91064, 95084, 279293, 0.13],
  ["Ram", 22, 279293, 3026, 92058, 95084, 187235, 0.13],
  ["Ram", 23, 187235, 2029, 93055, 95084, 94180, 0.13],
  ["Ram", 24, 94180, 1020, 94064, 95084, 0, 0.13],
  ["Shyam", 1, 5500000, 32083, 76823, 108907, 5423177, 0.07],
  ["Shyam", 2, 5423177, 31635, 77271, 108907, 5345905, 0.07],
  ["Shyam", 3, 5345905, 31184, 77722, 108907, 5268183, 0.07],
  ["Shyam", 4, 5268183, 30731, 78176, 108907, 5190008, 0.07],
  ["Shyam", 5, 5190008, 30275, 78632, 108907, 5111376, 0.07],
  ["Shyam", 6, 5111376, 29816, 79090, 108907, 5032286, 0.07],
  ["Shyam", 7, 5032286, 29355, 79552, 108907, 4952734, 0.07],
  ["Shyam", 8, 4952734, 28891, 80016, 108907, 4872719, 0.07],
  ["Shyam", 9, 4872719, 28424, 80482, 108907, 4792236, 0.07],
  ["Shyam", 10, 4792236, 27955, 80952, 108907, 4711284, 0.07],
  ["Shyam", 11, 4711284, 27482, 81424, 108907, 4629860, 0.07],
  ["Shyam", 12, 4629860, 27008, 81899, 108907, 4547961, 0.07],
  ["Shyam", 13, 4547961, 26530, 82377, 108907, 4465584, 0.07],
  ["Shyam", 14, 4465584, 26049, 82857, 108907, 4382727, 0.07],
  ["Shyam", 15, 4382727, 25566, 83341, 108907, 4299386, 0.07],
  ["Shyam", 16, 4299386, 25080, 83827, 108907, 4215560, 0.07],
  ["Shyam", 17, 4215560, 24591, 84316, 108907, 4131244, 0.07],
  ["Shyam", 18, 4131244, 24099, 84808, 108907, 4046436, 0.07],
  ["Shyam", 19, 4046436, 23604, 85302, 108907, 3961134, 0.07],
  ["Shyam", 20, 3961134, 23107, 85800, 108907, 3875334, 0.07],
  ["Shyam", 21, 3875334, 22606, 86300, 108907, 3789033, 0.07],
  ["Shyam", 22, 3789033, 22103, 86804, 108907, 3702229, 0.07],
  ["Shyam", 23, 3702229, 21596, 87310, 108907, 3614919, 0.07],
  ["Shyam", 24, 3614919, 21087, 87820, 108907, 3527099, 0.07],
  ["Shyam", 25, 3527099, 20575, 88332, 108907, 3438768, 0.07],
  ["Shyam", 26, 3438768, 20059, 88847, 108907, 3349921, 0.07],
  ["Shyam", 27, 3349921, 19541, 89365, 108907, 3260555, 0.07],
  ["Shyam", 28, 3260555, 19020, 89887, 108907, 3170668, 0.07],
  ["Shyam", 29, 3170668, 18496, 90411, 108907, 3080257, 0.07],
  ["Shyam", 30, 3080257, 17968, 90938, 108907, 2989319, 0.07],
  ["Shyam", 31, 2989319, 17438, 91469, 108907, 2897850, 0.07],
  ["Shyam", 32, 2897850, 16904, 92002, 108907, 2805848, 0.07],
  ["Shyam", 33, 2805848, 16367, 92539, 108907, 2713308, 0.07],
  ["Shyam", 34, 2713308, 15828, 93079, 108907, 2620230, 0.07],
  ["Shyam", 35, 2620230, 15285, 93622, 108907, 2526608, 0.07],
  ["Shyam", 36, 2526608, 14739, 94168, 108907, 2432440, 0.07],
  ["Shyam", 37, 2432440, 14189, 94717, 108907, 2337722, 0.07],
  ["Shyam", 38, 2337722, 13637, 95270, 108907, 2242452, 0.07],
  ["Shyam", 39, 2242452, 13081, 95826, 108907, 2146627, 0.07],
  ["Shyam", 40, 2146627, 12522, 96385, 108907, 2050242, 0.07],
  ["Shyam", 41, 2050242, 11960, 96947, 108907, 1953295, 0.07],
  ["Shyam", 42, 1953295, 11394, 97512, 108907, 1855783, 0.07],
  ["Shyam", 43, 1855783, 10825, 98081, 108907, 1757702, 0.07],
  ["Shyam", 44, 1757702, 10253, 98653, 108907, 1659048, 0.07],
  ["Shyam", 45, 1659048, 9678, 99229, 108907, 1559820, 0.07],
  ["Shyam", 46, 1559820, 9099, 99808, 108907, 1460012, 0.07],
  ["Shyam", 47, 1460012, 8517, 100390, 108907, 1359622, 0.07],
  ["Shyam", 48, 1359622, 7931, 100975, 108907, 1258647, 0.07],
  ["Shyam", 49, 1258647, 7342, 101564, 108907, 1157082, 0.07],
  ["Shyam", 50, 1157082, 6750, 102157, 108907, 1054925, 0.07],
  ["Shyam", 51, 1054925, 6154, 102753, 108907, 952172, 0.07],
  ["Shyam", 52, 952172, 5554, 103352, 108907, 848820, 0.07],
  ["Shyam", 53, 848820, 4951, 103955, 108907, 744865, 0.07],
  ["Shyam", 54, 744865, 4345, 104562, 108907, 640303, 0.07],
  ["Shyam", 55, 640303, 3735, 105171, 108907, 535132, 0.07],
  ["Shyam", 56, 535132, 3122, 105785, 108907, 4, 0.07],
  ["Pranjali", 1, 500000, 2917, 48701, 51618, 451299, 0.07],
  ["Pranjali", 2, 451299, 2633, 48986, 51618, 402313, 0.07],
  ["Pranjali", 3, 402313, 2347, 49271, 51618, 353042, 0.07],
  ["Pranjali", 4, 353042, 2059, 49559, 51618, 303483, 0.07],
  ["Pranjali", 5, 303483, 1770, 49848, 51618, 253635, 0.07],
  ["Pranjali", 6, 253635, 3000, 49723, 52259, 203912, 0.12],
  ["Pranjali", 7, 203912, 2039, 50220, 52259, 153693, 0.12],
  ["Pranjali", 8, 153693, 1537, 50722, 52259, 102971, 0.12],
  ["Pranjali", 9, 102971, 1030, 51229, 52259, 51741, 0.12],
  ["Pranjali", 10, 51741, 517, 51741, 52259, 0, 0.12],
];

// Each row: [Opening Balance, Interest, Principal, EMI, Closing Balance, Interest Rate] — aligned to the same
// row index as LOAN_CALC_ROWS / LOAN_BANK_ROWS above. Empty cells are rendered as 0.
const LOAN_DIFF_ROWS = [
  [0, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, 0.01],
  [null, 286, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, 464, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
  [null, null, null, null, null, null],
];

const KYC_TABLES = [
  {
    "title": "PAN & Aadhaar not matching",
    "desc": "Customers whose PAN and Aadhar records don't match",
    "headers": [
      "Customer",
      "Not Matching KYC"
    ],
    "rows": [
      [
        "Rohan Deshmukh",
        "PAN vs Aadhar name mismatch"
      ],
      [
        "Sneha Patil",
        "Aadhar DOB mismatch"
      ],
      [
        "Shanaya Shaikh",
        "PAN vs Aadhar name mismatch"
      ],
      [
        "Kavita Joshi",
        "Aadhar address mismatch"
      ],
      [
        "Veer Nair",
        "PAN number invalid format"
      ],
      [
        "Ayesha Khan",
        "Aadhar photo mismatch"
      ]
    ],
    "id": "kyc_pan_aadhaar_not_matching"
  },
  {
    "title": "Last KYC updated",
    "desc": "Years since last KYC refresh, by priority",
    "headers": [
      "Customer Name",
      "Years",
      "Priority"
    ],
    "rows": [
      [
        "Rohan Joshi",
        "10",
        "Medium"
      ],
      [
        "Sneha Patra",
        "12",
        "High"
      ],
      [
        "Ushma Sewani",
        "5",
        "Medium"
      ],
      [
        "Kavita Varma",
        "8",
        "Medium"
      ],
      [
        "Arnav Nair",
        "2",
        "Low"
      ],
      [
        "Ayesha Nair",
        "12",
        "High"
      ]
    ],
    "id": "kyc_last_kyc_updated"
  },
  {
    "title": "Missing KYC",
    "desc": "Customers KYC document absent from the system",
    "headers": [
      "Customer Name",
      "Name of Missing ID",
      "Priority"
    ],
    "rows": [
      [
        "Imran Shaikh",
        "PAN",
        "High"
      ],
      [
        "Sneha Patil",
        "Aadhar",
        "High"
      ],
      [
        "Aanya Chhatwani",
        "ITR Copy",
        "Medium"
      ],
      [
        "Khyati Joshi",
        "Nominee Details",
        "Low"
      ],
      [
        "Vikram Nair",
        "Aadhar",
        "High"
      ],
      [
        "Irfan Khan",
        "PAN",
        "High"
      ]
    ],
    "id": "kyc_missing_kyc"
  },
  {
    "title": "VKYC",
    "desc": "Flags raised during the Video KYC process",
    "headers": [
      "Customer Name",
      "Issue"
    ],
    "rows": [
      [
        "Rohan Deshmukh",
        "Photo not matching video"
      ],
      [
        "Sana Sharma",
        "PAN not matching"
      ],
      [
        "Isha Rathi",
        "PAN missing"
      ],
      [
        "Pranjal Satav",
        "Aadhar missing"
      ],
      [
        "Vikram Nair",
        "Video call disconnected mid-session"
      ],
      [
        "Palak Ardeja",
        "Address not matching video"
      ]
    ],
    "id": "kyc_vkyc"
  },
  {
    "title": "Document Not Uploaded",
    "desc": "Customers with a KYC document type absent from the system",
    "headers": [
      "Customer Name",
      "Document",
      "Priority"
    ],
    "rows": [
      [
        "Sunaina Deshmukh",
        "PAN, Aadhar",
        "High"
      ],
      [
        "Siksha Patil",
        "ITR Copy",
        "Medium"
      ],
      [
        "Irad Shaikh",
        "PAN",
        "High"
      ],
      [
        "Kalyani Kher",
        "Aadhar",
        "High"
      ],
      [
        "Vikram Nair",
        "PAN, ITR Copy",
        "High"
      ],
      [
        "Aanya Verma",
        "Nominee Details",
        "Low"
      ]
    ],
    "id": "kyc_document_not_uploaded"
  },
  {
    "title": "Duplicate Aadhar Usage",
    "desc": "Same Aadhar number linked to multiple customer records",
    "headers": [
      "Aadhar Number",
      "Number"
    ],
    "rows": [
      [
        "XXXX-XXXX-4821",
        "7"
      ],
      [
        "XXXX-XXXX-6034",
        "4"
      ],
      [
        "XXXX-XXXX-7719",
        "2"
      ],
      [
        "XXXX-XXXX-2280",
        "2"
      ],
      [
        "XXXX-XXXX-9145",
        "1"
      ],
      [
        "XXXX-XXXX-3367",
        "1"
      ]
    ],
    "id": "kyc_duplicate_aadhar_usage"
  },
  {
    "title": "Duplicate PAN Usage",
    "desc": "Same PAN number linked to multiple customer records",
    "headers": [
      "PAN Number",
      "Number"
    ],
    "rows": [
      [
        "ABCPD1234E",
        "7"
      ],
      [
        "QWERT5678F",
        "4"
      ],
      [
        "LMNOP9012G",
        "2"
      ],
      [
        "ZXCVB3456H",
        "2"
      ],
      [
        "HGFED7890J",
        "1"
      ],
      [
        "TYUIO2345K",
        "1"
      ]
    ],
    "id": "kyc_duplicate_pan_usage"
  }
];
const LOAN_TABLES = [
  {
    "title": "NPA Account Not Marked As NPA Days",
    "desc": "Days overdue on accounts not yet flagged as NPA",
    "headers": [
      "Customer",
      "NPA Days"
    ],
    "rows": [
      [
        "Annanya Nagrik",
        "50"
      ],
      [
        "Nikita Chim",
        "40"
      ],
      [
        "Akshada Dongre",
        "33"
      ],
      [
        "Harshita Ganwani",
        "45"
      ],
      [
        "Vikram Nair",
        "21"
      ],
      [
        "Manjiri Dhoran",
        "30"
      ]
    ],
    "id": "loan_pending_npa_classification"
  },
  {
    "title": "Loan Details in Actual VS Sanction letter",
    "desc": "Actual disbursed terms compared against sanction letter terms",
    "headers": [
      "Customer",
      "Actual",
      "Sanction"
    ],
    "rows": [
      [
        "Sarvesh Magad",
        "\u20b910 Cr",
        "\u20b99 Cr"
      ],
      [
        "Tanmay Warkad",
        "13% rate of interest",
        "12% rate of interest"
      ],
      [
        "Imran Shaikh",
        "EMI \u20b92,000",
        "EMI \u20b91,000"
      ],
      [
        "Tanush Ruchwani",
        "Principal amount \u20b91.05 Cr",
        "Principal amount \u20b91.02 Cr"
      ],
      [
        "Veer Varma",
        "\u20b96.5 Cr",
        "\u20b96 Cr"
      ],
      [
        "Ayesha Khan",
        "14% rate of interest",
        "12.5% rate of interest"
      ]
    ],
    "id": "loan_sanction_letter_deviation"
  },
  {
    "title": "Loan Sanction To People Above Limit",
    "desc": "Sanctions approved beyond the approver's authorised limit",
    "headers": [
      "Loan Approval Person",
      "Above Limit"
    ],
    "rows": [
      [
        "Ramesh Kulkarni",
        "15 Cr"
      ],
      [
        "Sita Rane",
        "20 Cr"
      ],
      [
        "Anil Verma",
        "25 Cr"
      ],
      [
        "Priya Menon",
        "12 Cr"
      ],
      [
        "Suresh Iyer",
        "18 Cr"
      ],
      [
        "Neha Kapoor",
        "22 Cr"
      ]
    ],
    "id": "loan_approval_breaches",
    "numStyle": true
  },
  {
    "title": "Multiple Loan Account Of Same Person",
    "desc": "Customers holding more than one active loan account",
    "headers": [
      "Customer",
      "Loan Number"
    ],
    "rows": [
      [
        "Rohan Deshmukh",
        "7"
      ],
      [
        "Vinti Patil",
        "5"
      ],
      [
        "Sobiya Shaikh",
        "3"
      ],
      [
        "Khyati Joshi",
        "4"
      ],
      [
        "Tanmay Sharma",
        "2"
      ],
      [
        "Arva Khan",
        "3"
      ]
    ],
    "id": "loan_multi_loan_exposure",
    "numStyle": true
  },
  {
    "title": "Restructuring Of Loan",
    "desc": "Loans restructured and the revised repayment duration",
    "headers": [
      "Customer",
      "Loan Number",
      "Duration of Loan"
    ],
    "rows": [
      [
        "Rohit Khira",
        "9",
        "10 years"
      ],
      [
        "Siksha Patil",
        "8",
        "9 years"
      ],
      [
        "Imran Shaikh",
        "6",
        "7 years"
      ],
      [
        "Kalki Jhaveri",
        "9",
        "8 years"
      ],
      [
        "Vikram Nair",
        "4",
        "12 years"
      ],
      [
        "Virmala Verma",
        "5",
        "6 years"
      ]
    ],
    "id": "loan_restructured_accounts"
  },
  {
    "title": "JV entries In loan Account",
    "desc": "Number of times manual intervention done in acc",
    "headers": [
      "Customer",
      "Entry",
      "Amount Involved"
    ],
    "rows": [
      [
        "Rohan Deshmukh",
        "3",
        "90,000"
      ],
      [
        "Sneha Patil",
        "4",
        "31,000"
      ],
      [
        "Imran Shaikh",
        "9",
        "20,000"
      ],
      [
        "Kavita Joshi",
        "7",
        "50,000"
      ],
      [
        "Vikram Nair",
        "7",
        "69,000"
      ],
      [
        "Ayesha Khan",
        "3",
        "45,000"
      ]
    ],
    "id": "loan_joint_venture_account_entries"
  }
];

function loanMoney(v) {
  if (v === null || v === undefined || v === '') return '—';
  return fmtINR(v);
}
function loanPct(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Math.round(v * 100) + '%';
}
function loanDiffMoney(v) {
  return fmtINR(v || 0);
}
function loanDiffPct(v) {
  return Math.round((v || 0) * 100) + '%';
}

// Entry point for the Home screen's "Loan and Repayment Schedule" button.
// This page only needs the hardcoded LOAN_CALC_ROWS/LOAN_BANK_ROWS/
// LOAN_DIFF_ROWS data below, never RAW, so it must not be blocked by the
// "Loading dashboard data…" overlay while /api/data is pending, slow, or
// failing — that overlay covers the whole screen and swallows clicks even
// though the page underneath still looks normal, which made this button
// appear to do nothing. Force-hiding the overlay first, then navigating,
// guarantees this button always works regardless of workbook load state.
function openLoanRepayment() {
  setLoading(false);
  goTo('loan-repayment');
}

function renderLoanRepayment() {
  const combinedTbl = document.getElementById('loan-tbl-combined');
  if (!combinedTbl) return;

  loanFilterOptionsInit();
  const typeFilter = (document.getElementById('loan-filter-type') || {}).value || '';
  const locFilter = (document.getElementById('loan-filter-location') || {}).value || '';

  const head = `<thead>
    <tr>
      <th class="grp-head" colspan="9">As per Calculation</th>
      <th class="grp-head div-l" colspan="6">As per Bank</th>
      <th class="grp-head div-l" colspan="6">Difference</th>
    </tr>
    <tr>
      <th>Person Name</th><th>Month</th><th class="r">Opening Balance</th><th class="r">Interest</th>
      <th class="r" style="white-space:nowrap;">Principal</th><th class="r">EMI</th><th class="r">Closing Balance</th>
      <th class="r">Interest Rate</th><th class="r">Other Charge</th>
      <th class="r div-l">Opening Balance</th><th class="r">Interest</th>
      <th class="r" style="white-space:nowrap;">Principal</th><th class="r">EMI</th><th class="r">Closing Balance</th>
      <th class="r">Interest Rate</th>
      <th class="r div-l">Opening Balance</th><th class="r">Interest</th>
      <th class="r" style="white-space:nowrap;">Principal</th><th class="r">EMI</th><th class="r">Closing Balance</th>
      <th class="r">Interest Rate</th>
    </tr>
  </thead>`;

  const diffCell = (v, fmt, extraClass) => {
    const hit = v !== null && v !== undefined && v !== '' && v !== 0;
    const cls = ['r', hit ? 'diff-hit' : '', extraClass || ''].filter(Boolean).join(' ');
    return `<td class="${cls}">${fmt(v)}</td>`;
  };

  const body = LOAN_CALC_ROWS.map((calc, i) => {
    const bank = LOAN_BANK_ROWS[i] || [];
    const diff = LOAN_DIFF_ROWS[i] || [];
    const meta = LOAN_META[calc[0]] || {};
    if (typeFilter && meta.type !== typeFilter) return '';
    if (locFilter && meta.location !== locFilter) return '';
    return `<tr>
      <td>${esc(calc[0])}</td><td class="r">${calc[1]}</td><td class="r">${loanMoney(calc[2])}</td>
      <td class="r">${loanMoney(calc[3])}</td><td class="r">${loanMoney(calc[4])}</td><td class="r">${loanMoney(calc[5])}</td>
      <td class="r">${loanMoney(calc[6])}</td><td class="r">${loanPct(calc[7])}</td>
      <td class="r">${calc[8] === null || calc[8] === undefined ? '—' : loanMoney(calc[8])}</td>
      <td class="r div-l">${loanMoney(bank[2])}</td><td class="r">${loanMoney(bank[3])}</td>
      <td class="r">${loanMoney(bank[4])}</td><td class="r">${loanMoney(bank[5])}</td>
      <td class="r">${loanMoney(bank[6])}</td><td class="r">${loanPct(bank[7])}</td>
      ${diffCell(diff[0], loanDiffMoney, 'div-l')}
      ${diffCell(diff[1], loanDiffMoney)}
      ${diffCell(diff[2], loanDiffMoney)}
      ${diffCell(diff[3], loanDiffMoney)}
      ${diffCell(diff[4], loanDiffMoney)}
      ${diffCell(diff[5], loanDiffPct)}
    </tr>`;
  }).join('');

  combinedTbl.innerHTML = head + `<tbody>${body}</tbody>`;
}
// ═════════════════════════════════════════════════════════════
// END LOAN AND REPAYMENT SCHEDULE MODULE
// ═════════════════════════════════════════════════════════════

function renderWelcome() {
  const modules = [
    { icon: '⚙', id: 'filters', title: 'Dashboard Filters', desc: 'Set global filters for company, state, product, customer, and month.' },
    { icon: '🔍', id: 'hygiene', title: 'Data Hygiene', desc: 'Detect duplicate master data, GST mismatches, and product code errors.' },
    { icon: '📊', id: 'po-summary', title: 'PO vs Invoice vs GRN vs Bank', desc: 'Full reconciliation across purchase orders, invoices, GRNs, and payments.' },
    { icon: '📋', id: 'po-detail', title: 'PO Detail — Exceptions', desc: 'GRN without invoice, open POs, bank account count, and payment ageing.' },
    { icon: '🛒', id: 'purchase', title: 'Purchase Analytics', desc: 'Blocked vendor detection, purchase vs return combo chart, full register.' },
    { icon: '🤖', id: 'ai-dashboard', title: 'AI Dashboard', desc: 'AI-driven distribution pie, month trend, and company bar with smart filters.' },
    { icon: '✔', id: 'formula', title: 'Formula Check', desc: 'GST rate variance and discount difference validation per invoice.' },
    { icon: '➕', id: 'addition', title: 'Additional Modules', desc: 'Roadmap: MIS reporting, fraud analysis, inventory, trial balance.' },
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
            <button type="button" class="btn-rmk btn-rmk-edit" title="Edit Remark" onclick="handleRemarkAction('${esc(r.ISSUE_ID)}', 'edit')">✏️ Edit</button>
            <button type="button" class="btn-rmk btn-rmk-del" title="Delete Remark" onclick="handleRemarkAction('${esc(r.ISSUE_ID)}', 'delete')">🗑️ Delete</button>
          ` : `
            <button type="button" class="btn-rmk btn-rmk-save" title="Save Remark" onclick="handleRemarkAction('${esc(r.ISSUE_ID)}', 'save')">💾 Save</button>
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
          <button type="button" class="btn-rmk btn-rmk-save" title="Save Remark" onclick="handleRemarkAction('${esc(issueId)}', 'save')">💾 Save</button>
          <button type="button" class="btn-rmk btn-rmk-del" title="Delete Remark" onclick="handleRemarkAction('${esc(issueId)}', 'delete')">🗑️ Delete</button>
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
              <button type="button" class="btn-rmk btn-rmk-edit" title="Edit Remark" onclick="handleRemarkAction('${esc(issueId)}', 'edit')">✏️ Edit</button>
              <button type="button" class="btn-rmk btn-rmk-del" title="Delete Remark" onclick="handleRemarkAction('${esc(issueId)}', 'delete')">🗑️ Delete</button>
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
              <button type="button" class="btn-rmk btn-rmk-save" title="Save Remark" onclick="handleRemarkAction('${esc(issueId)}', 'save')">💾 Save</button>
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

  const dupCustomers = Object.entries(dupCustomerMap)
    .filter(([_, group]) => group.codes.size > 1)
    .map(([name, group]) => {
      const issueId = `dup_cust:${name}`;
      return {
        ISSUE_ID: issueId,
        CATEGORY: 'dup_cust',
        ENTITY_KEY: name,
        CUST_NM: name,
        CUST_CD: Array.from(group.codes).filter(Boolean).join(', '),
        COUNT: group.count,
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
    const diffText = hasMissingValue ? '<span class="tag flag">Missing</span>' : fmtINR(grnAmt - bankAmt);
    return `<tr class="${cls === 'missing' ? 'row-flag' : cls === 'partial' ? 'row-warn' : ''}">
      <td class="grp">${esc(r.INVOICE_NO)}</td>
      <td>${esc(r.COMP_NM)}</td>
      <td>${esc(r.PO_NO)}</td>
      <td class="c">${fmtINR(r.PO_AMT)}</td>
      <td>${r.GRN_NO === 'Missing' ? '<span class="tag flag">Missing</span>' : esc(r.GRN_NO)}</td>
      <td class="c">${r.GRN_AMT ? fmtINR(r.GRN_AMT) : '—'}</td>
      <td class="c">${r.BANK_AMT ? fmtINR(r.BANK_AMT) : '—'}</td>
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
  // ── IT CONTROLS MODULE categories
  'itc_access_lwd': 'Access After Last Working Day Observations',
  'itc_inactive_90': 'Users Not Logged In for 90+ Days Observations',
  'itc_pwd_stale': 'Password Not Changed Observations',
  'itc_after_hours': 'Login Outside Business Hours Observations',
  'itc_failed_login': 'Multiple Failed Login Attempts Observations',
  'itc_above_limit': 'Approved Above Authorized Limit Observations',
  // ── HR AND PAYROLL MODULE categories
  'hr_dup_bank': 'Multiple Employees – Same Bank Account Observations',
  'hr_dup_pan_aadhaar': 'Duplicate PAN / Aadhaar Number Observations',
  'hr_missing_ids': 'Employees Without PAN / Aadhaar / Bank Details Observations',
  'hr_missing_master': 'Missing Department / Location / Grade Observations',
  'hr_same_pan': 'Same PAN For Multiple Employees Observations',
  // KYC categories
  'kyc_pan_aadhaar_not_matching': 'PAN/Aadhaar Not Matching Observations',
  'kyc_last_kyc_updated': 'Last KYC Updated Observations',
  'kyc_missing_kyc': 'Missing KYC Observations',
  'kyc_vkyc': 'VKYC Observations',
  'kyc_document_not_uploaded': 'Document Not Uploaded Observations',
  'kyc_duplicate_aadhar_usage': 'Duplicate Aadhaar Usage Observations',
  'kyc_duplicate_pan_usage': 'Duplicate PAN Usage Observations',
  // LOAN categories
  'loan_pending_npa_classification': 'Pending NPA Classification Observations',
  'loan_sanction_letter_deviation': 'Sanction Letter Deviation Observations',
  'loan_approval_breaches': 'Approval Breaches Observations',
  'loan_multi_loan_exposure': 'Multi-Loan Exposure Observations',
  'loan_restructured_accounts': 'Restructured Accounts Observations',
  'loan_joint_venture_account_entries': 'Joint Venture Account Entries Observations',

};

const DROPDOWNS = {
  RepeatObservation: ['Yes', 'No'],
  ObservationType: ['Compliance', 'Financial', 'Operational', 'Process Defect'],
  RiskType: ['High', 'Medium', 'Low', 'Critical'],
  Department: ['Procurement', 'Finance', 'Taxation', 'Logistics', 'Audit', 'IT'],
  SBU: ['Retail', 'Enterprise', 'Supply Chain', 'E-Commerce'],
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
  if (currentObsCategory && currentObsCategory.startsWith('itc_')) return 'it-controls';
  if (currentObsCategory && currentObsCategory.startsWith('hr_')) return 'hr-payroll';
  if (currentObsCategory && currentObsCategory.startsWith('kyc_')) return 'kyc';
  if (currentObsCategory && currentObsCategory.startsWith('loan_')) return 'other-loan';
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
                    <button class="btn-rmk btn-rmk-edit" onclick='showObsForm(${JSON.stringify(item).replace(/'/g, "&apos;")})'>✏️ Edit</button>
                    <button class="btn-rmk btn-rmk-del" onclick="deleteObservation(${item.id})">🗑️ Delete</button>
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
        <div class="obs-field"><span class="obs-field-label">Observation Title</span><input type="text" name="ObservationTitle" class="remark-input" value="${esc(item.ObservationTitle || '')}" required></div>
        <div class="obs-field"><span class="obs-field-label">Observation Sub Process</span><input type="text" name="ObservationSubProcess" class="remark-input" value="${esc(item.ObservationSubProcess || '')}"></div>
        <div class="obs-field"><span class="obs-field-label">Repeat Observation</span>${renderDropdown('RepeatObservation', item.RepeatObservation)}</div>
        <div class="obs-field"><span class="obs-field-label">Observation Type</span>${renderDropdown('ObservationType', item.ObservationType)}</div>
        <div class="obs-field"><span class="obs-field-label">Risk Type</span>${renderDropdown('RiskType', item.RiskType)}</div>
        <div class="obs-field"><span class="obs-field-label">Department</span>${renderDropdown('Department', item.Department)}</div>
        <div class="obs-field"><span class="obs-field-label">SBU</span>${renderDropdown('SBU', item.SBU)}</div>
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
        <div class="obs-field"><span class="obs-field-label">Auditee</span><input type="text" name="Auditee" class="remark-input" value="${esc(item.Auditee || '')}"></div>
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
        <button type="button" class="btn secondary sm" onclick="saveObservation(event, ${item.id || 'null'}, true)">➕ Save & Add Row</button>
        <button type="submit" class="btn primary sm">💾 Save Observation</button>
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
    { name: 'IT Control', errors: 48 },
    { name: 'HR management', errors: 35 },
    { name: 'Audit trial', errors: 10 },
    { name: 'EMI Checking', errors: 16 },
    { name: 'Purchase', errors: 14 },
    { name: 'KYC Checks', errors: 42 },
    { name: 'Loan Checklist', errors: 36 },
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
      <button class="btn ghost sm" type="button" onclick="downloadDynamicExcel('${t.id}')" style="padding:5px 10px;font-size:11px;">📥 Excel</button>
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

function renderKyc() {
  const container = document.getElementById('kyc-tables-container');
  if (!container) return;

  let html = '';
  // Arrange in grid g2
  for (let i = 0; i < KYC_TABLES.length; i += 2) {
    const t1 = KYC_TABLES[i];
    const t2 = KYC_TABLES[i + 1];
    if (t2) {
      html += `<div class="grid g2"><div>${generateCardHtml(t1)}</div><div>${generateCardHtml(t2)}</div></div>`;
    } else {
      html += `<div>${generateCardHtml(t1)}</div>`;
    }
  }
  container.innerHTML = html;
}

function renderLoan() {
  const container = document.getElementById('loan-tables-container');
  if (!container) return;

  let html = '';
  // Arrange in grid g2
  for (let i = 0; i < LOAN_TABLES.length; i += 2) {
    const t1 = LOAN_TABLES[i];
    const t2 = LOAN_TABLES[i + 1];
    if (t2) {
      html += `<div class="grid g2"><div>${generateCardHtml(t1)}</div><div>${generateCardHtml(t2)}</div></div>`;
    } else {
      html += `<div>${generateCardHtml(t1)}</div>`;
    }
  }
  container.innerHTML = html;
}

function downloadDynamicExcel(tableId) {
  let tableConfig = KYC_TABLES.find(t => t.id === tableId) || LOAN_TABLES.find(t => t.id === tableId);
  if (!tableConfig) return;

  const escapeXml = v => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let xml = '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sheet1"><Table>';

  // Headers
  xml += '<Row>';
  tableConfig.headers.forEach(h => {
    xml += `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`;
  });
  xml += `<Cell><Data ss:Type="String">Remark</Data></Cell>`;
  xml += '</Row>';

  // Rows
  tableConfig.rows.forEach((row, i) => {
    xml += '<Row>';
    row.forEach(cell => {
      xml += `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`;
    });
    const issueId = `${tableConfig.id}-${i}`;
    const remark = getSavedRemark(issueId);
    xml += `<Cell><Data ss:Type="String">${escapeXml(remark)}</Data></Cell>`;
    xml += '</Row>';
  });

  xml += '</Table></Worksheet></Workbook>';

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tableConfig.id}_Report.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}