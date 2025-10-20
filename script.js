/**
 * Sheets Editor & Merger Application Logic (Arabic RTL)
 * FINAL ROBUST VERSION - This version removes the 'accept' attribute to fix mobile selection issues
 * and relies on post-selection validation for file types.
 */
window.onload = () => {
    lucide.createIcons();
    initTheme();
    // Register the service worker for PWA functionality
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully:', reg.scope))
            .catch(err => console.error('Service worker registration failed:', err));
    }
};

// --- Element Selections ---
const fileInput = document.getElementById('fileInput');
const fileInputLabel = document.getElementById('fileInputLabel');
const mergeBtn = document.getElementById('mergeBtn');
const fileNameInput = document.getElementById('fileNameInput');
const statusMessage = document.getElementById('statusMessage');
const spreadsheetContainer = document.getElementById('spreadsheet-container');
const placeholder = document.getElementById('placeholder');
const loaderOverlay = document.getElementById('loader-overlay');
const loaderText = document.getElementById('loader-text');
const progressBar = document.getElementById('progress-bar');
const loaderPercentage = document.getElementById('loader-percentage');
const optionsModal = document.getElementById('optionsModal');
const newTableModal = document.getElementById('newTableModal');
const deleteModal = document.getElementById('deleteModal');
const keepModal = document.getElementById('keepModal');
const saveModal = document.getElementById('saveModal');
const reportSection = document.getElementById('reportSection');
const originalRowsEl = document.getElementById('originalRows');
const addedRowsEl = document.getElementById('addedRows');
const deletedRowsEl = document.getElementById('deletedRows');
const remainingRowsEl = document.getElementById('remainingRows');
const themeToggleBtn = document.getElementById('theme-toggle');
const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');

// --- Global State ---
let originalRowCount = 0;
let selectedFiles = null;
let progressInterval = null;
const ALLOWED_EXTENSIONS = ['csv', 'tsv', 'xls', 'xlsx', 'ods', 'json'];

// --- Theme ---
function initTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark' || (!storedTheme && prefersDark)) {
        document.documentElement.classList.add('dark');
        themeToggleLightIcon.classList.remove('hidden');
    } else {
        document.documentElement.classList.remove('dark');
        themeToggleDarkIcon.classList.remove('hidden');
    }
}

themeToggleBtn.addEventListener('click', function () {
    const isDark = document.documentElement.classList.toggle('dark');
    themeToggleDarkIcon.classList.toggle('hidden', isDark);
    themeToggleLightIcon.classList.toggle('hidden', !isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// --- Modals & Actions ---
function toggleModal(modal, show) {
    modal.classList.toggle('hidden', !show);
    if (show) lucide.createIcons();
    else {
        modal.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
            input.value = '';
            if (input.dataset.type) document.getElementById(`rowCount-${input.dataset.type}`).textContent = '';
        });
    }
}

function updateModalButtonsState(hasData) {
    optionsModal.querySelectorAll('[data-action="add-row"], [data-action="open-delete-modal"], [data-action="open-keep-modal"], [data-action="clear-table"]').forEach(btn => btn.disabled = !hasData);
}

document.addEventListener('click', e => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const hasDataRows = !!spreadsheetContainer.querySelector('tbody')?.children.length;

    const actions = {
        'open-options': () => { toggleModal(optionsModal, true); updateModalButtonsState(hasDataRows); },
        'open-new-table-modal': () => { toggleModal(optionsModal, false); toggleModal(newTableModal, true); },
        'open-delete-modal': () => { if (hasDataRows) { toggleModal(optionsModal, false); toggleModal(deleteModal, true); } },
        'open-keep-modal': () => { if (hasDataRows) { toggleModal(optionsModal, false); toggleModal(keepModal, true); } },
        'open-save-modal': () => {
            if (!hasDataRows) return showStatus('لا توجد بيانات لتنزيلها!', 'error');
            document.getElementById('modalFileNameInput').value = fileNameInput.value || 'data';
            toggleModal(saveModal, true);
        },
        'close-modal': () => { toggleModal(e.target.closest('.fixed'), false); },
        'add-row': () => { if (spreadsheetContainer.querySelector('table thead')) { addRow(); toggleModal(optionsModal, false); } },
        'clear-table': () => { if (hasDataRows) { clearTable(); toggleModal(optionsModal, false); } },
        'confirm-new-table': () => {
            const cols = parseInt(document.getElementById('newTableCols').value) || 1;
            const rows = parseInt(document.getElementById('newTableRows').value) || 1;
            createNewTable(cols, rows);
            toggleModal(newTableModal, false);
        },
        'confirm-delete': () => { const keyword = document.getElementById('keywordInput-delete').value; if (keyword.trim()) performRowDeletion(keyword); toggleModal(deleteModal, false); },
        'confirm-keep': () => { const keyword = document.getElementById('keywordInput-keep').value; if (keyword.trim()) performRowKeeping(keyword); toggleModal(keepModal, false); },
        'confirm-save': () => { saveFile(); toggleModal(saveModal, false); }
    };
    if (actions[action]) actions[action]();
});

