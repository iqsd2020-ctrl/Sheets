/**
 * Sheets Editor Application Logic (Arabic RTL)
 * Handles file loading (XLSX), table rendering, data manipulation, and PWA functions.
 * FINAL VERIFIED VERSION
 */

window.onload = () => {
    // Initialize Lucide icons and theme settings on page load
    lucide.createIcons();
    initTheme();

    // Register Service Worker for PWA/Offline capabilities
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully:', reg.scope))
            .catch(err => console.error('Service worker registration failed:', err));
    }
};


// --- Element Selections ---
const fileInput = document.getElementById('fileInput');
const fileNameInput = document.getElementById('fileNameInput');
const statusMessage = document.getElementById('statusMessage');
const spreadsheetContainer = document.getElementById('spreadsheet-container');
const placeholder = document.getElementById('placeholder');
const loaderOverlay = document.getElementById('loader-overlay');
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

// --- Global State Variables ---
// originalRowCount: The number of data rows loaded from the file or created initially. This is the baseline.
let originalRowCount = 0;
let progressInterval = null;


// --- Theme Handling Functions ---

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
    themeToggleDarkIcon.classList.toggle('hidden');
    themeToggleLightIcon.classList.toggle('hidden');
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});


// --- Modal & Action Handling ---

function toggleModal(modalElement, show) {
    if (show) {
        modalElement.classList.remove('hidden');
        lucide.createIcons();
    } else {
        modalElement.classList.add('hidden');
        // Clear input fields and counter messages when closing
        modalElement.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
            input.value = '';
            if (input.dataset.type) {
                document.getElementById(`rowCount-${input.dataset.type}`).textContent = '';
            }
        });
    }
}

/**
 * Updates the disabled state of action buttons in the options modal based on data existence.
 * @param {boolean} hasData True if a table exists and contains data rows.
 */
function updateModalButtonsState(hasData) {
    optionsModal.querySelectorAll('[data-action="add-row"], [data-action="open-delete-modal"], [data-action="open-keep-modal"], [data-action="clear-table"]').forEach(btn => btn.disabled = !hasData);
}

// Global click listener for actions and modal closures
document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    const action = target?.dataset.action;
    if (!action) return;

    // This check is the gatekeeper for actions, ensuring data exists.
    const hasDataRows = !!spreadsheetContainer.querySelector('tbody')?.children.length;

    const actions = {
        'open-options': () => {
            toggleModal(optionsModal, true);
            // Crucial: Update button state every time the options modal is opened
            updateModalButtonsState(hasDataRows);
        },
        'open-new-table-modal': () => { toggleModal(optionsModal, false); toggleModal(newTableModal, true); },
        'open-delete-modal': () => {
            if (!hasDataRows) return;
            toggleModal(optionsModal, false);
            toggleModal(deleteModal, true);
        },
        'open-keep-modal': () => {
            if (!hasDataRows) return;
            toggleModal(optionsModal, false);
            toggleModal(keepModal, true);
        },
        'open-save-modal': () => {
            if (!hasDataRows) return showStatus('لا توجد بيانات لتنزيلها!', 'error');
            document.getElementById('modalFileNameInput').value = fileNameInput.value || 'data';
            toggleModal(saveModal, true);
        },
        'close-modal': () => {
            const modal = e.target.closest('.fixed');
            if (modal) toggleModal(modal, false);
        },
        'add-row': () => {
            // Check for the table header, which indicates a table structure is present.
            if (!spreadsheetContainer.querySelector('table thead')) return showStatus('يجب إنشاء أو تحميل جدول أولاً.', 'error');
            addRow();
            toggleModal(optionsModal, false);
        },
        'clear-table': () => {
            if (!hasDataRows) return;
            clearTable();
            toggleModal(optionsModal, false);
        },
        'confirm-new-table': () => {
            const cols = parseInt(document.getElementById('newTableCols').value) || 1;
            const rows = parseInt(document.getElementById('newTableRows').value) || 1;
            if (cols < 1 || rows < 0) { return showStatus('يجب أن تكون الأعداد أكبر من صفر.', 'error'); }
            createNewTable(cols, rows);
            toggleModal(newTableModal, false);
        },
        'confirm-delete': () => {
            const keyword = document.getElementById('keywordInput-delete').value;
            if (keyword.trim()) performRowDeletion(keyword);
            toggleModal(deleteModal, false);
        },
        'confirm-keep': () => {
            const keyword = document.getElementById('keywordInput-keep').value;
            if (keyword.trim()) performRowKeeping(keyword);
            toggleModal(keepModal, false);
        },
        'confirm-save': () => {
            saveFile();
            toggleModal(saveModal, false);
        }
    };

    if (actions[action]) actions[action]();
});

