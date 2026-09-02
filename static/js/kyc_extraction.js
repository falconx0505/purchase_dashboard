// Initialize KYC Extraction handlers - called dynamically after HTML loads
function initializeKycExtractionHandlers() {
  const folderInput = document.getElementById('folderInput');
  const fileCount = document.getElementById('fileCount');
  const processBtn = document.getElementById('processBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const statusBox = document.getElementById('statusBox');
  const statusText = document.getElementById('statusText');
  const progressBar = document.getElementById('progressBar');
  const resultsCard = document.getElementById('resultsCard');
  const resultsTbody = document.getElementById('resultsTbody');

  // Exit if elements don't exist
  if (!folderInput || !processBtn) return;

  let processedRecords = [];

  // Folder selection listener
  folderInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      fileCount.textContent = `${files.length} file(s) selected`;
      processBtn.disabled = false;
    } else {
      fileCount.textContent = 'No folder chosen';
      processBtn.disabled = true;
    }
  });

  // Extract document type
  function detectDocumentType(text) {
    const t = text.toUpperCase();
    if (t.includes("AADHAAR") || t.includes("UIDAI")) return "Aadhaar Card";
    if (t.includes("INCOME TAX DEPARTMENT") || t.includes("PERMANENT ACCOUNT NUMBER")) return "PAN Card";
    return "Unknown";
  }

  // Extraction regex patterns
  function extractAadhaarNumber(text) {
    const match = text.match(/\b\d{4}\s\d{4}\s\d{4}\b/);
    return match ? match[0].replace(/\s/g, '') : '';
  }

  function extractPanNumber(text) {
    const match = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
    return match ? match[0] : '';
  }

  function normalizeNameValue(value, docType) {
    let cleaned = value.replace(/[^A-Za-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/^(NAME|NAME OF CARDHOLDER|CARDHOLDER|CARD HOLDER)\s*[:\-]?\s*/i, '');
    cleaned = cleaned.replace(/^(FATHER|MOTHER|HUSBAND|WIFE)(?:\s*S NAME)?\s*[:\-]?\s*/i, '');

    // Strip common noise words picked up by OCR around the name field
    const noiseWords = new Set([
      'HER', 'HIS', 'SON', 'DAUGHTER', 'WIFE', 'FATHER', 'MOTHER', 'HUSBAND',
      'CARD', 'NAME', 'GOVT', 'GOVERNMENT', 'INDIA', 'OF', 'S', 'D', 'W', 'C', 'O'
    ]);
    let words = cleaned.split(/\s+/).filter(w => w && !noiseWords.has(w.toUpperCase()));

    // PAN cards print the name in ALL CAPS on the physical document, so a
    // mixed-case word (e.g. "Mego") is almost always OCR noise there.
    // Aadhaar cards print names in regular mixed case, so this filter
    // must NOT be applied there or it strips the real name.
    if (docType === 'PAN Card') {
      words = words.filter(w => w.length === 1 || w === w.toUpperCase());
    }

    // Strip isolated single-character tokens (OCR artifacts) from start/end
    while (words.length && words[0].length === 1) words.shift();
    while (words.length && words[words.length - 1].length === 1) words.pop();

    return words.join(' ').trim();
  }

  function isNameCandidate(value, docType) {
    const cleaned = normalizeNameValue(value, docType);
    if (!cleaned) return false;
    const words = cleaned.split(/\s+/);
    if (words.length < 2) return false;
    if (/\d/.test(cleaned)) return false;

    const blocked = [
      'AADHAAR', 'UIDAI', 'INCOME TAX', 'DEPARTMENT', 'GOVT', 'GOVERNMENT', 'INDIA',
      'PERMANENT', 'ACCOUNT', 'NUMBER', 'CARD', 'SIGNATURE', 'FATHER', 'MOTHER',
      'HUSBAND', 'WIFE', 'DOB', 'DATE OF BIRTH', 'YOB', 'MALE', 'FEMALE', 'GENDER',
      'ENROLLMENT', 'ADDRESS', 'PHONE', 'MOBILE', 'UNIQUE', 'IDENTIFICATION', 'AUTHORITY', 'PAN'
    ];
    const upper = cleaned.toUpperCase();
    if (blocked.some(kw => upper.includes(kw))) return false;

    return true;
  }

  function titleCaseName(value) {
    return value.toLowerCase().split(/\s+/).filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  function extractPersonName(text, docType) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const relationRe = /\b(FATHER|MOTHER|HUSBAND|WIFE)\b/i;
    const panNumRe = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;

    // 1) Look for an explicit "Name" header line — but NOT "Father's/Mother's/... Name"
    for (let i = 0; i < lines.length; i++) {
      const isNameHeader = /\bNAME\b/i.test(lines[i]);
      if (isNameHeader && !relationRe.test(lines[i])) {
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          if (relationRe.test(lines[j])) break;
          const candidate = normalizeNameValue(lines[j], docType);
          if (isNameCandidate(candidate, docType)) return titleCaseName(candidate);
        }
        const sameLine = normalizeNameValue(lines[i], docType);
        if (isNameCandidate(sameLine, docType)) return titleCaseName(sameLine);
      }
    }

    if (docType === 'PAN Card') {
      // 2a) The name reliably sits on the line right after the PAN number line
      for (let i = 0; i < lines.length; i++) {
        if (panNumRe.test(lines[i])) {
          for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
            if (relationRe.test(lines[j])) break;
            const candidate = normalizeNameValue(lines[j], docType);
            if (isNameCandidate(candidate, docType)) {
              // The name field on this card layout is 2-3 words; anything
              // beyond that is consistently OCR noise bleeding in from a
              // watermark, regardless of whether it comes back upper or
              // mixed case. Cap it here rather than relying on casing.
              return titleCaseName(candidate.split(' ').slice(0, 3).join(' '));
            }
          }
          break;
        }
      }

      // 2b) Fallback: scan backward from "Father's Name" header, skipping noise lines
      for (let i = 0; i < lines.length; i++) {
        if (relationRe.test(lines[i])) {
          for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
            if (panNumRe.test(lines[j])) break;
            const candidate = normalizeNameValue(lines[j], docType);
            if (isNameCandidate(candidate, docType)) return titleCaseName(candidate);
          }
          break;
        }
      }
    }

    if (docType === 'Aadhaar Card') {
      // 3) Aadhaar-style: line just above DOB/Gender
      for (let i = 0; i < lines.length; i++) {
        if (/(DOB|DATE OF BIRTH|YOB|MALE|FEMALE)/i.test(lines[i]) && i > 0) {
          const prev = normalizeNameValue(lines[i - 1], docType);
          if (isNameCandidate(prev, docType)) return titleCaseName(prev);
        }
      }
    }

    // 4) Fallback: first plausible alphabetic 2+ word line
    for (let line of lines) {
      const candidate = normalizeNameValue(line, docType);
      if (isNameCandidate(candidate, docType)) return titleCaseName(candidate);
    }

    return '';
  }

  function appendTableRow(rec) {
    const tr = document.createElement('tr');
    const tagClass = rec["Document Type"] === 'Aadhaar Card' ? 'ok' : rec["Document Type"] === 'PAN Card' ? 'warn' : 'flag';
    
    tr.innerHTML = `
      <td class="grp">${rec["File Name"]}</td>
      <td><span class="tag ${tagClass}">${rec["Document Type"]}</span></td>
      <td class="num">${rec["Document Number"]}</td>
      <td>${rec["Person Name"]}</td>
    `;
    resultsTbody.appendChild(tr);
  }

  // OCR Execution
  processBtn.addEventListener('click', async () => {
    const files = Array.from(folderInput.files).filter(f => /\.(jpe?g|png|bmp)$/i.test(f.name));
    
    if (files.length === 0) {
      alert("Please select a folder containing image files (.jpg, .png).");
      return;
    }

    processedRecords = [];
    resultsTbody.innerHTML = '';
    statusBox.classList.add('active');
    processBtn.disabled = true;

    // Check if Tesseract is available
    if (typeof Tesseract === 'undefined') {
      statusText.textContent = 'Error: Tesseract OCR library not loaded. Please check your browser console.';
      processBtn.disabled = false;
      return;
    }

    try {
      const worker = await Tesseract.createWorker('eng');

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pct = Math.round(((i + 1) / files.length) * 100);
        
        statusText.textContent = `Processing file ${i + 1} of ${files.length}: ${file.name}`;
        progressBar.style.width = `${pct}%`;

        try {
          const ret = await worker.recognize(file);
          const text = ret.data.text;
          const docType = detectDocumentType(text);
          
          let docNum = '';
          if (docType === 'Aadhaar Card') docNum = extractAadhaarNumber(text);
          else if (docType === 'PAN Card') docNum = extractPanNumber(text);

          const name = extractPersonName(text, docType);

          const record = {
            "File Name": file.name,
            "Document Type": docType,
            "Document Number": docNum,
            "Person Name": name
          };

          processedRecords.push(record);
          appendTableRow(record);

        } catch (err) {
          console.error(err);
          const errRecord = {
            "File Name": file.name,
            "Document Type": "Error",
            "Document Number": "",
            "Person Name": ""
          };
          processedRecords.push(errRecord);
          appendTableRow(errRecord);
        }
      }

      await worker.terminate();

      statusText.textContent = `Processing completed successfully! ${processedRecords.length} record(s) extracted.`;
      downloadBtn.style.display = 'inline-block';
      resultsCard.classList.add('active');
    } catch (err) {
      console.error('OCR Error:', err);
      statusText.textContent = `Error during processing: ${err.message}`;
      processBtn.disabled = false;
    }
  });

  // Excel Export Generator
  downloadBtn.addEventListener('click', () => {
    if (processedRecords.length === 0) return;

    // Check if XLSX is available
    if (typeof XLSX === 'undefined') {
      alert('Error: XLSX library not loaded. Please check your browser console.');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(processedRecords);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "KYC_Extraction");

    // Auto-fit column widths
    worksheet['!cols'] = [
      { wch: 30 },
      { wch: 18 },
      { wch: 22 },
      { wch: 25 }
    ];

    XLSX.writeFile(workbook, "id_extracted_data.xlsx");
  });
}

