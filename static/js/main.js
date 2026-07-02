/* ═══════════════════════════════════════════════════════════════
   PURCHASE ICD — MAIN JS
   Navigation · Filters · Data · Tables · Charts
═══════════════════════════════════════════════════════════════ */

// ── COLOUR PALETTE (from laser CSS) ──────────────────────────
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

// ── FILTER STATE ─────────────────────────────────────────────
let F = { company: [], state: [], product: [], customer: [], month: [] };
let RAW = null; // cached API data

// ── CHART REGISTRY (destroy before re-render) ────────────────
const CHARTS = {};
function destroyChart(id) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
}

// ─────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────────────────────
async function loadData() {
  const res = await fetch('/api/data');
  RAW = await res.json();
  buildFilterUI();
  renderCurrentPage('welcome');
}

// ─────────────────────────────────────────────────────────────
// FILTER HELPERS
// ─────────────────────────────────────────────────────────────
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
function filteredComparison() {
  if (!RAW) return [];
  return RAW.comparison.filter(r => {
    if (F.company.length && !F.company.includes(r.COMP_NM)) return false;
    if (F.month.length   && !F.month.includes(r.MONTH))     return false;
    return true;
  });
}
function activeFilterCount() {
  return F.company.length + F.state.length + F.product.length + F.customer.length + F.month.length;
}
function fmtPercentList(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => v.endsWith('%') ? v : `${v}%`)
    .join(', ');
}

// ─────────────────────────────────────────────────────────────
// BUILD FILTER UI (Filters page + rails)
// ─────────────────────────────────────────────────────────────
function buildFilterUI() {
  if (!RAW) return;
  const grid = document.getElementById('filter-page-grid');
  if (!grid) return;
  const dims = [
    { key: 'company',  label: 'Company Name',   values: RAW.companies }, //columns in filter UI
    { key: 'state',    label: 'Company State',   values: RAW.states },
    { key: 'product',  label: 'Product Name',    values: RAW.products },
    { key: 'customer', label: 'Customer Name',   values: RAW.customers },
    { key: 'month',    label: 'Month',           values: RAW.months },
  ];
  grid.innerHTML = dims.map(d => `
    <div class="filter-card">
      <h3>${d.label}</h3>
      <div class="checklist" id="cl-${d.key}">
        ${d.values.map(v => `
          <label>
            <input type="checkbox" value="${esc(v)}" data-dim="${d.key}"
              ${F[d.key].includes(v) ? 'checked' : ''}
              onchange="toggleFilter('${d.key}','${esc(v)}',this.checked)">
            ${esc(v)}
          </label>`).join('')}
      </div>
    </div>`).join('');

  buildRails();
}

