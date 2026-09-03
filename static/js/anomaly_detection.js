const ANOMALY_API = '/anomalies';

let sessionId = null;
let currentMode = null;
let uploadedData = null;
let selectedSumColumns = [];
let geminiEnabled = false;
let currentGeminiExplanations = {};
const MAX_SUM_COLUMNS = 5;

/* =====================================
   MULTI-SELECT FUNCTIONALITY
===================================== */

function initMultiSelect() {
    const display = document.getElementById('sumColumnDisplay');
    const dropdown = document.getElementById('sumColumnDropdown');
    
    if (!display || !dropdown) return;
    
    display.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
        display.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!display.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
            display.classList.remove('open');
        }
    });
}

function updateSumColumnDisplay() {
    const display = document.getElementById('sumColumnDisplay');
    
    if (selectedSumColumns.length === 0) {
        display.innerHTML = '<span class="multi-select-placeholder">Click to select columns...</span>';
    } else {
        display.innerHTML = selectedSumColumns.map(col => `
            <span class="selected-tag">
                ${col}
                <span class="remove-tag" onclick="removeSumColumn('${col}'); event.stopPropagation();" title="Remove">×</span>
            </span>
        `).join('');
    }
    
    validateFixedForm();
}

function removeSumColumn(column) {
    selectedSumColumns = selectedSumColumns.filter(col => col !== column);
    updateSumColumnDisplay();
    populateSumDropdown();
}

function populateSumDropdown() {
    const dropdown = document.getElementById('sumColumnDropdown');
    const allNumeric = [...uploadedData.column_types.numeric, ...uploadedData.column_types.numeric_like_text];
    
    dropdown.innerHTML = allNumeric.map(col => {
        const isSelected = selectedSumColumns.includes(col);
        const isDisabled = !isSelected && selectedSumColumns.length >= MAX_SUM_COLUMNS;
        
        return `
            <div class="multi-select-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}" 
                 data-column="${col}"
                 onclick="toggleSumColumn('${col.replace(/'/g, "\\'")}')">
                <input type="checkbox" 
                       ${isSelected ? 'checked' : ''} 
                       ${isDisabled ? 'disabled' : ''}
                       onchange="event.stopPropagation(); toggleSumColumn('${col.replace(/'/g, "\\'")}');">
                ${col}
                ${isDisabled ? '<span style="margin-left: auto; font-size: 0.85rem; color: #999;">(Max 5)</span>' : ''}
            </div>
        `;
    }).join('');
}

function toggleSumColumn(column) {
    if (!selectedSumColumns.includes(column) && selectedSumColumns.length >= MAX_SUM_COLUMNS) {
        return;
    }
    
    const index = selectedSumColumns.indexOf(column);
    if (index > -1) {
        selectedSumColumns.splice(index, 1);
    } else {
        selectedSumColumns.push(column);
    }
    
    updateSumColumnDisplay();
    populateSumDropdown();
}

/* =====================================
   FILE UPLOAD HANDLERS
===================================== */

let uploadArea;
let fileInput;

function initializeFileUploadHandlers() {
    uploadArea = document.getElementById("uploadArea");
    fileInput = document.getElementById("fileInput");
    
    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener("click", () => fileInput.click());

    uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.classList.add("dragover");
    });

    uploadArea.addEventListener("dragleave", () => {
        uploadArea.classList.remove("dragover");
    });

    uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.classList.remove("dragover");
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    });

    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) handleFileUpload(file);
    });
}

function handleFileUpload(file) {
    const statusDiv = document.getElementById("uploadStatus");
    statusDiv.innerHTML = '<div class="spinner"></div>';

    const formData = new FormData();
    formData.append("file", file);

    fetch(`${ANOMALY_API}/upload`, {
        method: "POST",
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            statusDiv.innerHTML = `<div class="alert alert-danger">❌ ${data.error}</div>`;
            return;
        }

        sessionId = data.session_id;
        localStorage.setItem('currentSession', sessionId);
        uploadedData = data;
        geminiEnabled = data.gemini_enabled;
        displayUploadSuccess(data);
    })
    .catch(err => {
        statusDiv.innerHTML = `<div class="alert alert-danger">❌ Error: ${err.message}</div>`;
    });
}

