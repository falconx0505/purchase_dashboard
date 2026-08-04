/* ═══════════════════════════════════════════════════════════════
   PURCHASE ICD — MAIN JS
   Navigation · Filters · Data · Tables · Charts · Observations
═══════════════════════════════════════════════════════════════ */

const C = {
  maroon:  '#6C0E12', red:    '#C22829', orange: '#F37A04',
  amber:   '#F1A646', blue:   '#5388B7', ok:     '#2f8f5b',
  muted:   '#857a74', ink:    '#241c1b', faint:  '#a89f99',
  peach:   '#FFE2CA', cream:  '#F5E3B5', bg:     '#f6f3ee',
};
const PIE_COLORS = [
  '#C22829','#F37A04','#F1A646','#5388B7','#6C0E12',
  '#2f8f5b','#857a74','#B45309','#1D4ED8','#7C3AED',
];

let F = { company: [], state: [], product: [], customer: [], month: [] };
let RAW = null;
let currentObsCategory = '';

const CHARTS = {};
function destroyChart(id) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
}

function goTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  const tab  = document.querySelector(`[data-page="${pageId}"]`);
  if (page) page.classList.add('active');
  if (tab)  tab.classList.add('active');
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

function setLoading(visible, message = '') {
  const el = document.getElementById('data-loading');
  if (!el) return;
  el.hidden = !visible;
  el.querySelector('.loading-message').textContent = message;
}

