/**
 * Sheets Editor & Merger Application Logic (Arabic RTL)
 * Handles single file loading, multi-file merging, table rendering, data manipulation, and PWA functions.
 * FINAL VERIFIED VERSION - With simplified loader and guaranteed UI update logic.
 */

window.onload = () => {
    lucide.createIcons();
    initTheme();
    if ('serviceWorker' in navigator) {
        navigator.service-worker.register('./sw.js')
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
    loaderOverlay.classList.remove('hidden');
}

function hideLoader() {
    loaderOverlay.classList.add('hidden');
}

// --- File I/O & Merging ---
fileInput.addEventListener('change', e => {
    const files = e.target.files;
    if (!files || files.length === 0) return resetFileSelection();
    if (files.length === 1) {
        resetFileSelection();
        handleSingleFile(files[0]);
    } else {
        selectedFiles = files;
        fileInputLabel.querySelector('span').textContent = `تم تحديد ${files.length} ملفات`;
        mergeBtn.disabled = false;
        showStatus(`جاهز لدمج ${files.length} ملفات. اضغط على زر الدمج.`, 'info');
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
    fileNameInput.value = file.name.split('.').slice(0, -1).join('.') || 'data';
    
    // GUARANTEED UI UPDATE: Wait for the next paint cycle before blocking the thread.
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });

        renderTable(jsonData);
        originalRowCount = jsonData.length > 0 ? jsonData.length - 1 : 0;
        updateReport();
        showStatus(`تم تحميل "${file.name}" بنجاح.`, 'success');
    } catch (err) {
        console.error("Fatal error during file processing:", err);
        showStatus(`خطأ فادح أثناء معالجة الملف. قد يكون الملف تالفاً.`, 'error');
    } finally {
        hideLoader();
    }
}

async function handleMergeFiles() {
    if (!selectedFiles || selectedFiles.length < 2) return showStatus('الرجاء تحديد ملفين أو أكثر للدمج.', 'error');
    showLoader(`جاري دمج ${selectedFiles.length} ملفات...`);
    
    await new Promise(resolve => setTimeout(resolve, 50));

    let mergedDataRows = [];
    let headerRow = [];

    try {
        for (const file of selectedFiles) {
            const arrayBuffer = await readFileAsArrayBuffer(file);
            const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
            if (jsonData.length > 0) {
                if (headerRow.length === 0) headerRow = jsonData[0];
                mergedDataRows.push(...jsonData.slice(1));
            }
        }
        renderTable([headerRow, ...mergedDataRows]);
        originalRowCount = mergedDataRows.length;
        updateReport();
        showStatus(`تم دمج ${selectedFiles.length} ملفات بنجاح.`, 'success');
    } catch (err) {
        console.error("Error merging files:", err);
        showStatus('حدث خطأ أثناء عملية الدمج.', 'error');
    } finally {
        hideLoader();
        resetFileSelection();
    }
}

mergeBtn.addEventListener('click', handleMergeFiles);

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function renderTable(dataArray) {
    const existingTable = spreadsheetContainer.querySelector('table');
    if (existingTable) existingTable.remove();
    if (!dataArray || dataArray.length < 2 && (dataArray.length === 0 || dataArray[0]?.length === 0)) {
        placeholder.classList.remove('hidden');
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
        for (let j = 0; j < headers.length; j++) {
            const td = document.createElement('td');
            td.textContent = (rowData[j] !== null && rowData[j] !== undefined) ? String(rowData[j]) : '';
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
    if (!table) return;
    const format = document.querySelector('input[name="save-format"]:checked')?.value || 'xlsx';
    const baseName = document.getElementById('modalFileNameInput').value.trim() || 'data';
    const finalFileName = `${baseName}.${format}`;
    try {
        const ws = XLSX.utils.table_to_sheet(table);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        XLSX.writeFile(wb, finalFileName, { bookType: format });
        showStatus(`تم بدء تنزيل "${finalFileName}".`, 'success');
    } catch (err) {
        console.error("Error saving file:", err);
        showStatus(`حدث خطأ أثناء إنشاء الملف.`, 'error');
    }
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
    const { numChanged } = manipulateRows(row => !row.textContent.toLowerCase().includes(keyword.trim().toLowerCase()));
    showStatus(numChanged > 0 ? `تم حذف ${numChanged} سطور.` : `تم الإبقاء على جميع السطور.`, numChanged > 0 ? 'success' : 'info');
}

function clearTable() {
    renderTable([]);
    originalRowCount = 0;
    updateReport();
    showStatus('تم مسح الجدول بالكامل.', 'info');
}

function updateActionCount(keyword, type) {
    const trimmedKeyword = keyword.trim().toLowerCase();
    const counterEl = document.getElementById(`rowCount-${type}`);
    if (!trimmedKeyword) return counterEl.textContent = '';
    const tbody = spreadsheetContainer.querySelector('tbody');
    if (!tbody) return;
    const totalRows = tbody.querySelectorAll('tr').length;
    const matchCount = Array.from(tbody.querySelectorAll('tr')).filter(row => row.textContent.toLowerCase().includes(trimmedKeyword)).length;
    if (type === 'delete') counterEl.textContent = `سيتم حذف ${matchCount} سطور.`;
    else if (type === 'keep') counterEl.textContent = `سيتم الإبقاء على ${matchCount} وحذف ${totalRows - matchCount}.`;
}