function displayUploadSuccess(data) {
    const statusDiv = document.getElementById("uploadStatus");
    let aiStatus = geminiEnabled ? 
        '<span style="color: #28a745;">AI Explanations: Enabled</span>' : 
        '<span style="color: #c27d38;">AI Explanations: Disabled (Set GEMINI_API_KEY)</span>';
    
    statusDiv.innerHTML = `
        <div class="alert alert-success">
            ✓ File uploaded successfully! ${aiStatus}
        </div>
    `;

    // Modern SVG Icons: Rows, Columns, HardDrive (Memory), Hash (Numeric)
    const iconRows = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b83227" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>`;
    const iconCols = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b83227" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`;
    const iconMemory = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b83227" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/></svg>`;
    const iconHash = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b83227" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>`;

    const statsGrid = document.getElementById("statsGrid");
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                ${iconRows}
                <div class="stat-value" style="font-size: 1.6rem; font-weight: 700; color: #2c3e50;">${data.stats.rows.toLocaleString()}</div>
            </div>
            <div class="stat-label">TOTAL ROWS</div>
        </div>
        <div class="stat-card">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                ${iconCols}
                <div class="stat-value" style="font-size: 1.6rem; font-weight: 700; color: #2c3e50;">${data.stats.columns}</div>
            </div>
            <div class="stat-label">COLUMNS</div>
        </div>
        <div class="stat-card">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                ${iconMemory}
                <div class="stat-value" style="font-size: 1.6rem; font-weight: 700; color: #2c3e50;">${data.stats.memory_mb.toFixed(1)} MB</div>
            </div>
            <div class="stat-label">MEMORY</div>
        </div>
        <div class="stat-card">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                ${iconHash}
                <div class="stat-value" style="font-size: 1.6rem; font-weight: 700; color: #2c3e50;">${data.stats.numeric_cols}</div>
            </div>
            <div class="stat-label">NUMERIC COLUMNS</div>
        </div>
    `;
    statsGrid.classList.remove("hidden");

    // Clear step 4 results when uploading new file
    const step4 = document.getElementById('step4');
    const geminiSummary = document.getElementById('geminiSummary');
    if (geminiSummary) geminiSummary.remove();
    document.getElementById('anomalyTableContainer').innerHTML = '';
    document.getElementById('resultsStats').innerHTML = '';
    if (document.getElementById('chartDiv')) {
        Plotly.purge('chartDiv');
        document.getElementById('chartDiv').innerHTML = '';
    }
    step4.classList.add('hidden');
    
    // Clear Gemini explanations
    currentGeminiExplanations = {};

    document.getElementById("modeSelector").classList.remove("hidden");
    document.getElementById("modeSelector").scrollIntoView({ behavior: 'smooth' });
}

/* =====================================
   MODE SELECTION
===================================== */

function showConfigForMode(mode) {
    const autoModeMsg = document.getElementById("autoModeMessage");
    const fixedConfig = document.getElementById("fixedConfig");
    const analyzeBtnContainer = document.getElementById("analyzeBtnContainer");
    const step3 = document.getElementById("step3");
    const analyzeBtn = document.getElementById("analyzeBtn");

    // Hide elements safely
    if (autoModeMsg) autoModeMsg.classList.add("hidden");
    if (fixedConfig) fixedConfig.classList.add("hidden");
    if (analyzeBtnContainer) analyzeBtnContainer.classList.add("hidden");

    if (mode === "AUTO") {
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.style.display = 'inline-flex';
        }

        // Hide Step 3 title and section for AUTO mode
        if (step3) step3.classList.add("hidden");

        // Show analyze button in separate container
        if (analyzeBtnContainer) {
            analyzeBtnContainer.classList.remove("hidden");
            analyzeBtnContainer.scrollIntoView({ behavior: 'smooth' });
        }

    } else if (mode === "FIXED") {
        if (step3) {
            step3.classList.remove("hidden");
            step3.scrollIntoView({ behavior: 'smooth' });
        }

        if (fixedConfig) {
            fixedConfig.classList.remove("hidden");
            populateFixedConfig();
        }

        if (analyzeBtn) analyzeBtn.disabled = true;
        if (analyzeBtnContainer) analyzeBtnContainer.classList.remove("hidden");
    }
}

/* =====================================
   FIXED MODE CONFIGURATION
===================================== */

function populateFixedConfig() {
    const data = uploadedData;

    initMultiSelect();
    selectedSumColumns = [];

    const groupBySelect = document.getElementById("groupByColumn");
    groupBySelect.innerHTML = '<option value="">-- Select Column --</option>';
    data.column_types.text.forEach(col => {
        groupBySelect.innerHTML += `<option value="${col}">${col}</option>`;
    });

    populateSumDropdown();

    const freqSelect = document.getElementById("frequencyColumn");
    freqSelect.innerHTML = '<option value="">-- Select Column --</option>';
    const allCols = [...data.column_types.text, ...data.column_types.numeric];
    allCols.forEach(col => {
        freqSelect.innerHTML += `<option value="${col}">${col}</option>`;
    });

    groupBySelect.addEventListener('change', validateFixedForm);
    freqSelect.addEventListener('change', validateFixedForm);
}

function validateFixedForm() {
    const groupBy = document.getElementById('groupByColumn').value;
    const freqCol = document.getElementById('frequencyColumn').value;
    
    const hasMetric = selectedSumColumns.length > 0 || freqCol;
    document.getElementById('analyzeBtn').disabled = !(groupBy && hasMetric);
}

/* =====================================
   ANALYZE BUTTON
===================================== */

function runAnalysis() {
    const btn = document.getElementById("analyzeBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width: 18px; height: 18px; border-width: 2.5px;"></span> Analyzing...';

    let config = {
        session_id: sessionId,
        mode: currentMode
    };

    if (currentMode === 'FIXED') {
        config.groupby_col = document.getElementById('groupByColumn').value;
        config.sum_cols = selectedSumColumns;
        config.frequency_cols = document.getElementById('frequencyColumn').value ? 
            [document.getElementById('frequencyColumn').value] : [];
    }

    fetch(`${ANOMALY_API}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showError(data.error);
            btn.innerHTML = '🔍 Run Anomaly Detection';
            btn.disabled = false;
            return;
        }
        
        currentGeminiExplanations = data.gemini_explanations || {};
        displayResults(data);
        btn.innerHTML = '🔍 Run Anomaly Detection';
    })
    .catch(err => {
        showError('Network error: ' + err.message);
        btn.innerHTML = '🔍 Run Anomaly Detection';
        btn.disabled = false;
    });
}

