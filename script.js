/**
 * Sheets Editor Application Logic (Arabic RTL)
 * Handles file loading (XLSX), table rendering, data manipulation, and PWA functions.
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
// originalRowCount: Number of data rows loaded from the file or created initially.
let originalRowCount = 0;
// addedRowCount: Number of rows manually added by the user.
let addedRowCount = 0;
// deletedRowCount: Number of rows removed from the total (Original + Added).
let deletedRowCount = 0;
let progressInterval = null;


// --- Theme Handling Functions ---

/**
 * Initializes the theme based on localStorage or system preference.
 */
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

// Event listener for theme toggle button
themeToggleBtn.addEventListener('click', function() {
    themeToggleDarkIcon.classList.toggle('hidden');
    themeToggleLightIcon.classList.toggle('hidden');
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});


// --- Modal & Action Handling ---

/**
 * Toggles the visibility of a modal element.
 * @param {HTMLElement} modalElement The modal to show/hide.
 * @param {boolean} show Whether to show (true) or hide (false).
 */
function toggleModal(modalElement, show) {
    if (show) {
        modalElement.classList.remove('hidden');
        lucide.createIcons(); 
    } else {
        modalElement.classList.add('hidden');
        // Clear input fields in modals when closing
        modalElement.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
            input.value = '';
            if (input.dataset.type) {
                document.getElementById(`rowCount-${input.dataset.type}`).textContent = '';
            }
        });
    }
}

/**
 * Updates the disabled state of action buttons in the options modal.
 * @param {boolean} hasData True if a table exists and contains data.
 */
function updateModalButtonsState(hasData) {
    optionsModal.querySelectorAll('[data-action="add-row"], [data-action="open-delete-modal"], [data-action="open-keep-modal"], [data-action="clear-table"]').forEach(btn => btn.disabled = !hasData);
}