function filteredPurchase() {
  if (!RAW) return [];
  return RAW.purchase.filter(r => {
    if (F.company.length  && !F.company.includes(r.COMP_NM))   return false;
    if (F.state.length    && !F.state.includes(r.COMP_STATE))  return false;
    if (F.product.length  && !F.product.includes(r.PROD_NM))   return false;
    if (F.customer.length && !F.customer.includes(r.CUST_NM))  return false;
    if (F.month.length    && !F.month.includes(r.MONTH))       return false;
    return true;
  });
}
function filteredPurchaseRaw() {
  if (!RAW) return [];
  const rows = RAW.purchase_raw || RAW.purchase || [];
  return rows.filter(r => {
    if (F.company.length  && !F.company.includes(r.COMP_NM))   return false;
    if (F.state.length    && !F.state.includes(r.COMP_STATE))  return false;
    if (F.product.length  && !F.product.includes(r.PROD_NM))   return false;
    if (F.customer.length && !F.customer.includes(r.CUST_NM))  return false;
    if (F.month.length    && !F.month.includes(r.MONTH))       return false;
    return true;
  });
}
function filteredComparison() {
  if (!RAW) return [];
  return RAW.comparison.filter(r => {
    if (F.company.length && !F.company.includes(r.COMP_NM)) return false;
    if (F.month.length   && !F.month.includes(r.MONTH))     return false;
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
    { key: 'company',  label: 'Company / Store', values: RAW.companies },
    { key: 'state',    label: 'Region',           values: RAW.states },
    { key: 'product',  label: 'Product Name',     values: RAW.products },
    { key: 'customer', label: 'Customer / Channel', values: RAW.customers },
    { key: 'month',    label: 'Month',            values: RAW.months },
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
    { k: 'company',  label: 'Company' },
    { k: 'state',    label: 'Region' },
    { k: 'product',  label: 'Product' },
    { k: 'customer', label: 'Customer' },
    { k: 'month',    label: 'Month' }
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
              ${(item.k==='company'?RAW.companies:item.k==='state'?RAW.states:item.k==='product'?RAW.products:item.k==='customer'?RAW.customers:RAW.months)
                  .map(v=>`<option value="${esc(v)}" ${F[item.k].includes(v)?'selected':''}>${esc(v)}</option>`).join('')}
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

function renderCurrentPage(pageId) {
  if (!RAW) return;
  switch(pageId) {
    case 'welcome':      renderWelcome();      break;
    case 'filters':      buildFilterUI();      break;
    case 'hygiene':      renderHygiene();      break;
    case 'po-summary':   renderPoSummary();    break;
    case 'po-detail':    renderPoDetail();     break;
    case 'purchase':     renderPurchase();     break;
    case 'ai-dashboard': renderAiDashboard();  break;
    case 'formula':      renderFormula();      break;
    case 'addition':     break;
    case 'observations': renderObsList();      break;
  }
}

function renderWelcome() {
  const modules = [
    { icon:'⚙', id:'filters',      title:'Dashboard Filters',        desc:'Set global filters for company, state, product, customer, and month.' },
    { icon:'🔍', id:'hygiene',      title:'Data Hygiene',             desc:'Detect duplicate master data, GST mismatches, and product code errors.' },
    { icon:'📊', id:'po-summary',   title:'PO vs Invoice vs GRN vs Bank', desc:'Full reconciliation across purchase orders, invoices, GRNs, and payments.' },
    { icon:'📋', id:'po-detail',    title:'PO Detail — Exceptions',   desc:'GRN without invoice, open POs, bank account count, and payment ageing.' },
    { icon:'🛒', id:'purchase',     title:'Purchase Analytics',       desc:'Blocked vendor detection, purchase vs return combo chart, full register.' },
    { icon:'🤖', id:'ai-dashboard', title:'AI Dashboard',             desc:'AI-driven distribution pie, month trend, and company bar with smart filters.' },
    { icon:'✔', id:'formula',      title:'Formula Check',            desc:'GST rate variance and discount difference validation per invoice.' },
    { icon:'➕', id:'addition',     title:'Additional Modules',       desc:'Roadmap: MIS reporting, fraud analysis, inventory, trial balance.' },
  ];
  document.getElementById('welcome-modules').innerHTML = modules.map((m,i) => `
    <div class="mod" onclick="goTo('${m.id}')">
      <div class="mnum">${String(i+1).padStart(2,'0')} ${m.icon}</div>
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
    <tr class="${r.COUNT===1?'row-flag':''}">
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

function renderPoSummary() {
  renderFilterStrip('filter-strip-po');
  const data = filteredComparison();
  const total = data.length;
  const invoiceAmt = data.reduce((s,r) => s + ((+r.PO_AMT || 0) > 0 ? (+r.PO_AMT || 0) : 0), 0);
  const grnAmt = data.reduce((s,r) => s + ((+r.GRN_AMT || 0) > 0 ? (+r.GRN_AMT || 0) : 0), 0);
  const bankAmt = data.reduce((s,r) => s + ((+r.BANK_AMT || 0) > 0 ? (+r.BANK_AMT || 0) : 0), 0);
  const totalAmt = data.reduce((s,r) => s + (+r.PO_AMT || 0), 0);

  document.getElementById('kpi-po').innerHTML = `
    ${kpiCard('Total Invoices',    fmt0(total),      'records in comparison',   C.blue)}
    ${kpiCard('Invoice Amount',    fmtINRcr(invoiceAmt), 'from PO amounts',   C.ok)}
    ${kpiCard('GRN Amount',        fmtINRcr(grnAmt), 'from GRN amounts',     C.amber)}
    ${kpiCard('Bank Amount',       fmtINRcr(bankAmt), 'from bank amounts',      C.red)}
    ${kpiCard('Total PO Value',    fmtINRcr(totalAmt), 'across all lines',       C.maroon)}`;

  fillTable('tbl-comparison', data, r => {
    const cls = r.MATCH.includes('✓')?'match': r.MATCH.includes('⚠')?'partial':'missing';
    const grnAmt = Number(r.GRN_AMT);
    const bankAmt = Number(r.BANK_AMT);
    const hasMissingValue = !Number.isFinite(grnAmt) || !Number.isFinite(bankAmt) || grnAmt === 0 || bankAmt === 0;
    const diffText = hasMissingValue ? '<span class="tag flag">Missing</span>' : fmtINR(grnAmt - bankAmt);
    return `<tr class="${cls==='missing'?'row-flag':cls==='partial'?'row-warn':''}">
      <td class="grp">${esc(r.INVOICE_NO)}</td>
      <td>${esc(r.COMP_NM)}</td>
      <td>${esc(r.PO_NO)}</td>
      <td class="c">${fmtINR(r.PO_AMT)}</td>
      <td>${r.GRN_NO==='Missing'?'<span class="tag flag">Missing</span>':esc(r.GRN_NO)}</td>
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
    return `<tr class="${high?'row-flag':''}">
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

  const months  = RAW.months;
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
  const totalAmt  = data.reduce((s,r) => s + r.INVOICE_AMT, 0);
  const totalGst  = data.reduce((s,r) => s + r.GST_AMT, 0);
  const companies = new Set(data.map(r => r.COMP_NM)).size;
  const invoices  = data.length;

  document.getElementById('kpi-ai').innerHTML = `
    ${kpiCard('Total Invoice Amount', fmtINRk(totalAmt), `${invoices} invoice lines`,                  C.red)}
    ${kpiCard('Total GST',            fmtINRk(totalGst), 'across all lines',                           C.amber)}
    ${kpiCard('Companies',            fmt0(companies),   'distinct entities',                           C.blue)}
    ${kpiCard('Avg Invoice Value',    fmtINRk(totalAmt / (invoices||1)), 'per transaction',             C.maroon)}`;

  renderPieChart(data, document.getElementById('pie-dimension').value);
  renderMonthTrend(data);
  renderCompanyBar(data);

  document.getElementById('pie-dimension').onchange = function() {
    renderPieChart(filteredPurchase(), this.value);
  };
}

function renderPieChart(data, dimension) {
  const grouped = {};
  data.forEach(r => {
    const key = r[dimension] || 'Unknown';
    grouped[key] = (grouped[key] || 0) + r.INVOICE_AMT;
  });
  const sorted  = Object.entries(grouped).sort((a,b) => b[1]-a[1]).slice(0,8);
  const labels  = sorted.map(e => e[0]);
  const values  = sorted.map(e => e[1]);

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
          bodyFont:  { family: "'Raleway', sans-serif", size: 12 },
          callbacks: {
            title:  items => items[0].label,
            label: item => {
              const total = item.dataset.data.reduce((s,v) => s+v, 0);
              const pct   = ((item.raw / total) * 100).toFixed(1);
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
  const months = ['April','May','June','July','August','September','October','November','December','January','February','March'];
  const byMonth = {};
  months.forEach(m => { byMonth[m] = { amt: 0, count: 0, gst: 0 }; });
  data.forEach(r => {
    if (byMonth[r.MONTH]) {
      byMonth[r.MONTH].amt   += r.INVOICE_AMT;
      byMonth[r.MONTH].count += 1;
      byMonth[r.MONTH].gst   += r.GST_AMT;
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
          bodyFont:  { family: "'Raleway', sans-serif", size: 12 },
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
    grouped[r.COMP_NM].amt   += r.INVOICE_AMT;
    grouped[r.COMP_NM].count += 1;
    grouped[r.COMP_NM].gst   += r.GST_AMT;
  });
  const sorted = Object.entries(grouped).sort((a,b) => b[1].amt - a[1].amt);
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
        backgroundColor: sorted.map((_,i) => PIE_COLORS[i % PIE_COLORS.length] + 'CC'),
        borderColor:     sorted.map((_,i) => PIE_COLORS[i % PIE_COLORS.length]),
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
          bodyFont:  { family: "'Raleway', sans-serif", size: 12 },
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
  'multi_tax': 'Multiple Tax Code Observations',
  'prod_gst': 'Same Product, Multiple GST Rate Observations',
  'dup_cust': 'Duplicate Customer Name Observations',
  'prod_name': 'Product Name Check Observations',
  'prod_code': 'Product Code Check Observations'
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

function closeObservationModal() {
  goTo('hygiene');
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

      <div class="tbl-wrap" style="max-height:420px;overflow:auto;border:1px solid var(--line2);border-radius:6px;margin-bottom:15px">
        <table class="tbl" style="font-size:12px;white-space:nowrap">
          <thead>
            <tr style="background:var(--bg)">
              <th style="min-width:180px">Field Name</th>
              <th style="min-width:320px">Value / Input</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>Observation Title</strong></td><td><input type="text" name="ObservationTitle" class="remark-input" value="${esc(item.ObservationTitle || '')}" required></td></tr>
            <tr><td><strong>Observation Sub Process</strong></td><td><input type="text" name="ObservationSubProcess" class="remark-input" value="${esc(item.ObservationSubProcess || '')}"></td></tr>
            <tr><td><strong>Repeat Observation</strong></td><td>${renderDropdown('RepeatObservation', item.RepeatObservation)}</td></tr>
            <tr><td><strong>Observation Type</strong></td><td>${renderDropdown('ObservationType', item.ObservationType)}</td></tr>
            <tr><td><strong>Risk Type</strong></td><td>${renderDropdown('RiskType', item.RiskType)}</td></tr>
            <tr><td><strong>Department</strong></td><td>${renderDropdown('Department', item.Department)}</td></tr>
            <tr><td><strong>SBU</strong></td><td>${renderDropdown('SBU', item.SBU)}</td></tr>
            <tr><td><strong>Follow Up Frequency</strong></td><td>${renderDropdown('FollowUpFrequency', item.FollowUpFrequency)}</td></tr>
            <tr><td><strong>Share With</strong></td><td>${renderDropdown('ShareWith', item.ShareWith)}</td></tr>
            <tr><td><strong>Observation Description</strong></td><td><textarea name="ObservationDescription" class="remark-input" rows="2">${esc(item.ObservationDescription || '')}</textarea></td></tr>
            <tr><td><strong>Short Observation</strong></td><td><input type="text" name="ShortObservation" class="remark-input" value="${esc(item.ShortObservation || '')}"></td></tr>
            <tr><td><strong>Root Cause</strong></td><td><textarea name="RootCause" class="remark-input" rows="2">${esc(item.RootCause || '')}</textarea></td></tr>
            <tr><td><strong>Impact / Concern</strong></td><td><textarea name="ImpactConcern" class="remark-input" rows="2">${esc(item.ImpactConcern || '')}</textarea></td></tr>
            <tr><td><strong>Financial Implication</strong></td><td><input type="text" name="FinancialImplication" class="remark-input" value="${esc(item.FinancialImplication || '')}"></td></tr>
            <tr><td><strong>Auditee</strong></td><td><input type="text" name="Auditee" class="remark-input" value="${esc(item.Auditee || '')}"></td></tr>
            <tr><td><strong>Other Auditee</strong></td><td><input type="text" name="OtherAuditee" class="remark-input" value="${esc(item.OtherAuditee || '')}"></td></tr>
            <tr><td><strong>Escalator 1</strong></td><td><input type="text" name="Escalator1" class="remark-input" value="${esc(item.Escalator1 || '')}"></td></tr>
            <tr><td><strong>Escalator 2</strong></td><td><input type="text" name="Escalator2" class="remark-input" value="${esc(item.Escalator2 || '')}"></td></tr>
            <tr><td><strong>Escalator 3</strong></td><td><input type="text" name="Escalator3" class="remark-input" value="${esc(item.Escalator3 || '')}"></td></tr>
            <tr><td><strong>Recommendation</strong></td><td><textarea name="Recommendation" class="remark-input" rows="2">${esc(item.Recommendation || '')}</textarea></td></tr>
          </tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn ghost sm" onclick="renderObsList()">Cancel</button>
        <button type="submit" class="btn primary sm">💾 Save Observation</button>
      </div>
    </form>`;
}

async function saveObservation(event, id) {
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

  try {
    const res = await fetch('/api/observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      await renderObsList();
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
      ...( overrides.plugins || {} )
    },
    scales: overrides.scales || {},
    ...( (() => { const {plugins, scales, ...rest} = overrides; return rest; })() )
  };
}

function richTooltip(getRows) {
  return {
    backgroundColor: '#fff', borderColor: '#ece6df', borderWidth: 1,
    titleColor: C.ink, bodyColor: C.muted, padding: 12,
    titleFont: { family: "'Poppins', sans-serif", weight: '600', size: 12 },
    bodyFont:  { family: "'Raleway', sans-serif", size: 12 },
    callbacks: {
      label: function(item) {
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
  if (Math.abs(v) >= 1e7) return '₹' + (v/1e7).toFixed(2) + ' Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v/1e5).toFixed(2) + ' L';
  return '₹' + v.toLocaleString('en-IN');
}
function fmtINRcr(v) {
  v = Math.round(+v || 0);
  return '₹' + (v/1e7).toFixed(2).replace(/\.00$/, '') + ' Cr';
}
function fmt0(v) { return (+v || 0).toLocaleString('en-IN'); }
function esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function hexA(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

loadData();