function showError(errorMessage) {
    let errorDiv = document.getElementById('analysisError');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'analysisError';
        document.getElementById('step3').appendChild(errorDiv);
    }
    
    let helpText = '';
    
    if (errorMessage.includes('at least') && errorMessage.includes('entities')) {
        helpText = `<br><br><strong>💡 How to fix this:</strong>
            <ul style="margin: 10px 0; padding-left: 20px; text-align: left;">
                <li>Choose a different <strong>grouping column</strong> that has more unique values</li>
                <li>Try a column like Customer ID, Invoice Number, or Product Code</li>
                <li>In <strong>AUTO mode</strong>, the system will find the best grouping column</li>
            </ul>`;
    }
    
    // errorDiv.innerHTML = `
    //     <div class="alert alert-danger" style="margin-top: 1.5rem;">
    //         <strong>❌ Analysis Error</strong><br>
    //         ${errorMessage}
    //         ${helpText}
    //     </div>
    // `;
    
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function buildStatsCardsHTML(summary, featureCount) {
    return `
        <div class="stat-card">
            <div class="stat-value num">${summary.total_entities}</div>
            <div class="stat-label">Total Entities</div>
        </div>
        <div class="stat-card">
            <div class="stat-value num">${summary.strong_anomalies}</div>
            <div class="stat-label">Anomalies Found</div>
        </div>
        <div class="stat-card">
            <div class="stat-value num">${summary.anomaly_rate.toFixed(1)}%</div>
            <div class="stat-label">Anomaly Rate</div>
        </div>
        <div class="stat-card">
            <div class="stat-value num">${featureCount}</div>
            <div class="stat-label">Features Used</div>
        </div>
    `;
}