document.querySelectorAll('.fixed').forEach(modal => {
    modal.addEventListener('click', e => { if (e.target.id === modal.id) toggleModal(modal, false); });
});

document.addEventListener('input', e => {
    if (e.target.dataset.action === 'update-count') updateActionCount(e.target.value, e.target.dataset.type);
});

// --- Report & Status ---
function updateReport() {
    const allRows = Array.from(spreadsheetContainer.querySelector('tbody')?.querySelectorAll('tr') || []);
    const currentRowCount = allRows.length;
    const addedRowsInTable = allRows.filter(row => row.classList.contains('new-row')).length;
    const originalRowsInTable = currentRowCount - addedRowsInTable;
    let actualDeleted = Math.max(0, originalRowCount - originalRowsInTable);

    remainingRowsEl.textContent = currentRowCount;
    originalRowsEl.textContent = originalRowCount;
    addedRowsEl.textContent = addedRowsInTable;
    deletedRowsEl.textContent = actualDeleted;

    const hasAnyData = currentRowCount > 0 || originalRowCount > 0;
    reportSection.classList.toggle('hidden', !hasAnyData);
    updateModalButtonsState(currentRowCount > 0);
}

function showStatus(message, type = 'info') {
    const colorClass = type === 'error' ? 'text-red-500' : (type === 'success' ? 'text-emerald-500' : 'text-slate-500');
    statusMessage.textContent = message;
    statusMessage.className = `text-center text-sm h-5 mt-2 transition-opacity duration-300 ${colorClass}`;
    setTimeout(() => statusMessage.textContent = '', 4000);
}

// --- Loader ---
function showLoader(text = 'جاري المعالجة...') {
    loaderText.textContent = text;
    progressBar.style.width = '0%';
    loaderPercentage.textContent = '0%';
    loaderOverlay.classList.remove('hidden');

    if (progressInterval) clearInterval(progressInterval);

    let progress = 0;
    progressInterval = setInterval(() => {
        progress += Math.floor(Math.random() * 5) + 1;
        if (progress >= 95) {
            progress = 95;
            clearInterval(progressInterval);
        }
        progressBar.style.width = `${progress}%`;
        loaderPercentage.textContent = `${progress}%`;
    }, 150);
}

function hideLoader() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    
    progressBar.style.width = '100%';
    loaderPercentage.textContent = '100%';

    setTimeout(() => {
        loaderOverlay.classList.add('hidden');
        setTimeout(() => {
           progressBar.style.width = '0%';
           loaderPercentage.textContent = '0%';
        }, 300);
    }, 500);
}

// --- *** NEW ROBUST DATA PROCESSING ENGINE *** ---

fileInput.addEventListener('change', e => {
    const files = e.target.files;
    if (!files || files.length === 0) return resetFileSelection();
    
    const validFiles = Array.from(files).filter(file => {
        const extension = file.name.split('.').pop().toLowerCase();
        return ALLOWED_EXTENSIONS.includes(extension);
    });

    if (validFiles.length !== files.length) {
        showStatus('تم اختيار ملفات غير مدعومة وتجاهلها.', 'error');
    }
    
    if (validFiles.length === 0) {
        resetFileSelection();
        return;
    }

    if (validFiles.length === 1) {
        handleSingleFile(validFiles[0]);
    } else {
        handleMultipleFiles(validFiles);
    }
});

function resetFileSelection() {
    selectedFiles = null;
    fileInputLabel.querySelector('span').textContent = '1. اختر ملفًا أو عدة ملفات';
    mergeBtn.disabled = true;
    fileInput.value = '';
}