// Auto-initialize if HTML is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeKycExtractionHandlers);
} else {
  // Try to initialize immediately (in case HTML is already in DOM from dynamic load)
  if (document.getElementById('folderInput')) {
    initializeKycExtractionHandlers();
  }
}

    // Extract document type
    function detectDocumentType(text) {
      const t = text.toUpperCase();
      if (t.includes("AADHAAR") || t.includes("UIDAI")) return "Aadhaar Card";
      if (t.includes("INCOME TAX DEPARTMENT") || t.includes("PERMANENT ACCOUNT NUMBER")) return "PAN Card";
      return "Unknown";
    }

    // Extraction regex patterns
    function extractAadhaarNumber(text) {
      const match = text.match(/\b\d{4}\s\d{4}\s\d{4}\b/);
      return match ? match[0].replace(/\s/g, '') : '';
    }

    function extractPanNumber(text) {
      const match = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
      return match ? match[0] : '';
    }

    function normalizeNameValue(value, docType) {
      let cleaned = value.replace(/[^A-Za-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
      cleaned = cleaned.replace(/^(NAME|NAME OF CARDHOLDER|CARDHOLDER|CARD HOLDER)\s*[:\-]?\s*/i, '');
      cleaned = cleaned.replace(/^(FATHER|MOTHER|HUSBAND|WIFE)(?:\s*S NAME)?\s*[:\-]?\s*/i, '');

      // Strip common noise words picked up by OCR around the name field
      const noiseWords = new Set([
        'HER', 'HIS', 'SON', 'DAUGHTER', 'WIFE', 'FATHER', 'MOTHER', 'HUSBAND',
        'CARD', 'NAME', 'GOVT', 'GOVERNMENT', 'INDIA', 'OF', 'S', 'D', 'W', 'C', 'O'
      ]);
      let words = cleaned.split(/\s+/).filter(w => w && !noiseWords.has(w.toUpperCase()));

      // PAN cards print the name in ALL CAPS on the physical document, so a
      // mixed-case word (e.g. "Mego") is almost always OCR noise there.
      // Aadhaar cards print names in regular mixed case, so this filter
      // must NOT be applied there or it strips the real name.
      if (docType === 'PAN Card') {
        words = words.filter(w => w.length === 1 || w === w.toUpperCase());
      }

      // Strip isolated single-character tokens (OCR artifacts) from start/end
      while (words.length && words[0].length === 1) words.shift();
      while (words.length && words[words.length - 1].length === 1) words.pop();

      return words.join(' ').trim();
    }

    function isNameCandidate(value, docType) {
      const cleaned = normalizeNameValue(value, docType);
      if (!cleaned) return false;
      const words = cleaned.split(/\s+/);
      if (words.length < 2) return false;
      if (/\d/.test(cleaned)) return false;

      const blocked = [
        'AADHAAR', 'UIDAI', 'INCOME TAX', 'DEPARTMENT', 'GOVT', 'GOVERNMENT', 'INDIA',
        'PERMANENT', 'ACCOUNT', 'NUMBER', 'CARD', 'SIGNATURE', 'FATHER', 'MOTHER',
        'HUSBAND', 'WIFE', 'DOB', 'DATE OF BIRTH', 'YOB', 'MALE', 'FEMALE', 'GENDER',
        'ENROLLMENT', 'ADDRESS', 'PHONE', 'MOBILE', 'UNIQUE', 'IDENTIFICATION', 'AUTHORITY', 'PAN'
      ];
      const upper = cleaned.toUpperCase();
      if (blocked.some(kw => upper.includes(kw))) return false;

      return true;
    }

    function titleCaseName(value) {
      return value.toLowerCase().split(/\s+/).filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    function extractPersonName(text, docType) {
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const relationRe = /\b(FATHER|MOTHER|HUSBAND|WIFE)\b/i;
      const panNumRe = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;

      // 1) Look for an explicit "Name" header line — but NOT "Father's/Mother's/... Name"
      for (let i = 0; i < lines.length; i++) {
        const isNameHeader = /\bNAME\b/i.test(lines[i]);
        if (isNameHeader && !relationRe.test(lines[i])) {
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            if (relationRe.test(lines[j])) break;
            const candidate = normalizeNameValue(lines[j], docType);
            if (isNameCandidate(candidate, docType)) return titleCaseName(candidate);
          }
          const sameLine = normalizeNameValue(lines[i], docType);
          if (isNameCandidate(sameLine, docType)) return titleCaseName(sameLine);
        }
      }

      if (docType === 'PAN Card') {
        // 2a) The name reliably sits on the line right after the PAN number line
        for (let i = 0; i < lines.length; i++) {
          if (panNumRe.test(lines[i])) {
            for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
              if (relationRe.test(lines[j])) break;
              const candidate = normalizeNameValue(lines[j], docType);
              if (isNameCandidate(candidate, docType)) {
                // The name field on this card layout is 2-3 words; anything
                // beyond that is consistently OCR noise bleeding in from a
                // watermark, regardless of whether it comes back upper or
                // mixed case. Cap it here rather than relying on casing.
                return titleCaseName(candidate.split(' ').slice(0, 3).join(' '));
              }
            }
            break;
          }
        }

        // 2b) Fallback: scan backward from "Father's Name" header, skipping noise lines
        for (let i = 0; i < lines.length; i++) {
          if (relationRe.test(lines[i])) {
            for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
              if (panNumRe.test(lines[j])) break;
              const candidate = normalizeNameValue(lines[j], docType);
              if (isNameCandidate(candidate, docType)) return titleCaseName(candidate);
            }
            break;
          }
        }
      }

      if (docType === 'Aadhaar Card') {
        // 3) Aadhaar-style: line just above DOB/Gender
        for (let i = 0; i < lines.length; i++) {
          if (/(DOB|DATE OF BIRTH|YOB|MALE|FEMALE)/i.test(lines[i]) && i > 0) {
            const prev = normalizeNameValue(lines[i - 1], docType);
            if (isNameCandidate(prev, docType)) return titleCaseName(prev);
          }
        }
      }

      // 4) Fallback: first plausible alphabetic 2+ word line
      for (let line of lines) {
        const candidate = normalizeNameValue(line, docType);
        if (isNameCandidate(candidate, docType)) return titleCaseName(candidate);
      }

      return '';
    }

    // OCR Execution
    processBtn.addEventListener('click', async () => {
      const files = Array.from(folderInput.files).filter(f => /\.(jpe?g|png|bmp)$/i.test(f.name));
      
      if (files.length === 0) {
        alert("Please select a folder containing image files (.jpg, .png).");
        return;
      }

      processedRecords = [];
      resultsTbody.innerHTML = '';
      statusBox.classList.add('active');
      processBtn.disabled = true;

      const worker = await Tesseract.createWorker('eng');

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pct = Math.round(((i + 1) / files.length) * 100);
        
        statusText.textContent = `Processing file ${i + 1} of ${files.length}: ${file.name}`;
        progressBar.style.width = `${pct}%`;

        try {
          const ret = await worker.recognize(file);
          const text = ret.data.text;
          const docType = detectDocumentType(text);
          
          let docNum = '';
          if (docType === 'Aadhaar Card') docNum = extractAadhaarNumber(text);
          else if (docType === 'PAN Card') docNum = extractPanNumber(text);

          const name = extractPersonName(text, docType);

          const record = {
            "File Name": file.name,
            "Document Type": docType,
            "Document Number": docNum,
            "Person Name": name
          };

          processedRecords.push(record);
          appendTableRow(record);

        } catch (err) {
          console.error(err);
          const errRecord = {
            "File Name": file.name,
            "Document Type": "Error",
            "Document Number": "",
            "Person Name": ""
          };
          processedRecords.push(errRecord);
          appendTableRow(errRecord);
        }
      }

      await worker.terminate();

      statusText.textContent = `Processing completed successfully! ${processedRecords.length} record(s) extracted.`;
      downloadBtn.style.display = 'inline-block';
      resultsCard.classList.add('active');
    });

    function appendTableRow(rec) {
      const tr = document.createElement('tr');
      const tagClass = rec["Document Type"] === 'Aadhaar Card' ? 'ok' : rec["Document Type"] === 'PAN Card' ? 'warn' : 'flag';
      
      tr.innerHTML = `
        <td class="grp">${rec["File Name"]}</td>
        <td><span class="tag ${tagClass}">${rec["Document Type"]}</span></td>
        <td class="num">${rec["Document Number"]}</td>
        <td>${rec["Person Name"]}</td>
      `;
      resultsTbody.appendChild(tr);
    }

    // Excel Export Generator
    downloadBtn.addEventListener('click', () => {
      if (processedRecords.length === 0) return;

      const worksheet = XLSX.utils.json_to_sheet(processedRecords);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "KYC_Extraction");

      // Auto-fit column widths
      worksheet['!cols'] = [
        { wch: 30 },
        { wch: 18 },
        { wch: 22 },
        { wch: 25 }
      ];

      XLSX.writeFile(workbook, "id_extracted_data.xlsx");
    });