function buildAnomalyTableHTML(anomalies, idCol) {
    if (anomalies.length === 0) {
        return '<div class="alert alert-success">No strong anomalies detected. Your data looks healthy.</div>';
    }

    const columns = Object.keys(anomalies[0]);
    let html = '<h3 class="ttl">Detected Anomalies</h3>';
    html += '<div class="table-wrapper"><table><thead><tr>';
    html += `<th class="anomaly-id-col">${idCol}</th>`;

    columns.forEach(col => {
        if (col !== 'ANOMALY_REASON' && col !== idCol) {
            html += `<th>${col}</th>`;
        }
    });

    html += '<th class="anomaly-reason-col">Quick Detection</th></tr></thead><tbody>';

    anomalies.forEach((row) => {
        html += '<tr>';
        html += `<td class="anomaly-id-col">${row[idCol]}</td>`;

        columns.forEach(col => {
            if (col !== 'ANOMALY_REASON' && col !== idCol) {
                const value = typeof row[col] === 'number' ? row[col].toLocaleString() : row[col];
                html += `<td>${value}</td>`;
            }
        });

        html += `<td class="anomaly-reason-col">${row['ANOMALY_REASON']}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
}

function getChartLayout(featureCols) {
    return {
        title: {
            text: 'Anomaly Distribution Map',
            font: { size: 14, family: 'Poppins, sans-serif', color: '#241c1b' }
        },
        xaxis: {
            title: (featureCols[0] || 'Feature 1').replace('TOTAL_', '').replace('FREQ_', '').replace(/_/g, ' '),
            gridcolor: '#ece6df'
        },
        yaxis: {
            title: (featureCols[1] || 'Feature 2').replace('TOTAL_', '').replace('FREQ_', '').replace(/_/g, ' '),
            gridcolor: '#ece6df'
        },
        plot_bgcolor: '#f6f3ee',
        paper_bgcolor: '#ffffff',
        hovermode: 'closest',
        margin: { l: 60, r: 40, t: 60, b: 60 }
    };
}

function buildDetailsAlertHTML(groupingLabel, featureCols) {
    return `
        <div class="anomaly-alert anomaly-alert-info anomaly-details-alert">
            <strong>Analysis Details</strong><br>
            <strong>Grouping Column:</strong> ${groupingLabel}<br>
            <strong>Features:</strong> ${featureCols.join(', ')}
        </div>
    `;
}

function buildAiSummaryHTML(title, summary) {
    return `
        <div class="card anomaly-ai-summary">
            <div class="card-h">
                <div class="grow">
                    <h3 class="ttl">${title}</h3>
                </div>
            </div>
            <div class="card-b">${formatMarkdown(summary)}</div>
        </div>
    `;
}

function displayResults(data) {
    const errorDiv = document.getElementById('analysisError');
    if (errorDiv) errorDiv.remove();

    const step4 = document.getElementById('step4');
    const resultsStats = document.getElementById('resultsStats');
    const geminiSummary = document.getElementById('geminiSummary');
    const anomalyTableContainer = document.getElementById('anomalyTableContainer');
    const mainChartContainer = document.getElementById('mainChartContainer');
    const chartDiv = document.getElementById('chartDiv');

    if (geminiSummary) geminiSummary.remove();
    document.querySelectorAll('.anomaly-details-alert').forEach(el => el.remove());

    if (anomalyTableContainer) {
        anomalyTableContainer.innerHTML = '';
        anomalyTableContainer.classList.remove('no-border');
    }

    if (chartDiv) {
        Plotly.purge('chartDiv');
        chartDiv.innerHTML = '';
    }

    step4.classList.remove('hidden');
    step4.scrollIntoView({ behavior: 'smooth' });

    if (data.is_multi_mode) {
        if (resultsStats) {
            resultsStats.innerHTML = '';
            resultsStats.classList.add('hidden');
        }
        if (mainChartContainer) mainChartContainer.classList.add('hidden');
        if (anomalyTableContainer) anomalyTableContainer.classList.add('no-border');
        step4.querySelector('#resultsHelpAlert')?.classList.add('hidden');
        step4.querySelector('#resultsTableHeading')?.classList.add('hidden');
        displayMultipleResults(data.results);
    } else {
        if (resultsStats) resultsStats.classList.remove('hidden');
        if (mainChartContainer) mainChartContainer.classList.remove('hidden');
        step4.querySelector('#resultsHelpAlert')?.classList.remove('hidden');
        step4.querySelector('#resultsTableHeading')?.classList.remove('hidden');
        displaySingleResult(data);
    }

    if (geminiEnabled) {
        document.getElementById('qaSection').classList.remove('hidden');
    }
}

function displaySingleResult(results) {
    if (results.gemini_summary) {
        displayGeminiSummary(results.gemini_summary);
    }

    const statsDiv = document.getElementById('resultsStats');
    statsDiv.innerHTML = buildStatsCardsHTML(results.summary, results.feature_cols.length);
    statsDiv.insertAdjacentHTML('afterend', buildDetailsAlertHTML(results.id_col, results.feature_cols));

    renderTable(results.anomalies, results.id_col, results.gemini_explanations);
    renderChart(results.chart_data, results.feature_cols);
}

function displayMultipleResults(resultsArray) {
    const anomalyTableContainer = document.getElementById('anomalyTableContainer');

    const multiResultsContainer = document.createElement('div');
    multiResultsContainer.id = 'multiResultsContainer';

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'results-tabs-container';

    resultsArray.forEach((result, index) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `results-tab${index === 0 ? ' active' : ''}`;
        tab.textContent = result.groupby_col;
        tab.addEventListener('click', () => showResultTab(index, resultsArray));
        tabsContainer.appendChild(tab);
    });

    anomalyTableContainer.appendChild(tabsContainer);
    anomalyTableContainer.appendChild(multiResultsContainer);

    showResultTab(0, resultsArray);
}

function showResultTab(activeIndex, resultsArray) {
    const multiResultsContainer = document.getElementById('multiResultsContainer');
    multiResultsContainer.innerHTML = '';

    const result = resultsArray[activeIndex];

    document.querySelectorAll('.results-tab').forEach((tab, index) => {
        tab.classList.toggle('active', index === activeIndex);
    });

    const resultBlock = document.createElement('div');
    resultBlock.className = 'result-block';
    resultBlock.innerHTML =
        `<div class="anomaly-stats-grid">${buildStatsCardsHTML(result.summary, result.feature_cols.length)}</div>` +
        buildDetailsAlertHTML(result.groupby_col, result.feature_cols);
    multiResultsContainer.appendChild(resultBlock);

    if (result.gemini_summary) {
        const summaryDiv = document.createElement('div');
        summaryDiv.innerHTML = buildAiSummaryHTML(`AI Summary for ${result.groupby_col}`, result.gemini_summary);
        multiResultsContainer.appendChild(summaryDiv.firstElementChild);
    }

    const tableDiv = document.createElement('div');
    tableDiv.className = 'anomalies-table-section';
    multiResultsContainer.appendChild(tableDiv);
    renderResultTable(result.anomalies, result.id_col, tableDiv);

    const chartWrap = document.createElement('div');
    chartWrap.className = 'anomaly-chart-container';
    const chartDiv = document.createElement('div');
    chartDiv.className = 'anomaly-result-chart';
    chartDiv.id = `chartDiv-${activeIndex}`;
    chartWrap.appendChild(chartDiv);
    multiResultsContainer.appendChild(chartWrap);

    setTimeout(() => {
        renderResultChart(result.chart_data, result.feature_cols, chartDiv.id);
    }, 50);
}

function renderResultTable(anomalies, idCol, tableDiv) {
    tableDiv.innerHTML = buildAnomalyTableHTML(anomalies, idCol);
}

function renderResultChart(chartData, featureCols, chartId) {
    const chartContainer = document.getElementById(chartId);
    if (!chartContainer) return;

    chartContainer.innerHTML = '';

    const trace = {
        x: chartData.x,
        y: chartData.y,
        mode: 'markers',
        type: 'scatter',
        text: chartData.labels,
        hovertemplate: '<b>%{text}</b><br>' +
                      (featureCols[0] || 'Feature 1') + ': %{x:.2f}<br>' +
                      (featureCols[1] || 'Feature 2') + ': %{y:.2f}<br>' +
                      '<extra>%{customdata}</extra>',
        customdata: chartData.reasons,
        marker: {
            size: chartData.sizes,
            color: chartData.colors,
            line: { color: 'white', width: 2 }
        }
    };

    Plotly.newPlot(chartId, [trace], getChartLayout(featureCols), {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    });

    setTimeout(() => {
        Plotly.Plots.resize(chartId);
    }, 100);
}

function displayGeminiSummary(summary) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildAiSummaryHTML('AI Executive Summary', summary);
    const summaryEl = wrapper.firstElementChild;
    summaryEl.id = 'geminiSummary';

    const statsDiv = document.getElementById('resultsStats');
    statsDiv.insertAdjacentElement('afterend', summaryEl);
}

function renderTable(anomalies, idCol) {
    const tableDiv = document.getElementById('anomalyTableContainer');
    tableDiv.innerHTML = buildAnomalyTableHTML(anomalies, idCol);
}

function renderChart(chartData, featureCols) {
    const chartDiv = document.getElementById('chartDiv');
    if (chartDiv) {
        Plotly.purge('chartDiv');
        chartDiv.innerHTML = '';
    }

    const trace = {
        x: chartData.x,
        y: chartData.y,
        mode: 'markers',
        type: 'scatter',
        text: chartData.labels,
        hovertemplate: '<b>%{text}</b><br>' +
                      (featureCols[0] || 'Feature 1') + ': %{x:.2f}<br>' +
                      (featureCols[1] || 'Feature 2') + ': %{y:.2f}<br>' +
                      '<extra>%{customdata}</extra>',
        customdata: chartData.reasons,
        marker: {
            size: chartData.sizes,
            color: chartData.colors,
            line: { color: 'white', width: 2 }
        }
    };

    Plotly.newPlot('chartDiv', [trace], getChartLayout(featureCols), {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    });

    setTimeout(() => {
        Plotly.Plots.resize('chartDiv');
    }, 100);
}

/* =====================================
   Q&A FUNCTIONALITY
===================================== */

function askQuestion() {
    const input = document.getElementById('questionInput');
    const question = input.value.trim();
    
    if (!question) return;
    
    const qaHistory = document.getElementById('qaHistory');
    
    const userMsg = document.createElement('div');
    userMsg.className = 'qa-message user-message';
    userMsg.innerHTML = `<strong>You:</strong> ${question}`;
    qaHistory.appendChild(userMsg);
    
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'qa-message ai-message';
    loadingMsg.innerHTML = '<div class="spinner" style="width: 20px; height: 20px;"></div> Thinking...';
    qaHistory.appendChild(loadingMsg);
    
    input.value = '';
    qaHistory.scrollTop = qaHistory.scrollHeight;
    
    fetch(`${ANOMALY_API}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            session_id: sessionId,
            question: question
        })
    })
    .then(res => res.json())
    .then(data => {
        loadingMsg.remove();
        
        const aiMsg = document.createElement('div');
        aiMsg.className = 'qa-message ai-message';
        aiMsg.innerHTML = `<strong>AI Assistant:</strong><br>${formatMarkdown(data.answer)}`;
        qaHistory.appendChild(aiMsg);
        
        qaHistory.scrollTop = qaHistory.scrollHeight;
    })
    .catch(err => {
        loadingMsg.remove();
        
        const errorMsg = document.createElement('div');
        errorMsg.className = 'qa-message ai-message';
        errorMsg.innerHTML = `<strong>❌ Error:</strong> ${err.message}`;
        qaHistory.appendChild(errorMsg);
    });
}