// Global click listener for actions and modal closures
document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    const tableExists = !!spreadsheetContainer.querySelector('tbody')?.children.length; // Check if table has rows
    
    const actions = {
        'open-options': () => {
            toggleModal(optionsModal, true);
            updateModalButtonsState(tableExists);
        },
        'open-new-table-modal': () => { toggleModal(optionsModal, false); toggleModal(newTableModal, true); },
        'open-delete-modal': () => { 
            if(!tableExists) return showStatus('لا توجد بيانات متاحة لعملية الحذف.', 'error');
            toggleModal(optionsModal, false); 
            toggleModal(deleteModal, true); 
        },
        'open-keep-modal': () => { 
            if(!tableExists) return showStatus('لا توجد بيانات متاحة لعملية الإبقاء.', 'error');
            toggleModal(optionsModal, false); 
            toggleModal(keepModal, true); 
        },
        'open-save-modal': () => {
            if (!tableExists) {
                 return showStatus('لا توجد بيانات لتنزيلها!', 'error');
            }
            document.getElementById('modalFileNameInput').value = fileNameInput.value || 'data';
            toggleModal(saveModal, true);
        },
        'close-modal': () => {
            const modal = e.target.closest('.fixed'); 
            if (modal) toggleModal(modal, false);
        },
        'add-row': () => { addRow(); toggleModal(optionsModal, false); },
        'clear-table': () => { 
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

// Listener for dynamically updating row counts in delete/keep modals
document.addEventListener('input', (e) => {
    const target = e.target;
    if(target.dataset.action === 'update-count') {
        updateActionCount(target.value, target.dataset.type);
    }
});


// --- Report and Status Functions ---

/**
 * Updates the change report in the main interface.
 */
function updateReport() {
    const table = spreadsheetContainer.querySelector('table');
    const currentRowCount = table ? table.querySelectorAll('tbody tr').length : 0;
    
    // We calculate the number of original rows remaining and added rows remaining.
    // This allows for a more robust tracking of changes.
    const originalRowsInTable = Array.from(table?.querySelectorAll('tbody tr') || []).filter(row => !row.classList.contains('new-row')).length;
    const addedRowsInTable = Array.from(table?.querySelectorAll('tbody tr') || []).filter(row => row.classList.contains('new-row')).length;

    // Recalculate deletion based on the actual difference from the original total.
    const totalOriginal = originalRowCount;
    const actualDeleted = totalOriginal - originalRowsInTable;
    
    // Update global state based on current table DOM
    addedRowCount = addedRowsInTable;
    deletedRowCount = actualDeleted;

    // Update UI elements
    remainingRowsEl.textContent = currentRowCount;
    originalRowsEl.textContent = originalRowCount;
    addedRowsEl.textContent = addedRowCount;
    deletedRowsEl.textContent = deletedRowCount;
    
    // Show report only if data exists
    if (currentRowCount > 0 || originalRowCount > 0 || addedRowCount > 0 || deletedRowCount > 0) {
        reportSection.classList.remove('hidden');
    } else {
        reportSection.classList.add('hidden');
    }
    
    // Check if the Options modal is open and update its buttons
    if (!optionsModal.classList.contains('hidden')) {
        updateModalButtonsState(currentRowCount > 0);
    }
}

/**
 * Displays a temporary status message to the user.
 * @param {string} message The message to display.
 * @param {'success'|'error'|'info'} type The type of message for coloring.
 */
function showStatus(message, type = 'info') {
    const colorClass = type === 'error' ? 'text-red-500' : (type === 'success' ? 'text-emerald-500' : 'text-slate-500');
    statusMessage.textContent = message;
    statusMessage.className = `text-center text-sm h-5 mt-2 transition-opacity duration-300 ${colorClass}`;
    // Clear message after 4 seconds
    setTimeout(() => statusMessage.textContent = '', 4000);
}


// --- Loader Functions ---

function showLoader() {
    loaderOverlay.classList.remove('hidden');
    let progress = 0;
    document.getElementById('loader-percentage').textContent = '0%';
    if (progressInterval) clearInterval(progressInterval);
    
    // Simulate loading progress
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
    if(progressInterval) clearInterval(progressInterval);
    progressInterval = null;
    document.getElementById('loader-percentage').textContent = `100%`;
    // Delay hiding for a smoother transition
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
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                // Use defval: '' to ensure empty cells are represented by empty strings, not null
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }); 
                
                renderTable(jsonData);

                // Initialize report counters based on loaded data
                originalRowCount = jsonData.length > 0 ? jsonData.length - 1 : 0;
                addedRowCount = 0;
                deletedRowCount = 0;
                updateReport();
                showStatus(`تم تحميل "${file.name}" بنجاح.`, 'success');
            } catch (err) {
                console.error("Error processing file:", err);
                showStatus(`حدث خطأ أثناء معالجة الملف. تأكد من أنه ملف جدول بيانات صحيح.`, 'error');
            } finally {
                fileInput.value = '';
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

/**
 * Creates and renders the HTML table from a 2D data array.
 * @param {Array<Array<any>>} dataArray Data where the first array is the header.
 */
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

    // 1. Create Header
    const headerRow = document.createElement('tr');
    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText || '';
        th.setAttribute('contenteditable', 'true');
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 2. Create Body Rows
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

/**
 * Exports the current table data to a file (XLSX, CSV, or JSON).
 */
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

/**
 * Creates a new, empty table with specified dimensions.
 * @param {number} cols Number of columns.
 * @param {number} rows Number of rows.
 */
function createNewTable(cols, rows) {
    const headers = Array.from({length: cols}, (_, i) => `عمود ${i + 1}`);
    const data = [headers, ...Array.from({length: rows}, () => Array(cols).fill(''))];
    renderTable(data);

    // Reset report counters
    originalRowCount = rows;
    addedRowCount = 0;
    deletedRowCount = 0;
    updateReport();
    showStatus(`تم إنشاء جدول جديد (${cols} أعمدة, ${rows} سطور).`, 'success');
}

/**
 * Adds a new row to the existing table.
 */
function addRow() {
    const table = spreadsheetContainer.querySelector('table');
    if (!table) return showStatus('يجب إنشاء أو تحميل جدول أولاً.', 'error');
    
    const columnCount = table.querySelector('thead tr').children.length;
    const tbody = table.querySelector('tbody');
    const tr = document.createElement('tr');
    tr.classList.add('new-row'); // Tag row as newly added
    
    for(let i = 0; i < columnCount; i++) {
        const td = document.createElement('td');
        td.setAttribute('contenteditable', 'true');
        td.textContent = ''; 
        tr.appendChild(td);
    };
    tbody.appendChild(tr);
    
    spreadsheetContainer.scrollTop = spreadsheetContainer.scrollHeight;
    tr.cells[0].focus(); 
    
    updateReport(); // Update report after adding the row
}

/**
 * Removes rows from the table based on a filter function.
 * @param {function(HTMLElement): boolean} filterFn The function to decide which rows to remove.
 * @returns {{numChanged: number}} The number of rows removed.
 */
function manipulateRows(filterFn) {
    const table = spreadsheetContainer.querySelector('table');
    if (!table) return { numChanged: 0 };
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    let numChanged = 0;
    
    rows.forEach(row => {
        if (filterFn(row)) {
            row.remove();
            numChanged++;
        }
    });
    
    updateReport(); // Update the report based on the final DOM state
    
    return { numChanged };
}

/**
 * Deletes rows containing the given keyword.
 * @param {string} keyword The keyword to search for.
 */
function performRowDeletion(keyword) {
    const trimmedKeyword = keyword.trim().toLowerCase();
    const { numChanged } = manipulateRows(row => row.textContent.toLowerCase().includes(trimmedKeyword));
    
    if (numChanged > 0) {
        showStatus(`تم حذف ${numChanged} سطور.`, 'success');
    } else {
        showStatus(`لم يتم العثور على سطور مطابقة للحذف.`, 'info');
    }
}

/**
 * Keeps only rows containing the given keyword (deleting non-matches).
 * @param {string} keyword The keyword to search for.
 */
function performRowKeeping(keyword) {
    const trimmedKeyword = keyword.trim().toLowerCase();
    // Filter function is to remove rows where the text content DOES NOT include the keyword
    const { numChanged } = manipulateRows(row => !row.textContent.toLowerCase().includes(trimmedKeyword));
    
    if (numChanged > 0) {
        showStatus(`تم حذف ${numChanged} سطور (تم الإبقاء على المطابقة فقط).`, 'success');
    } else {
        showStatus(`لم يتم العثور على سطور غير مطابقة للحذف.`, 'info');
    }
}

/**
 * Clears the entire table and resets the report.
 */
function clearTable() {
    renderTable([]);
    originalRowCount = 0; addedRowCount = 0; deletedRowCount = 0;
    updateReport(); 
    showStatus('تم مسح الجدول بالكامل.', 'info');
}

/**
 * Dynamically updates the count of rows that will be affected by an action.
 * @param {string} keyword The keyword entered by the user.
 * @param {'delete'|'keep'} type The type of action (delete or keep).
 */
function updateActionCount(keyword, type) {
    const trimmedKeyword = keyword.trim().toLowerCase();
    const counterEl = document.getElementById(`rowCount-${type}`);
    
    if (!trimmedKeyword) return counterEl.textContent = '';
    
    const table = spreadsheetContainer.querySelector('table');
    if (!table) return;

    let totalRows = table.querySelectorAll('tbody tr').length;
    let matchCount = Array.from(table.querySelectorAll('tbody tr')).filter(row => row.textContent.toLowerCase().includes(trimmedKeyword)).length;
    
    if (type === 'delete') {
        counterEl.textContent = `سيتم حذف ${matchCount} سطور.`;
    } else if (type === 'keep') {
        const rowsToBeDeleted = totalRows - matchCount;
        counterEl.textContent = `سيتم الإبقاء على ${matchCount} سطور وحذف ${rowsToBeDeleted} سطور.`;
    }
}

        
