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

    // Since this function is the entry point, we can attach event listeners here.
    // The rest of the definitions are kept outside for structural compatibility with the original files.
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
let originalRowCount = 0;
let addedRowCount = 0;
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
        // Re-create icons inside modal content if needed (for dynamic content)
        lucide.createIcons(); 
    } else {
        modalElement.classList.add('hidden');
        // Clear input fields in modals when closing
        modalElement.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
            input.value = '';
            // Clear status messages too
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

    const tableExists = !!spreadsheetContainer.querySelector('table');
    
    const actions = {
        'open-options': () => {
            toggleModal(optionsModal, true);
            updateModalButtonsState(tableExists);
        },
        'open-new-table-modal': () => { toggleModal(optionsModal, false); toggleModal(newTableModal, true); },
        'open-delete-modal': () => { toggleModal(optionsModal, false); toggleModal(deleteModal, true); },
        'open-keep-modal': () => { toggleModal(optionsModal, false); toggleModal(keepModal, true); },
        'open-save-modal': () => {
            if (!tableExists || spreadsheetContainer.querySelector('tbody')?.children.length === 0) {
                 return showStatus('لا توجد بيانات لتنزيلها!', 'error');
            }
            // Set default file name in the modal
            document.getElementById('modalFileNameInput').value = fileNameInput.value || 'data';
            toggleModal(saveModal, true);
        },
        'close-modal': () => {
            // Find the closest parent modal (fixed position element)
            const modal = e.target.closest('.fixed'); 
            if (modal) toggleModal(modal, false);
        },
        'add-row': () => { addRow(); toggleModal(optionsModal, false); },
        'clear-table': () => { 
            // We use the newTableModal logic with 0 rows/cols to clear it
            if(window.confirm('هل أنت متأكد من مسح الجدول بالكامل؟ لا يمكن التراجع عن هذا الإجراء.')){
                 clearTable(); 
                 toggleModal(optionsModal, false);
            }
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
        // Close only if click is directly on the modal backdrop, not the content
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
    
    // The deletedRowCount is calculated implicitly by the difference between the starting size and the current size.
    // However, the original code tracked explicit deletions. We must stick to the original state tracking.
    const remainingCount = originalRowCount + addedRowCount - deletedRowCount;

    remainingRowsEl.textContent = Math.max(0, currentRowCount); // Actual rows in table
    originalRowsEl.textContent = originalRowCount;
    addedRowsEl.textContent = addedRowCount;
    deletedRowsEl.textContent = deletedRowCount;
    
    // Show report only if data exists
    if (originalRowCount > 0 || addedRowCount > 0 || deletedRowCount > 0) {
        reportSection.classList.remove('hidden');
    } else {
        reportSection.classList.add('hidden');
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
    // Set file name for the input field (removing extension)
    fileNameInput.value = file.name.split('.').slice(0, -1).join('.') || 'data';

    // A small delay to ensure loader starts rendering before heavy processing
    setTimeout(() => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                // Read the workbook from array buffer
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                // Convert sheet to array of arrays (header: 1 includes the header row)
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }); 
                
                renderTable(jsonData);

                // Update report counters (subtract 1 for header row)
                originalRowCount = jsonData.length > 0 ? jsonData.length - 1 : 0;
                addedRowCount = 0;
                deletedRowCount = 0;
                updateReport();
                showStatus(`تم تحميل "${file.name}" بنجاح.`, 'success');
            } catch (err) {
                console.error("Error processing file:", err);
                showStatus(`حدث خطأ أثناء معالجة الملف. تأكد من أنه ملف جدول بيانات صحيح.`, 'error');
            } finally {
                // Clear the file input so the same file can be loaded again
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
    // Clear any existing table
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
        th.textContent = headerText || ''; // Ensure it's not null/undefined
        th.setAttribute('contenteditable', 'true');
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 2. Create Body Rows
    const dataRows = dataArray.slice(1);
    dataRows.forEach(rowData => {
        const row = document.createElement('tr');
        // Ensure row has the same number of cells as headers
        for (let j = 0; j < headers.length; j++) {
            const td = document.createElement('td');
            // Use String() to safely convert any value to text, defaulting to empty string
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
    if (!table) return; // Should be handled by modal check, but for safety

    const format = document.querySelector('input[name="save-format"]:checked')?.value || 'xlsx';
    const baseName = document.getElementById('modalFileNameInput').value.trim() || 'data';
    const finalFileName = `${baseName}.${format}`;
    
    try {
        const ws = XLSX.utils.table_to_sheet(table);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        
        // Write file using SheetJS utility
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
    tr.classList.add('new-row'); // Optional: tag new rows visually/logically
    
    for(let i = 0; i < columnCount; i++) {
        const td = document.createElement('td');
        td.setAttribute('contenteditable', 'true');
        td.textContent = ''; // Empty cell
        tr.appendChild(td);
    };
    tbody.appendChild(tr);
    
    // Scroll to the new row and focus the first cell
    spreadsheetContainer.scrollTop = spreadsheetContainer.scrollHeight;
    tr.cells[0].focus(); 
    
    addedRowCount++;
    updateReport();
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
            // Count rows that were part of the original data or manually added
            if (!row.classList.contains('new-row')) {
                // If the row was an original row, it counts towards deletion
            } else {
                // If the row was newly added, it just gets removed from the added count
                addedRowCount--;
            }
            row.remove();
            numChanged++;
        }
    });
    
    // Update total deleted count based on manipulation
    deletedRowCount += numChanged;
    
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
        // deletedRowCount is updated inside manipulateRows
        updateReport();
        showStatus(`تم حذف ${numChanged} سطور.`, 'success');
    } else {
        showStatus(`لم يتم العثور على سطور مطابقة.`, 'info');
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
        // deletedRowCount is updated inside manipulateRows
        updateReport();
        showStatus(`تم حذف ${numChanged} سطور (تم الإبقاء على المطابقة فقط).`, 'success');
    } else {
        // If 0 rows were changed, either the table was empty or all rows matched, so we show an info message.
        showStatus(`تم الإبقاء على جميع السطور.`, 'info');
    }
}

/**
 * Clears the entire table and resets the report.
 */
function clearTable() {
    renderTable([]);
    originalRowCount = 0; addedRowCount = 0; deletedRowCount = 0;
    updateReport(); // Will hide the report section
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
    
    if (!trimmedKeyword) return counterEl.textCont
