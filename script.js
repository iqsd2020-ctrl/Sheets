window.onload = () => {
  lucide.createIcons();
  initTheme();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('Service worker registration failed:', err));
  }
};

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

let originalRowCount = 0, addedRowCount = 0, deletedRowCount = 0;
let progressInterval = null;

function initTheme() {
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        themeToggleLightIcon.classList.remove('hidden');
    } else {
        document.documentElement.classList.remove('dark');
        themeToggleDarkIcon.classList.remove('hidden');
    }
}

themeToggleBtn.addEventListener('click', function() {
    themeToggleDarkIcon.classList.toggle('hidden');
    themeToggleLightIcon.classList.toggle('hidden');
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

document.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
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
            if (!tableExists) return showStatus('لا توجد بيانات لتنزيلها!', 'error');
            document.getElementById('modalFileNameInput').value = fileNameInput.value;
            toggleModal(saveModal, true);
        },
        'close-modal': () => {
            const modal = e.target.closest('.fixed');
            if (modal) toggleModal(modal, false);
        },
        'add-row': () => { addRow(); toggleModal(optionsModal, false); },
        'clear-table': () => { clearTable(); toggleModal(optionsModal, false); },
        'confirm-new-table': () => {
            const cols = parseInt(document.getElementById('newTableCols').value) || 1;
            const rows = parseInt(document.getElementById('newTableRows').value) || 1;
            createNewTable(cols, rows);
            toggleModal(newTableModal, false);
        },
        'confirm-delete': () => {
            performRowDeletion(document.getElementById('keywordInput-delete').value);
            toggleModal(deleteModal, false);
        },
        'confirm-keep': () => {
            performRowKeeping(document.getElementById('keywordInput-keep').value);
            toggleModal(keepModal, false);
        },
        'confirm-save': () => {
            saveFile();
            toggleModal(saveModal, false);
        }
    };

    if (actions[action]) actions[action]();
});

document.querySelectorAll('.fixed').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (!e.target.closest('[data-modal-content]')) toggleModal(modal, false);
    });
});

document.addEventListener('input', (e) => {
    if(e.target.dataset.action === 'update-count') {
        updateActionCount(e.target.value, e.target.dataset.type);
    }
});

function toggleModal(modalElement, show) {
    if (show) {
        modalElement.classList.remove('hidden');
        lucide.createIcons();
    } else {
        modalElement.classList.add('hidden');
    }
}

fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    showLoader();
    fileNameInput.value = file.name.split('.').slice(0, -1).join('.') || file.name;

    setTimeout(() => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                renderTable(jsonData);

                originalRowCount = jsonData.length > 1 ? jsonData.length - 1 : 0;
                addedRowCount = 0;
                deletedRowCount = 0;
                reportSection.classList.remove('hidden');
                updateReport();
                showStatus(`تم تحميل "${file.name}" بنجاح.`, 'success');
            } catch (err) {
                console.error("Error processing file:", err);
                showStatus(`حدث خطأ أثناء معالجة الملف.`, 'error');
            } finally {
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

function saveFile() {
    const table = spreadsheetContainer.querySelector('table');
    if (!table) return showStatus('لا توجد بيانات لحفظها!', 'error');

    const format = document.querySelector('input[name="save-format"]:checked').value;
    const baseName = document.getElementById('modalFileNameInput').value.trim() || 'data';
    const finalFileName = `${baseName}.${format}`;
    
    try {
        const ws = XLSX.utils.table_to_sheet(table);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        
        XLSX.writeFile(wb, finalFileName);

        showStatus(`تم بدء تنزيل "${finalFileName}".`, 'success');
    } catch (err) {
         console.error("Error saving file:", err);
         showStatus(`حدث خطأ أثناء إنشاء الملف.`, 'error');
    }
}

function renderTable(dataArray) {
    const tableContainer = document.createDocumentFragment();
    const existingTable = spreadsheetContainer.querySelector('table');
    if (existingTable) existingTable.remove();

    if (!dataArray || dataArray.length === 0) {
        placeholder.classList.remove('hidden');
        return;
    }

    placeholder.classList.add('hidden');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    const headerRow = document.createElement('tr');
    
    const headers = dataArray[0] || [];
    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
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
    tableContainer.appendChild(table);
    spreadsheetContainer.appendChild(tableContainer);
}

function createNewTable(cols, rows) {
    const headers = Array.from({length: cols}, (_, i) => `عمود ${i + 1}`);
    const data = [headers, ...Array.from({length: rows}, () => Array(cols).fill(''))];
    renderTable(data);

    originalRowCount = rows;
    addedRowCount = 0;
    deletedRowCount = 0;
    reportSection.classList.remove('hidden');
    updateReport();
    showStatus(`تم إنشاء جدول جديد (${cols} أعمدة, ${rows} صفوف).`, 'success');
}

function addRow() {
    const table = spreadsheetContainer.querySelector('table');
    if (!table) return;
    const columnCount = table.querySelector('thead tr').children.length;
    const tbody = table.querySelector('tbody');
    const tr = document.createElement('tr');
    for(let i = 0; i < columnCount; i++) {
        const td = document.createElement('td');
        td.setAttribute('contenteditable', 'true');
        td.innerHTML = '&nbsp;';
        tr.appendChild(td);
    };
    tbody.appendChild(tr);
    tr.cells[0].focus();
    addedRowCount++;
    updateReport();
}

function manipulateRows(filterFn) {
    const table = spreadsheetContainer.querySelector('table');
    if (!table) return { numChanged: 0 };
    const rows = table.querySelectorAll('tbody tr');
    let numChanged = 0;
    rows.forEach(row => {
        if (filterFn(row)) {
            row.remove();
            numChanged++;
        }
    });
    return { numChanged };
}

function performRowDeletion(keyword) {
    const trimmedKeyword = keyword.trim().toLowerCase();
    if (!trimmedKeyword) return;
    const { numChanged } = manipulateRows(row => row.textContent.toLowerCase().includes(trimmedKeyword));
    if (numChanged > 0) {
        deletedRowCount += numChanged;
        updateReport();
        showStatus(`تم حذف ${numChanged} سطور.`, 'success');
    } else {
        showStatus(`لم يتم العثور على سطور مطابقة.`, 'error');
    }
}

function performRowKeeping(keyword) {
    const trimmedKeyword = keyword.trim().toLowerCase();
    if (!trimmedKeyword) return;
    const { numChanged } = manipulateRows(row => !row.textContent.toLowerCase().includes(trimmedKeyword));
    if (numChanged > 0) {
        deletedRowCount += numChanged;
        updateReport();
        showStatus(`تم حذف ${numChanged} سطور.`, 'success');
    } else {
        showStatus(`تم الإبقاء على جميع السطور.`, 'info');
    }
}

function clearTable() {
    renderTable([]);
    reportSection.classList.add('hidden');
    originalRowCount = 0; addedRowCount = 0; deletedRowCount = 0;
}

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
    if(progressInterval) clearInterval(progressInterval);
    progressInterval = null;
    document.getElementById('loader-percentage').textContent = `100%`;
    setTimeout(() => loaderOverlay.classList.add('hidden'), 400);
}

function updateActionCount(keyword, type) {
    const trimmedKeyword = keyword.trim().toLowerCase();
    const counterEl = document.getElementById(`rowCount-${type}`);
    if (!trimmedKeyword) return counterEl.textContent = '';
    const table = spreadsheetContainer.querySelector('table');
    if (!table) return;

    let matchCount = Array.from(table.querySelectorAll('tbody tr')).filter(row => row.textContent.toLowerCase().includes(trimmedKeyword)).length;
    
    if (type === 'delete') counterEl.textContent = `سيتم حذف ${matchCount} سطور.`;
    else if (type === 'keep') counterEl.textContent = `سيتم الإبقاء على ${matchCount} سطور.`;
}

function updateModalButtonsState(hasData) {
    optionsModal.querySelectorAll('[data-action="add-row"], [data-action="open-delete-modal"], [data-action="open-keep-modal"], [data-action="clear-table"]').forEach(btn => btn.disabled = !hasData);
}

function updateReport() {
    remainingRowsEl.textContent = originalRowCount + addedRowCount - deletedRowCount;
    originalRowsEl.textContent = originalRowCount;
    addedRowsEl.textContent = addedRowCount;
    deletedRowsEl.textContent = deletedRowCount;
}

function showStatus(message, type) {
    const colorClass = type === 'error' ? 'text-red-500' : (type === 'success' ? 'text-emerald-500' : 'text-slate-500');
    statusMessage.textContent = message;
    statusMessage.className = `text-center text-sm h-5 mt-2 transition-opacity duration-300 ${colorClass}`;
    setTimeout(() => statusMessage.textContent = '', 4000);
}


  