async function handleSingleFile(file) {
    showLoader(`جاري تحميل "${file.name}"...`);
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        const dataAsObjects = await parseFileToObjects(file);
        const dataAs2dArray = convertObjectsTo2dArray(dataAsObjects);
        
        fileNameInput.value = file.name.split('.').slice(0, -1).join('.') || 'data';
        renderTable(dataAs2dArray);
        originalRowCount = dataAsObjects.length;
        updateReport();
        showStatus(`تم تحميل "${file.name}" بنجاح.`, 'success');
    } catch (err) {
        console.error("Error processing single file:", err);
        showStatus(err.message || 'خطأ فادح أثناء معالجة الملف.', 'error');
    } finally {
        hideLoader();
        resetFileSelection();
    }
}
        
function handleMultipleFiles(files){
     selectedFiles = files;
     fileInputLabel.querySelector('span').textContent = `تم تحديد ${files.length} ملفات`;
     mergeBtn.disabled = false;
     showStatus(`جاهز لدمج ${files.length} ملفات. اضغط على زر الدمج.`, 'info');
}

mergeBtn.addEventListener('click', async () => {
     if (!selectedFiles || selectedFiles.length < 2) return showStatus('الرجاء تحديد ملفين أو أكثر للدمج.', 'error');
     showLoader(`جاري دمج ${selectedFiles.length} ملفات...`);
     await new Promise(resolve => setTimeout(resolve, 50));

    try {
        const allObjectsPromises = Array.from(selectedFiles).map(file => parseFileToObjects(file));
        const allObjectsArrays = await Promise.all(allObjectsPromises);
        const combinedObjects = allObjectsArrays.flat();
        
        const dataAs2dArray = convertObjectsTo2dArray(combinedObjects);

        renderTable(dataAs2dArray);
        originalRowCount = combinedObjects.length;
        updateReport();
        showStatus(`تم دمج ${selectedFiles.length} ملفات بنجاح.`, 'success');

    } catch (err) {
         console.error("Error merging files:", err);
         showStatus(err.message || 'حدث خطأ أثناء عملية الدمج.', 'error');
    } finally {
        hideLoader();
        resetFileSelection();
    }
});

async function parseFileToObjects(file) {
    try {
        const extension = file.name.split('.').pop().toLowerCase();
        const isTextBased = ['json', 'csv', 'tsv'].includes(extension);

        if (isTextBased) {
            const text = await readFileAsText(file);
             if (extension === 'json') {
                const parsedJson = JSON.parse(text);
                if (!Array.isArray(parsedJson)) {
                     throw new Error("ملف JSON غير صالح: يجب أن يحتوي على مصفوفة من الكائنات.");
                }
                return parsedJson;
            } else { // CSV, TSV
                const workbook = XLSX.read(text, { type: 'string', raw: true });
                const sheetName = workbook.SheetNames[0];
                return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            }
        } else { // Binary files like XLS, XLSX, ODS
            const arrayBuffer = await readFileAsArrayBuffer(file);
            const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        }
    } catch (e) {
        console.error(`Failed to parse file ${file.name}:`, e);
        throw new Error(`فشل في قراءة الملف "${file.name}". قد يكون تالفًا أو بتنسيق غير صحيح.`);
    }
}

function convertObjectsTo2dArray(objects) {
    if (!Array.isArray(objects) || objects.length === 0) {
        return [];
    }
    const headerSet = new Set();
    objects.forEach(obj => {
        if (typeof obj === 'object' && obj !== null) {
            Object.keys(obj).forEach(key => headerSet.add(key));
        }
    });
    if (headerSet.size === 0) { return []; }
    const headers = Array.from(headerSet);
    const dataRows = objects.map(obj => {
        if (typeof obj === 'object' && obj !== null) {
            return headers.map(header => {
                const value = obj[header];
                return (value === null || value === undefined) ? '' : value;
            });
        }
        return Array(headers.length).fill('');
    });
    return [headers, ...dataRows];
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e.target.error);
        reader.readAsArrayBuffer(file);
    });
}
        
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e.target.error);
        reader.readAsText(file);
    });
}

// --- Rendering & Saving ---

