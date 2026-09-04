document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const previewWrap = document.getElementById('previewWrap');
  const previewImg = document.getElementById('previewImg');
  const runBtn = document.getElementById('runBtn');
  const warnBox = document.getElementById('warnBox');
  const reportArea = document.getElementById('reportArea');

  if (!dropzone || !fileInput) return;

  let selectedFile = null;

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      handleFile(fileInput.files[0]);
    }
  });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      warnBox.innerHTML = `<div style="margin-top:12px; background:#fff4e5; border:1px solid #f3d9a8; color:#8a5a00; padding:10px; border-radius:6px; font-size:13px;">⚠️ Please upload a valid image file.</div>`;
      return;
    }
    selectedFile = file;
    warnBox.innerHTML = '';

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewWrap.style.display = 'block';
      runBtn.disabled = false;
      reportArea.innerHTML = `<div style="color:var(--muted); font-size:14px; padding:40px 10px; text-align:center;">Click "Process" to analyze this document.</div>`;
    };
    reader.readAsDataURL(file);
  }

  runBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    runBtn.disabled = true;
    reportArea.innerHTML = `
      <div class="spinner-wrap">
        <span class="spinner"></span>
        Analyzing document structure, pixel textures, and text logic...
      </div>`;

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);

      const resp = await fetch('/analyze', {
        method: 'POST',
        body: formData
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      if (!data.report) throw new Error('Empty response from server.');

      renderReport(data.report);
    } catch (err) {
      reportArea.innerHTML = `<div style="margin-top:12px; background:#fdeaea; border:1px solid #f3b8b8; color:#8a1414; padding:10px; border-radius:6px; font-size:13px;">❌ Pipeline Execution Failure: ${escapeHtml(err.message)}</div>`;
    } finally {
      runBtn.disabled = false;
    }
  });

  function renderReport(text) {
    const upper = text.toUpperCase();
    let verdictClass = 'verdict-unknown';
    let verdictLabel = 'Analysis Complete';
    
    if (upper.includes('FAILED') || upper.includes('TAMPERED')) {
      verdictClass = 'verdict-fail';
      verdictLabel = 'Tampering Detected';
    } else if (upper.includes('PASSED') || upper.includes('AUTHENTIC')) {
      verdictClass = 'verdict-pass';
      verdictLabel = 'Document Authentic';
    }

    reportArea.innerHTML = `
      <span class="verdict-badge ${verdictClass}">${verdictLabel}</span>
      <div class="report-body">${escapeHtml(text)}</div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});