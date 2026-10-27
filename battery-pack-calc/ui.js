/**
 * Модуль интерфейса (UI) и взаимодействия с пользователем
 */

let currentMarkerIndex = 1;
const HIGH_IR_THRESHOLD = 75; // Порог высокого IR в мОм
let globalCalculatedGroups = []; // Для хранения результатов перед экспортом в CSV

document.addEventListener('DOMContentLoaded', () => {
    generateBaseList();
    
    document.getElementById('rebuildBaseListBtn').addEventListener('click', generateBaseList);
    document.getElementById('addExtraCellBtn').addEventListener('click', addExtraCellRow);
    document.getElementById('clearAllBtn').addEventListener('click', clearAllFields);
    document.getElementById('demoDataBtn').addEventListener('click', fillDemoData);
    document.getElementById('exportCsvBtn').addEventListener('click', exportToCsv);
    document.getElementById('calculateBtn').addEventListener('click', handleCalculation);

    // ДОБАВИТЬ ВНУТРЬ document.addEventListener('DOMContentLoaded', () => { ... })
    document.getElementById('exportInputsBtn').addEventListener('click', exportInputsToJson);
    document.getElementById('importInputsBtn').addEventListener('click', () => {
        document.getElementById('fileImportSelector').click();
    });
    document.getElementById('fileImportSelector').addEventListener('change', importInputsFromJson);

});

function generateBaseList() {
    const sCount = parseInt(document.getElementById('sCount').value) || 1;
    const pCount = parseInt(document.getElementById('pCount').value) || 1;
    const prefix = document.getElementById('markerPrefix').value || '';
    const startIndex = parseInt(document.getElementById('nextIndex').value) || 1;
    
    const container = document.getElementById('cellsListContainer');
    container.innerHTML = '';
    
    currentMarkerIndex = startIndex;
    const totalRequired = sCount * pCount;

    for (let i = 0; i < totalRequired; i++) {
        createCellRow(container, prefix, currentMarkerIndex, false);
        currentMarkerIndex++;
    }
    
    updateCounter();
    checkFieldsCompletion();
}

function addExtraCellRow() {
    const prefix = document.getElementById('markerPrefix').value || '';
    const container = document.getElementById('cellsListContainer');
    
    createCellRow(container, prefix, currentMarkerIndex, true);
    currentMarkerIndex++;
    updateCounter();
    checkFieldsCompletion();
}

function createCellRow(container, prefix, index, isExtra) {
    const row = document.createElement('div');
    row.className = `cell-input-row ${isExtra ? 'extra-row' : ''}`;
    
    const markerText = `${prefix}${index}`;
    
    row.innerHTML = `
        <div class="marker-label" title="${markerText}">${markerText}</div>
        <input type="number" class="cell-capacity-input" placeholder="Емкость, мАч" required min="1">
        <input type="number" class="cell-ir-input" placeholder="Сопротивление, мОм" required min="1">
        <div>
            ${isExtra ? `<button type="button" class="btn btn-danger" style="padding: 4px 10px; font-size: 0.8rem;" onclick="removeExtraRow(this)">Удалить</button>` : ''}
        </div>
    `;
    
    const capInput = row.querySelector('.cell-capacity-input');
    const irInput = row.querySelector('.cell-ir-input');

    [capInput, irInput].forEach(input => {
        input.addEventListener('input', () => {
            row.classList.remove('invalid-row');
            checkFieldsCompletion();
        });
    });

    irInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (val > HIGH_IR_THRESHOLD) {
            e.target.classList.add('ir-warning');
            e.target.title = "Высокое сопротивление! Ячейка будет сильно греться под нагрузкой самоката.";
        } else {
            e.target.classList.remove('ir-warning');
            e.target.removeAttribute('title');
        }
    });

    row.dataset.marker = markerText;
    container.appendChild(row);
}

window.removeExtraRow = function(buttonElement) {
    const row = buttonElement.closest('.cell-input-row');
    if (row) {
        row.remove();
        updateCounter();
        checkFieldsCompletion();
    }
};

function checkFieldsCompletion() {
    const sCount = parseInt(document.getElementById('sCount').value) || 1;
    const pCount = parseInt(document.getElementById('pCount').value) || 1;
    const totalRequired = sCount * pCount;
    
    const rows = document.querySelectorAll('.cell-input-row');
    const calculateBtn = document.getElementById('calculateBtn');
    
    let allFilled = true;
    let filledCount = 0;

    rows.forEach(row => {
        const cap = row.querySelector('.cell-capacity-input').value.trim();
        const ir = row.querySelector('.cell-ir-input').value.trim();
        if (cap === '' || ir === '') {
            allFilled = false;
        } else {
            filledCount++;
        }
    });

    calculateBtn.disabled = (!allFilled || filledCount < totalRequired);
}