function renderTable(dataArray) {
    const existingTable = spreadsheetContainer.querySelector('table');
    if (existingTable) existingTable.remove();
    
    if (!dataArray || dataArray.length === 0 || (dataArray.length === 1 && (!dataArray[0] || dataArray[0].length === 0))) {
        placeholder.classList.remove('hidden');
        originalRowCount = 0;
        updateReport();
        return;
    }

    placeholder.classList.add('hidden');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    const headers = dataArray[0] || [];
    const headerRow = document.createElement('tr');
    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText || '';
        th.setAttribute('contenteditable', 'true');
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    dataArray.slice(1).forEach(rowData => {
        const row = document.createElement('tr');
        const safeRowData = Array.isArray(rowData) ? rowData : [];
        for (let j = 0; j < headers.length; j++) {
            const td = document.createElement('td');
            td.textContent = (safeRowData[j] !== null && safeRowData[j] !== undefined) ? String(safeRowData[j]) : '';
            td.setAttribute('contenteditable', 'true');
            row.appendChild(td);
        }
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    spreadsheetContainer.appendChild(table);
}

function saveFile() {
    const table = spreadsheetContainer.querySelector('table');
    if (!table) return showStatus('لا توجد بيانات لتنزيلها!', 'error');

    const format = document.querySelector('input[name="save-format"]:checked')?.value || 'xlsx';
    const baseName = document.getElementById('modalFileNameInput').value.trim() || 'data';
    const finalFileName = `${baseName}.${format}`;

    try {
        if (format === 'json') {
            const jsonData = tableToJson(table);
            const jsonString = JSON.stringify(jsonData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
            downloadBlob(blob, finalFileName);
        } else {
            const ws = XLSX.utils.table_to_sheet(table);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            XLSX.writeFile(wb, finalFileName, { bookType: format });
        }
        showStatus(`تم بدء تنزيل "${finalFileName}".`, 'success');
    } catch (err) {
        console.error("Error saving file:", err);
        showStatus(`حدث خطأ أثناء إنشاء الملف.`, 'error');
    }
}
        
function tableToJson(table) {
    const data = [];
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const rowData = {};
        const cells = row.querySelectorAll('td');
        headers.forEach((header, index) => {
            const cellValue = cells[index]?.textContent.trim() ?? '';
            if (cellValue !== '' && !isNaN(cellValue) && cellValue.trim() !== '' && !(cellValue.length > 1 && cellValue.startsWith('0') && !cellValue.startsWith('0.'))) {
                rowData[header] = Number(cellValue);
            } else {
                rowData[header] = cellValue;
            }
        });
        data.push(rowData);
    });
    return data;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- Data Manipulation ---
function createNewTable(cols, rows) {
    const headers = Array.from({ length: cols }, (_, i) => `عمود ${i + 1}`);
    const data = [headers, ...Array.from({ length: rows }, () => Array(cols).fill(''))];
    renderTable(data);
    originalRowCount = rows;
    updateReport();
    showStatus(`تم إنشاء جدول جديد (${cols} أعمدة, ${rows} سطور).`, 'success');
}

function addRow() {
    const table = spreadsheetContainer.querySelector('table');
    const tbody = table?.querySelector('tbody');
    if (!tbody) return;
    const columnCount = table.querySelector('thead tr').children.length;
    const tr = document.createElement('tr');
    tr.classList.add('new-row');
    for (let i = 0; i < columnCount; i++) {
        const td = document.createElement('td');
        td.setAttribute('contenteditable', 'true');
        td.textContent = '';
        tr.appendChild(td);
    }
    tbody.appendChild(tr);
    spreadsheetContainer.scrollTop = spreadsheetContainer.scrollHeight;
    tr.cells[0].focus();
    updateReport();
}

function manipulateRows(filterFn) {
    const tbody = spreadsheetContainer.querySelector('tbody');
    if (!tbody) return { numChanged: 0 };
    let numChanged = 0;
    Array.from(tbody.querySelectorAll('tr')).forEach(row => {
        if (filterFn(row)) {
            row.remove();
            numChanged++;
        }
    });
    updateReport();
    return { numChanged };
}

function performRowDeletion(keyword) {
    const { numChanged } = manipulateRows(row => row.textContent.toLowerCase().includes(keyword.trim().toLowerCase()));
    showStatus(numChanged > 0 ? `تم حذف ${numChanged} سطور.` : `لم يتم العثور على سطور مطابقة.`, numChanged > 0 ? 'success' : 'info');
}

function performRowKeeping(keyword) {
    const { numCha