// Listener to close modals when clicking outside the content area
document.querySelectorAll('.fixed').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('fixed') && e.target.id === modal.id) {
            toggleModal(modal, false);
        }
    });
});

document.addEventListener('input', (e) => {
    const target = e.target;
    if (target.dataset.action === 'update-count') {
        updateActionCount(target.value, target.dataset.type);
    }
});


// --- Report and Status Functions ---

/**
 * THE SINGLE SOURCE OF TRUTH for the application's state.
 * It reads the DOM directly to calculate all counts, ensuring the report is always accurate.
 */
function updateReport() {
    const allRows = Array.from(spreadsheetContainer.querySelector('tbody')?.querySelectorAll('tr') || []);
    const currentRowCount = allRows.length;

    // 1. Calculate ADDED rows by finding elements with the 'new-row' class.
    const addedRowsInTable = allRows.filter(row => row.classList.contains('new-row')).length;

    // 2. Calculate remaining ORIGINAL rows by subtracting added rows from the total.
    const originalRowsInTable = currentRowCount - addedRowsInTable;

    // 3. Calculate DELETED rows by comparing the baseline original count with how many original rows are left.
    let actualDeleted = originalRowCount - originalRowsInTable;
    actualDeleted = Math.max(0, actualDeleted); // Prevent negative numbers.

    // 4. Update the UI elements with the new, accurate counts.
    remainingRowsEl.textContent = currentRowCount;
    originalRowsEl.textContent = originalRowCount;
    addedRowsEl.textContent = addedRowsInTable;
    deletedRowsEl.textContent = actualDeleted;

    // 5. Show or hide the report section based on whether there's any data.
    if (currentRowCount > 0 || originalRowCount > 0) {
        reportSection.classList.remove('hidden');
    } else {
        reportSection.classList.add('hidden');
    }

    // 6. Finally, update the enabled/disabled state of modal buttons.
    updateModalButtonsState(currentRowCount > 0);
}

function showStatus(message, type = 'info') {
    const colorClass = type === 'error' ? 'text-red-500' : (type === 'success' ? 'text-emerald-500' : 'text-slate-500');
    statusMessage.textContent = message;
    statusMessage.className = `text-center text-sm h-5 mt-2 transition-opacity duration-300 ${colorClass}`;
    setTimeout(() => statusMessage.textContent = '', 4000);
}


// --- Loader Functions ---

function showLoader() {
    loaderOverlay.classList.remove('hidden');
    let progress = 0;
    document.getElementById('loader-percentage').textContent = '0%';
    if (progressInterval) clearInterval(progressInterval);

    progressInterval = setInterval(() => {
        progress += Math.floor(Math.random() * 5) + 1;
        if (progress >= 95) {
            progress = 95;
            clearInterval(progressInterval);
        }
        document.getElementById('loader-percentage').textContent = `${progress}%`;
    }, 150);
}

function hideLoader() {
    if (progressInterval) clearInterval(progressInterval);
    progressInterval = null;
    document.getElementById('loader-percentage').textContent = `100%`;
    setTimeout(() => loaderOverlay.classList.add('hidden'), 400);
}


// --- File I/O and Rendering ---

fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    showLoader();
    fileNameInput.value = file.name.split('.').slice(0, -1).join('.') || 'data';

    setTimeout(() => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                renderTable(jsonData);

                // This is the crucial initialization of the baseline row count.
                originalRowCount = jsonData.length > 0 ? jsonData.length - 1 : 0;

                // Immediately update the report and button states after loading.
                updateReport();
                showStatus(`تم تحميل "${file.name}" بنجاح.`, 'success');
            } catch (err) {
                console.error("Error processing file:", err);
                showStatus(`حدث خطأ أثناء معالجة الملف. تأكد من أنه ملف جدول بيانات صحيح.`, 'error');
            } finally {
                fileInput.value = ''; // Reset file input to allow re-uploading the same file.
                hideLoader();
            }
        };
        reader.onerror = () => {
            showStatus(`حدث خطأ أثناء قراءة الملف.`, 'error');
            hideLoader();
        }
        reader.readAsArrayBuffer(file);
    }, 50);
});

function renderTable(dataArray) {
    const existingTable = spreadsheetContainer.querySelector('table');
    if (existingTable) existingTable.remove();

    if (!dataArray || dataArray.length === 0 || (dataArray.length === 1 && dataArray[0].length === 0)) {
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

    const dataRows = dataArray.slice(1);
    dataRows.forEach(rowData => {
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


// --- Data Manipulation Functions ---

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
    if (!tbody) return; // Guard clause

    const columnCount = table.querySelector('thead tr').children.length;
    const tr = document.createElement('tr');
    tr.classList.add('new-row'); // Tag row as newly added for tracking.

    for (let i = 0; i < columnCount; i++) {
        const td = document.createElement('td');
        td.setAttribute('contenteditable', 'true');
        td.textContent = '';
        tr.appendChild(td);
    };
    tbody.appendChild(tr);

    spreadsheetContainer.scrollTop = spreadsheetContainer.scrollHeight;
    tr.cells[0].focus();
    updateReport(); // Recalculate everything after the change.
}

function manipulateRows(filterFn) {
    const tbody = spreadsheetContainer.querySelector('tbody');
    if (!tbody) return { numChanged: 0 };

    const rows = Array.from(tbody.querySelectorAll('tr'));
    let numChanged = 0;
    rows.forEach(row => {
        if (filterFn(row)) {
            row.remove();
            numChanged++;
        }
    });
    updateReport(); // Recalculate everything after the change.
    return { numChanged };
}

function performRowDeletion(keyword) {
    const trimmedKeyword = keyword.trim().toLowerCase();
    if (!trimmedKeyword) return;
    const { numChanged } = manipulateRows(row => row.textContent.toLowerCase().includes(trimmedKeyword));
    if (numChanged > 0) {
        showStatus(`تم حذف ${numChanged} سطور.`, 'success');
    } else {
        showStatus(`لم يتم العثور على سطور مطابقة للحذف.`, 'info');
    }
}

function performRowKeeping(keyword) {
    const trimmedKeyword = keyword.trim().toLowerCase();
    if (!trimmedKeyword) return;
    const { numChanged } = manipulateRows(row => !row.textContent.toLowerCase().includes(trimmedKeyword));
    if (numChanged > 0) {
        showStatus(`تم حذف ${numChanged} سطور (تم الإبقاء على المطابقة فقط).`, 'success');
    } else {
        showStatus(`تم الإبقاء على جميع السطور المطابقة.`, 'info');
    }
}

function clearTable() {
    renderTable([]);
    originalRowCount = 0; // Reset the baseline.
    updateReport(); // Update the UI to reflect the cleared state.
    showStatus('تم مسح الجدول بالكامل.', 'info');
}

function updateActionCount(keyword, type) {
    const trimmedKeyword = keyword.trim().toLowerCase();
    const counterEl = document.getElementById(`rowCount-${type}`);
    if (!trimmedKeyword) {
        counterEl.textContent = '';
        return;
    }
    const tbody = spreadsheetContainer.querySelector('tbody');
    if (!tbody) return;

    const totalRows = tbody.querySelectorAll('tr').length;
    const matchCount = Array.from(tbody.querySelectorAll('tr')).filter(row => row.textContent.toLowerCase().includes(trimmedKeyword)).length;

    if (type === 'delete') {
        counterEl.textContent = `سيتم حذف ${matchCount} سطور.`;
    } else if (type === 'keep') {
        const rowsToBeDeleted = totalRows - matchCount;
        counterEl.textContent = `سيتم الإبقاء على ${matchCount} سطور وحذف ${rowsToBeDeleted} سطور.`;
    }
}


                