function clearAllFields() {
    document.querySelectorAll('.cell-capacity-input').forEach(i => i.value = '');
    document.querySelectorAll('.cell-ir-input').forEach(i => {
        i.value = '';
        i.classList.remove('ir-warning');
    });
    document.querySelectorAll('.cell-input-row').forEach(row => row.classList.remove('invalid-row'));
    checkFieldsCompletion();
}

function fillDemoData() {
    document.querySelectorAll('.cell-input-row').forEach(row => {
        const capInput = row.querySelector('.cell-capacity-input');
        const irInput = row.querySelector('.cell-ir-input');
        
        capInput.value = Math.floor(Math.random() * (2600 - 1800) + 1800); 
        const randomIr = Math.floor(Math.random() * (95 - 25) + 25);
        irInput.value = randomIr;
        
        if (randomIr > HIGH_IR_THRESHOLD) {
            irInput.classList.add('ir-warning');
        } else {
            irInput.classList.remove('ir-warning');
        }
        row.classList.remove('invalid-row');
    });
    checkFieldsCompletion();
}

function updateCounter() {
    const count = document.querySelectorAll('.cell-input-row').length;
    document.getElementById('totalInputCounter').innerText = count;
}

// Обработка клика по кнопке расчета
function handleCalculation() {
    const sCount = parseInt(document.getElementById('sCount').value) || 1;
    const pCount = parseInt(document.getElementById('pCount').value) || 1;
    const totalRequired = sCount * pCount;

    const errorDiv = document.getElementById('errorOutput');
    const resultDiv = document.getElementById('resultSection');
    
    errorDiv.style.display = 'none';
    resultDiv.style.display = 'none';

    const rowElements = document.querySelectorAll('.cell-input-row');
    const parsedCells = [];
    let hasErrors = false;

    rowElements.forEach(row => {
        const capacityInput = row.querySelector('.cell-capacity-input');
        const irInput = row.querySelector('.cell-ir-input');
        const capacity = parseInt(capacityInput.value);
        const ir = parseInt(irInput.value);

        if (isNaN(capacity) || isNaN(ir) || capacity <= 0 || ir <= 0) {
            hasErrors = true;
            row.classList.add('invalid-row');
        } else {
            row.classList.remove('invalid-row');
            parsedCells.push({ marker: row.dataset.marker, capacity: capacity, ir: ir });
        }
    });

    if (hasErrors) {
        errorDiv.innerText = 'Ошибка: Заполните все подсвеченные строки корректными числами.';
        errorDiv.style.display = 'block';
        return;
    }

    // Вызываем изолированный метод балансировки из balancing.js
    const result = BalancingCore.balancePack(parsedCells, sCount, pCount);
    globalCalculatedGroups = result.groups;

    // Вывод результатов на страницу
    document.getElementById('deltaOutput').innerText = `${result.delta} мАч`;

    const matrixContainer = document.getElementById('matrixContainer');
    matrixContainer.innerHTML = '';

    result.groups.forEach(g => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'parallel-group';
        
        const approxPackIr = BalancingCore.calculateApproxIr(g.cells);
        groupDiv.innerHTML = `<h3>Параллель S${g.id} (Общая емкость: ${g.totalCapacity} мАч, ~IR: ${approxPackIr} мОм)</h3>`;
        
        const cellsGrid = document.createElement('div');
        cellsGrid.className = 'cells-grid';

        g.cells.forEach(c => {
            const cellCard = document.createElement('div');
            cellCard.className = 'cell-card';
            cellCard.innerHTML = `
                <div class="cell-marker">${c.marker}</div>
                <div><b>${c.capacity}</b> мАч</div>
                <div><b>${c.ir}</b> мОм</div>
            `;
            cellsGrid.appendChild(cellCard);
        });

        groupDiv.appendChild(cellsGrid);
        matrixContainer.appendChild(groupDiv);
    });

    const unusedContainer = document.getElementById('unusedContainer');
    unusedContainer.innerHTML = '';

    if (result.unusedCells.length === 0) {
        unusedContainer.innerHTML = '<p style="color: #64748b; font-size: 0.95rem;">Все внесенные банки пошли в сборку, избытка элементов нет.</p>';
    } else {
        result.unusedCells.forEach(c => {
            const cellCard = document.createElement('div');
            cellCard.className = 'cell-card unused-card';
            cellCard.innerHTML = `
                <div class="cell-marker">${c.marker}</div>
                <div><b>${c.capacity}</b> мАч</div>
                <div><b>${c.ir}</b> мОм</div>
            `;
            unusedContainer.appendChild(cellCard);
        });
    }

    resultDiv.style.display = 'block';
}