function formatMarkdown(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n- /g, '<br>• ')
        .replace(/\n\d+\. /g, '<br>$&')
        .replace(/\n/g, '<br>');
}

/* =====================================
   EXPORT BUTTONS
===================================== */

function initializeExportButtons() {
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');

    if (!exportCsvBtn || !exportExcelBtn) return;

    const freshCsvBtn = exportCsvBtn.cloneNode(true);
    const freshExcelBtn = exportExcelBtn.cloneNode(true);
    exportCsvBtn.replaceWith(freshCsvBtn);
    exportExcelBtn.replaceWith(freshExcelBtn);

    freshCsvBtn.addEventListener('click', () => {
        window.location.href = `${ANOMALY_API}/export/csv/${sessionId}`;
    });

    freshExcelBtn.addEventListener('click', () => {
        window.location.href = `${ANOMALY_API}/export/excel/${sessionId}`;
    });
}

/* =====================================
   INITIALIZATION
===================================== */

function initializeAnomalyDetectionHandlers() {
    sessionId = null;
    currentMode = null;
    uploadedData = null;
    selectedSumColumns = [];
    geminiEnabled = false;
    currentGeminiExplanations = {};

    initializeFileUploadHandlers();
    initializeExportButtons();

    document.querySelectorAll(".anomaly-mode-option").forEach(option => {
        option.replaceWith(option.cloneNode(true));
    });
    document.querySelectorAll(".anomaly-mode-option").forEach(option => {
        option.addEventListener("click", function() {
            document.querySelectorAll(".anomaly-mode-option").forEach(o => o.classList.remove("selected"));
            this.classList.add("selected");
            currentMode = this.dataset.mode;
            showConfigForMode(currentMode);
        });
    });

    const analyzeBtn = document.getElementById("analyzeBtn");
    if (analyzeBtn) {
        const freshAnalyzeBtn = analyzeBtn.cloneNode(true);
        analyzeBtn.replaceWith(freshAnalyzeBtn);
        freshAnalyzeBtn.addEventListener("click", runAnalysis);
    }

    const askBtn = document.getElementById('askBtn');
    const questionInput = document.getElementById('questionInput');
    if (askBtn) {
        const freshAskBtn = askBtn.cloneNode(true);
        askBtn.replaceWith(freshAskBtn);
        freshAskBtn.addEventListener('click', askQuestion);
    }
    if (questionInput) {
        questionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') askQuestion();
        });
    }
}