function buildRails() {
  const railIds = ['rail-hygiene', 'rail-purchase', 'rail-ai'];
  railIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <div class="rail-card">
        <h3>Filters</h3>
        ${['company','state','product','customer','month'].map(k => `
          <div class="slicer">
            <label>${k.charAt(0).toUpperCase()+k.slice(1)}</label>
            <select onchange="setFilterSingle('${k}',this.value)">
              <option value="">All</option>
              ${(RAW[k+'s']||RAW.companies).map ? 
                (k==='company'?RAW.companies:k==='state'?RAW.states:k==='product'?RAW.products:k==='customer'?RAW.customers:RAW.months)
                  .map(v=>`<option value="${esc(v)}" ${F[k].includes(v)?'selected':''}>${esc(v)}</option>`).join('') : ''}
            </select>
          </div>`).join('')}
        <button class="btn-reset" onclick="resetFilters()">↺ Reset Filters</button>
      </div>`;
  });
}

function toggleFilter(dim, val, checked) {
  if (checked) { if (!F[dim].includes(val)) F[dim].push(val); }
  else { F[dim] = F[dim].filter(v => v !== val); }
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

// ─────────────────────────────────────────────────────────────
// FILTER STRIP RENDERER
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// ROUTING: decide what to render per page
// ─────────────────────────────────────────────────────────────
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
  }
}

// ─────────────────────────────────────────────────────────────
// WELCOME PAGE
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// DATA HYGIENE
// ─────────────────────────────────────────────────────────────
function renderHygiene() {
  renderFilterStrip('filter-strip-hygiene');
  // Multiple Tax Code
  fillTable('tbl-multi-tax', RAW.multi_tax, r => `
    <tr class="${r.COUNT > 30 ? 'row-flag' : ''}">
      <td>${esc(fmtPercentList(r.GST_RATE))}</td>
      <td>${esc(String(r.TAX_DESC || '').replace(/\+/g, ', '))}</td>
      <td class="r">${r.COUNT}</td>
    </tr>`);
  // Same product multiple GST
  fillTable('tbl-prod-gst', RAW.prod_gst_issues, r => `
    <tr class="row-flag">
      <td class="grp">${esc(r.PROD_NM)}</td>
      <td class="r">${esc(String(r.GST_RATE || '').replace(/\+/g, ', '))}</td>
      <td class="r">${r.COUNT}</td>
    </tr>`);
  // Duplicate customers
  fillTable('tbl-dup-cust', RAW.dup_customers, r => `
    <tr class="${r.COUNT===1?'row-flag':''}">
      <td>${esc(r.CUST_NM)}</td>
      <td>${esc(r.CUST_CD)}</td>
      <td class="r">${r.COUNT}</td>
    </tr>`);
  // Product name issues
  fillTable('tbl-prod-name', RAW.prod_name_issues, r => `
    <tr class="${r.COUNT <= 3 ? 'row-flag' : ''}">
      <td>${esc(r.PROD_NM)}</td>
      <td>${esc(r.PROD_CODE)}</td>
      <td class="r">${r.COUNT}</td>
    </tr>`);
  // Product code check
  fillTable('tbl-prod-code', RAW.prod_code_check, r => `
    <tr class="row-flag">
      <td class="grp">${esc(r.PROD_CODE)}</td>
      <td class="c"><span class="tag flag">Not in Master</span></td>
    </tr>`);
}

// ─────────────────────────────────────────────────────────────
// PO SUMMARY
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// PO DETAIL
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// PURCHASE PAGE
// ─────────────────────────────────────────────────────────────
function renderPurchase() {
  renderFilterStrip('filter-strip-purchase');
  fillTable('tbl-blocked', RAW.blocked_vendors, r => `
    <tr class="row-flag">
      <td class="grp">${esc(r.VENDOR)}</td>
      <td>${esc(r.REASON)}</td>
      <td>${esc(r.INV_NO)}</td>
      <td class="r">${fmtINR(r.AMT)}</td>
    </tr>`);

  // Combo chart: purchase vs return by month
  const months  = RAW.months;
  const byMonth = {};
  months.forEach(m => { byMonth[m] = { purchase: 0, returns: 0 }; });
  filteredPurchase().forEach(r => {
    if (byMonth[r.MONTH]) byMonth[r.MONTH].purchase += r.INVOICE_AMT;
  });
  // Simulate returns as ~15% of purchase with noise
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
          const month = d[0]?.label || '';
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

  // Purchase report table
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

// ─────────────────────────────────────────────────────────────
// AI DASHBOARD
// ─────────────────────────────────────────────────────────────
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
          backgroundColor: '#fff',
          borderColor: '#ece6df',
          borderWidth: 1,
          titleColor: C.ink,
          bodyColor: C.muted,
          padding: 12,
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

// ─────────────────────────────────────────────────────────────
// FORMULA CHECK
// ─────────────────────────────────────────────────────────────
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
// CHART HELPERS
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

// ─────────────────────────────────────────────────────────────
// TABLE HELPER
// ─────────────────────────────────────────────────────────────
function fillTable(id, rows, rowFn) {
  const tbody = document.querySelector(`#${id} tbody`);
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="20">No data for the current filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(rowFn).join('');
}

// ─────────────────────────────────────────────────────────────
// KPI CARD BUILDER
// ─────────────────────────────────────────────────────────────
function kpiCard(label, val, sub, accent) {
  return `
    <div class="kpi" style="--accent:${accent}">
      <div class="k-label">${label}</div>
      <div class="k-val num">${val}</div>
      <div class="k-sub">${sub}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────
loadData();