function exportToCsv() {
    if (globalCalculatedGroups.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Параллель,Общая емкость (мАч),Ячейка,Емкость ячейки (мАч),Внутреннее сопротивление (мОм)\n";

    globalCalculatedGroups.forEach(g => {
        g.cells.forEach((c, index) => {
            const groupName = `S${g.id}`;
            const groupCap = index === 0 ? g.totalCapacity : "";
            csvContent += `"${groupName}","${groupCap}","${c.marker}","${c.capacity}","${c.ir}"\n`;
        });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `battery_pack_layout_${document.getElementById('sCount').value}S.csv`);
    document.body.appendChild(link);
    link.click(); // Вызываем клик для скачивания файла
    document.body.removeChild(link);
}

// ДОБАВИТЬ В КОНЕЦ ФАЙЛА ui.js

// Функция экспорта введенных данных (емкости и IR) в JSON-файл
function exportInputsToJson() {
    const rows = document.querySelectorAll('.cell-input-row');
    const dataToExport = {
        sCount: parseInt(document.getElementById('sCount').value) || 7,
        pCount: parseInt(document.getElementById('pCount').value) || 4,
        prefix: document.getElementById('markerPrefix').value || 'BAT-',
        cells: []
    };

    rows.forEach(row => {
        const cap = row.querySelector('.cell-capacity-input').value.trim();
        const ir = row.querySelector('.cell-ir-input').value.trim();
        
        // Экспортируем строку, даже если она заполнена частично
        dataToExport.cells.push({
            marker: row.dataset.marker,
            capacity: cap !== '' ? parseInt(cap) : '',
            ir: ir !== '' ? parseInt(ir) : '',
            isExtra: row.classList.contains('extra-row')
        });
    });

    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `battery_cells_data_${dataToExport.sCount}S${dataToExport.pCount}P.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Функция импорта сохраненных данных из JSON-файла обратно в форму ввода
function importInputsFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // Проверка базовой структуры файла
            if (!importedData.cells || !Array.isArray(importedData.cells)) {
                alert("Ошибка: Неверный формат файла данных.");
                return;
            }

            // Восстанавливаем настройки схемы
            document.getElementById('sCount').value = importedData.sCount || 7;
            document.getElementById('pCount').value = importedData.pCount || 4;
            document.getElementById('markerPrefix').value = importedData.prefix || 'BAT-';

            // Очищаем текущий контейнер ввода
            const container = document.getElementById('cellsListContainer');
            container.innerHTML = '';

            // Восстанавливаем строки ввода банок из файла
            importedData.cells.forEach(cellData => {
                const row = document.createElement('div');
                row.className = `cell-input-row ${cellData.isExtra ? 'extra-row' : ''}`;
                row.dataset.marker = cellData.marker;

                row.innerHTML = `
                    <div class="marker-label" title="${cellData.marker}">${cellData.marker}</div>
                    <input type="number" class="cell-capacity-input" placeholder="Емкость, мАч" required min="1" value="${cellData.capacity}">
                    <input type="number" class="cell-ir-input" placeholder="Сопротивление, мОм" required min="1" value="${cellData.ir}">
                    <div>
                        ${cellData.isExtra ? `<button type="button" class="btn btn-danger" style="padding: 4px 10px; font-size: 0.8rem;" onclick="removeExtraRow(this)">Удалить</button>` : ''}
                    </div>
                `;

                // Навешиваем валидацию и мониторинг IR на восстановленные инпуты
                const capInput = row.querySelector('.cell-capacity-input');
                const irInput = row.querySelector('.cell-ir-input');

                [capInput, irInput].forEach(input => {
                    input.addEventListener('input', () => {
                        row.classList.remove('invalid-row');
                        checkFieldsCompletion();
                    });
                });

                irInput.addEventListener('input', (ev) => {
                    const val = parseInt(ev.target.value);
                    if (val > HIGH_IR_THRESHOLD) {
                        ev.target.classList.add('ir-warning');
                    } else {
                        ev.target.classList.remove('ir-warning');
                    }
                });

                // Восстанавливаем класс предупреждения для высокого IR, если оно уже было в файле
                if (parseInt(cellData.ir) > HIGH_IR_THRESHOLD) {
                    irInput.classList.add('ir-warning');
                }

                container.appendChild(row);
            });

            // Корректируем глобальный индекс маркеров, чтобы новые доп. банки не дублировали имена
            if (importedData.cells.length > 0) {
                const matches = importedData.cells[importedData.cells.length - 1].marker.match(/\d+$/);
                if (matches) {
                    currentMarkerIndex = parseInt(matches[0]) + 1;
                }
            }

            // Обновляем счетчики, скрываем старые результаты и проверяем заполненность
            updateCounter();
            checkFieldsCompletion();
            document.getElementById('resultSection').style.display = 'none';
            document.getElementById('errorOutput').style.display = 'none';
            
            // Сбрасываем выбор файла, чтобы можно было загрузить тот же файл повторно
            event.target.value = '';

        } catch (err) {
            alert("Ошибка при чтении файла JSON: " + err.message);
        }
    };
    reader.readAsText(file);
}
