const semesterHeader = document.getElementById('semesterHeader');
const semesterCountLabel = document.getElementById('semesterCountLabel');
const taskList = document.getElementById('taskList');
const chart = document.getElementById('chart');
const creditsSummary = document.getElementById('creditsSummary');
const bulkInput = document.getElementById('bulkInput');
const addDisciplinesBtn = document.getElementById('addDisciplines');
const addSemesterBtn = document.getElementById('addSemester');
const removeSemesterBtn = document.getElementById('removeSemester');
const exportBtn = document.getElementById('exportBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const importBtn = document.getElementById('importBtn');
const dataDialog = document.getElementById('dataDialog');
const dataDialogTitle = document.getElementById('dataDialogTitle');
const dataDialogHint = document.getElementById('dataDialogHint');
const dataDialogConfirm = document.getElementById('dataDialogConfirm');
const dataTextarea = document.getElementById('dataTextarea');
const taskTemplate = document.getElementById('taskTemplate');
const maxCreditsInput = document.getElementById('maxCreditsInput');

let semesterCount = 8;
let taskIdCounter = 1;
let colorSeedCounter = 0;
let tasks = [];
let pendingDialogMode = null;

const DEFAULT_MAX_CREDITS_PER_TWO_SEMESTERS = 60;
let maxCreditsPerTwoSemesters = DEFAULT_MAX_CREDITS_PER_TWO_SEMESTERS;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function sanitizeCreditsValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
        return 0;
    }
    return Math.round(number * 2) / 2;
}

function sanitizeLimitValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return DEFAULT_MAX_CREDITS_PER_TWO_SEMESTERS;
    }
    const rounded = Math.round(number * 2) / 2;
    return clamp(rounded, 1, 400);
}

function formatCredits(value) {
    if (!Number.isFinite(value)) {
        return '';
    }
    const rounded = Math.round(value * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
        return String(Math.round(rounded));
    }
    if (Math.abs(rounded * 10 - Math.round(rounded * 10)) < 1e-9) {
        return (Math.round(rounded * 10) / 10).toString();
    }
    return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return String(text).replace(/[&<>"']/g, char => map[char]);
}

function syncTaskCredits(task) {
    if (!Array.isArray(task.credits)) {
        task.credits = new Array(task.duration).fill(0);
        return;
    }
    if (task.credits.length < task.duration) {
        while (task.credits.length < task.duration) {
            task.credits.push(0);
        }
    } else if (task.credits.length > task.duration) {
        task.credits = task.credits.slice(0, task.duration);
    }
    task.credits = task.credits.map(value => sanitizeCreditsValue(value));
}

function calculateSemesterTotals(taskList = tasks) {
    const totals = Array.from({ length: semesterCount }, () => 0);
    taskList.forEach(task => {
        const safeTask = {
            duration: task.duration,
            start: task.start,
            credits: Array.isArray(task.credits) ? [...task.credits] : []
        };
        syncTaskCredits(safeTask);
        for (let i = 0; i < safeTask.duration; i++) {
            const semesterIndex = safeTask.start + i;
            if (semesterIndex >= 0 && semesterIndex < semesterCount) {
                totals[semesterIndex] += Number(safeTask.credits[i]) || 0;
            }
        }
    });
    return totals;
}

function checkCreditLimits(taskList = tasks) {
    const totals = calculateSemesterTotals(taskList);
    for (let i = 0; i < semesterCount; i += 2) {
        const pairTotal = (totals[i] || 0) + (totals[i + 1] || 0);
        if (pairTotal > maxCreditsPerTwoSemesters + 1e-9) {
            return {
                valid: false,
                index: i,
                total: pairTotal,
                label: totals[i + 1] !== undefined ? `${i + 1}–${i + 2}` : `${i + 1}`
            };
        }
    }
    return { valid: true };
}

function allocateColorSeed() {
    return colorSeedCounter++;
}

function ensureTaskColor(task) {
    if (!Number.isFinite(task.colorSeed)) {
        task.colorSeed = allocateColorSeed();
    }
}

function getTaskColors(task) {
    ensureTaskColor(task);
    const seed = task.colorSeed;
    const hue = (seed * 137.508) % 360;
    const saturation = 65;
    const secondarySaturation = Math.min(saturation + 10, 100);
    const primaryLightness = 55;
    const secondaryLightness = Math.max(20, primaryLightness - 20);
    const backgroundLightness = 86;
    return {
        primary: `hsl(${hue}, ${saturation}%, ${primaryLightness}%)`,
        secondary: `hsl(${hue}, ${secondarySaturation}%, ${secondaryLightness}%)`,
        excelBackground: hslToHex(hue, saturation, backgroundLightness)
    };
}

function hslToHex(h, s, l) {
    const hue = ((h % 360) + 360) % 360;
    const saturation = clamp(s, 0, 100) / 100;
    const lightness = clamp(l, 0, 100) / 100;
    const k = n => (n + hue / 30) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    const f = n => {
        const channel = lightness - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(channel * 255)
            .toString(16)
            .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function createTask(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    return {
        id: taskIdCounter++,
        name: trimmed,
        duration: 1,
        start: 0,
        credits: [0],
        colorSeed: allocateColorSeed()
    };
}

function addTasksFromInput() {
    const lines = bulkInput.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {
        return;
    }
    const newTasks = lines.map(createTask).filter(Boolean);
    tasks = tasks.concat(newTasks);
    bulkInput.value = '';
    renderAll();
}

function renderSemesterHeader() {
    semesterHeader.innerHTML = '';
    semesterHeader.style.gridTemplateColumns = `repeat(${semesterCount}, 1fr)`;
    for (let i = 0; i < semesterCount; i++) {
        const span = document.createElement('span');
        span.textContent = `${i + 1}-й семестр`;
        semesterHeader.appendChild(span);
    }
    semesterCountLabel.textContent = `${semesterCount} сем.`;
}

function ensureTaskBounds(task) {
    task.duration = clamp(task.duration, 1, semesterCount);
    if (task.start + task.duration > semesterCount) {
        task.start = Math.max(0, semesterCount - task.duration);
    }
    task.start = clamp(task.start, 0, Math.max(0, semesterCount - task.duration));
    syncTaskCredits(task);
    ensureTaskColor(task);
}

function renderTaskList() {
    taskList.innerHTML = '';
    tasks.forEach(task => {
        ensureTaskBounds(task);
        const node = document.importNode(taskTemplate.content, true);
        const container = node.querySelector('.task-item');
        const nameEl = node.querySelector('.task-name');
        const durationInput = node.querySelector('.task-duration-input');
        const workloadInputs = node.querySelector('.task-workload-inputs');
        const removeButton = node.querySelector('.task-remove');

        nameEl.textContent = task.name;
        durationInput.value = task.duration;
        durationInput.max = semesterCount;

        durationInput.addEventListener('change', () => {
            const newDuration = parseInt(durationInput.value, 10);
            if (Number.isNaN(newDuration)) return;
            const previousDuration = task.duration;
            task.duration = clamp(newDuration, 1, semesterCount);
            if (task.duration > previousDuration) {
                while (task.credits.length < task.duration) {
                    task.credits.push(0);
                }
            } else if (task.duration < previousDuration) {
                task.credits = task.credits.slice(0, task.duration);
            }
            ensureTaskBounds(task);
            renderAll();
        });

        workloadInputs.innerHTML = '';
        for (let i = 0; i < task.duration; i++) {
            const semesterIndex = task.start + i;
            const entry = document.createElement('label');
            entry.className = 'task-workload-entry';

            const label = document.createElement('span');
            label.textContent = `${semesterIndex + 1}-й сем.`;

            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.step = '0.5';
            input.value = formatCredits(task.credits[i] || 0);
            input.inputMode = 'decimal';

            input.addEventListener('change', () => {
                const previousValue = task.credits[i] || 0;
                const newValue = sanitizeCreditsValue(input.value);
                task.credits[i] = newValue;
                const validation = checkCreditLimits();
                if (!validation.valid) {
                    alert(`Превышена суммарная трудоёмкость для ${validation.label} семестров. Лимит ${formatCredits(maxCreditsPerTwoSemesters)} з.е.`);
                    task.credits[i] = previousValue;
                    input.value = formatCredits(previousValue);
                    return;
                }
                input.value = formatCredits(newValue);
                renderAll();
            });

            entry.appendChild(label);
            entry.appendChild(input);
            workloadInputs.appendChild(entry);
        }

        removeButton.addEventListener('click', () => {
            tasks = tasks.filter(t => t.id !== task.id);
            renderAll();
        });

        taskList.appendChild(container);
    });
}

function renderChart() {
    chart.innerHTML = '';
    tasks.forEach(task => {
        ensureTaskBounds(task);
        const row = document.createElement('div');
        row.className = 'chart-row';

        const label = document.createElement('div');
        label.className = 'chart-label';
        label.textContent = task.name;

        const track = document.createElement('div');
        track.className = 'chart-track';
        track.style.setProperty('--semester-count', semesterCount);

        const block = document.createElement('div');
        block.className = 'task-block';
        block.dataset.taskId = task.id;
        const totalCredits = task.credits.reduce((sum, credit) => sum + (Number(credit) || 0), 0);
        block.textContent = `${formatCredits(totalCredits)} з.е.`;
        block.title = task.credits
            .map((credit, index) => {
                const semesterNumber = task.start + index + 1;
                return `${semesterNumber}-й семестр: ${formatCredits(Number(credit) || 0)} з.е.`;
            })
            .join('\n');
        const colors = getTaskColors(task);
        block.style.setProperty('--task-color', colors.primary);
        block.style.setProperty('--task-color-alt', colors.secondary);
        updateBlockPosition(block, task);

        block.addEventListener('pointerdown', startDrag);

        track.appendChild(block);
        row.appendChild(label);
        row.appendChild(track);
        chart.appendChild(row);
    });
}

function renderCreditsSummary() {
    if (!creditsSummary) return;
    const totals = calculateSemesterTotals();
    creditsSummary.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'credits-summary__title';
    title.textContent = 'Распределение трудоёмкости';
    creditsSummary.appendChild(title);

    const semestersContainer = document.createElement('div');
    semestersContainer.className = 'credits-semesters';
    totals.forEach((value, index) => {
        const semesterEl = document.createElement('div');
        semesterEl.className = 'credits-semester';

        const labelEl = document.createElement('div');
        labelEl.className = 'credits-semester__label';
        labelEl.textContent = `${index + 1}-й сем.`;

        const valueEl = document.createElement('div');
        valueEl.className = 'credits-semester__value';
        valueEl.textContent = `${formatCredits(value)} з.е.`;

        semesterEl.appendChild(labelEl);
        semesterEl.appendChild(valueEl);
        semestersContainer.appendChild(semesterEl);
    });
    creditsSummary.appendChild(semestersContainer);

    const pairsContainer = document.createElement('div');
    pairsContainer.className = 'credits-pairs';
    for (let i = 0; i < semesterCount; i += 2) {
        const pairSum = (totals[i] || 0) + (totals[i + 1] || 0);
        const pairEl = document.createElement('div');
        pairEl.className = 'credits-pair';
        if (pairSum > maxCreditsPerTwoSemesters + 1e-9) {
            pairEl.classList.add('credits-pair--exceeded');
        }

        const pairTitle = document.createElement('div');
        pairTitle.className = 'credits-pair__title';
        pairTitle.textContent = totals[i + 1] !== undefined ? `${i + 1}–${i + 2} сем.` : `${i + 1}-й сем.`;

        const pairTotal = document.createElement('div');
        pairTotal.className = 'credits-pair__total';
        pairTotal.textContent = `${formatCredits(pairSum)} з.е.`;

        const pairLimit = document.createElement('div');
        pairLimit.className = 'credits-pair__limit';
        pairLimit.textContent = `Лимит ${formatCredits(maxCreditsPerTwoSemesters)} з.е.`;

        pairEl.appendChild(pairTitle);
        pairEl.appendChild(pairTotal);
        pairEl.appendChild(pairLimit);

        if (pairSum > maxCreditsPerTwoSemesters + 1e-9) {
            const exceedEl = document.createElement('div');
            exceedEl.className = 'credits-pair__exceed';
            exceedEl.textContent = `Превышение на ${formatCredits(pairSum - maxCreditsPerTwoSemesters)} з.е.`;
            pairEl.appendChild(exceedEl);
        }

        pairsContainer.appendChild(pairEl);
    }
    creditsSummary.appendChild(pairsContainer);
}

function updateBlockPosition(block, task) {
    const widthPercent = (task.duration / semesterCount) * 100;
    const leftPercent = (task.start / semesterCount) * 100;
    block.style.width = `calc(${widthPercent}% - 6px)`;
    block.style.left = `calc(${leftPercent}% + 3px)`;
}

function startDrag(event) {
    const block = event.currentTarget;
    const taskId = Number(block.dataset.taskId);
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    event.preventDefault();

    const track = block.parentElement;
    const trackRect = track.getBoundingClientRect();
    const columnWidth = trackRect.width / semesterCount;
    const initialStart = task.start;
    const offset = event.clientX - trackRect.left - initialStart * columnWidth;

    block.setPointerCapture(event.pointerId);
    block.classList.add('dragging');
    block.dataset.tempStart = String(task.start);

    function handleMove(e) {
        const rawLeft = e.clientX - trackRect.left - offset;
        let newStart = Math.round(rawLeft / columnWidth);
        newStart = clamp(newStart, 0, Math.max(0, semesterCount - task.duration));
        const tempTask = { ...task, start: newStart };
        updateBlockPosition(block, tempTask);
        block.dataset.tempStart = String(newStart);
    }

    function handleUp(e) {
        block.releasePointerCapture(e.pointerId);
        block.classList.remove('dragging');
        block.removeEventListener('pointermove', handleMove);
        block.removeEventListener('pointerup', handleUp);
        block.removeEventListener('pointercancel', handleCancel);

        const finalStart = Number(block.dataset.tempStart);
        if (!Number.isNaN(finalStart)) {
            const previousStart = task.start;
            task.start = finalStart;
            const validation = checkCreditLimits();
            if (!validation.valid) {
                alert(`Превышена суммарная трудоёмкость для ${validation.label} семестров. Лимит ${formatCredits(maxCreditsPerTwoSemesters)} з.е.`);
                task.start = previousStart;
            }
        }
        renderAll();
    }

    function handleCancel(e) {
        block.releasePointerCapture(e.pointerId);
        block.classList.remove('dragging');
        block.removeEventListener('pointermove', handleMove);
        block.removeEventListener('pointerup', handleUp);
        block.removeEventListener('pointercancel', handleCancel);
        renderAll();
    }

    block.addEventListener('pointermove', handleMove);
    block.addEventListener('pointerup', handleUp);
    block.addEventListener('pointercancel', handleCancel);
}

function handleExportJson() {
    tasks.forEach(ensureTaskBounds);
    const data = {
        semesters: semesterCount,
        maxCreditsPerTwoSemesters,
        tasks: tasks.map(task => ({
            id: task.id,
            name: task.name,
            duration: task.duration,
            start: task.start,
            credits: Array.isArray(task.credits)
                ? task.credits.map(value => sanitizeCreditsValue(value))
                : [],
            colorSeed: task.colorSeed
        }))
    };
    const json = JSON.stringify(data, null, 2);
    openDialog({
        mode: 'export',
        title: 'Экспорт данных',
        hint: 'Скопируйте JSON и сохраните его. Позднее его можно импортировать обратно.',
        value: json
    });
}

function handleExportExcel() {
    tasks.forEach(ensureTaskBounds);
    const headerCells = Array.from({ length: semesterCount }, (_, index) => `<th>${index + 1}-й сем.</th>`).join('');
    const semesterTotals = calculateSemesterTotals();
    const totalCreditsAll = semesterTotals.reduce((sum, value) => sum + value, 0);

    const rowsHtml = tasks.map(task => {
        const taskTotal = task.credits.reduce((sum, credit) => sum + (Number(credit) || 0), 0);
        let cells = `<td class="name-cell">${escapeHtml(task.name)}</td>`;
        const colors = getTaskColors(task);
        for (let semesterIndex = 0; semesterIndex < semesterCount; semesterIndex++) {
            const relativeIndex = semesterIndex - task.start;
            const isActive = relativeIndex >= 0 && relativeIndex < task.duration;
            let content = '';
            let cellClass = '';
            let styleAttr = '';
            if (isActive) {
                const creditValue = task.credits[relativeIndex] || 0;
                content = `${formatCredits(creditValue)} з.е.`;
                cellClass = 'highlight-cell';
                styleAttr = ` style="--cell-bg: ${colors.excelBackground};"`;
            }
            cells += `<td class="${cellClass}"${styleAttr}>${content}</td>`;
        }
        cells += `<td class="total-cell">${formatCredits(taskTotal)} з.е.</td>`;
        return `<tr>${cells}</tr>`;
    }).join('');

    const totalsRow = `<tr class="totals-row"><td class="name-cell">Итого</td>${semesterTotals
        .map(value => `<td class="total-cell">${formatCredits(value)} з.е.</td>`)
        .join('')}<td class="total-cell">${formatCredits(totalCreditsAll)} з.е.</td></tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #c7d2fe; padding: 8px; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12pt; }
        th { background: #e0e7ff; font-weight: 700; }
        .name-cell { text-align: left; font-weight: 600; }
        .highlight-cell { background: var(--cell-bg, #dbeafe); font-weight: 600; color: #1f2430; }
        .total-cell { background: #ede9fe; font-weight: 600; }
        .totals-row td { border-top: 2px solid #4338ca; }
    </style></head><body><table>
        <thead>
            <tr><th>Дисциплина</th>${headerCells}<th>Общая трудоёмкость</th></tr>
        </thead>
        <tbody>
            ${rowsHtml || ''}
        </tbody>
        <tfoot>
            ${totalsRow}
        </tfoot>
    </table></body></html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plan.xls';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function handleImport() {
    openDialog({
        mode: 'import',
        title: 'Импорт данных',
        hint: 'Вставьте ранее сохранённый JSON и нажмите «Ок».',
        value: ''
    });
}

function openDialog({ mode, title, hint, value }) {
    pendingDialogMode = mode;
    dataDialogTitle.textContent = title;
    dataDialogHint.textContent = hint;
    dataTextarea.value = value;

    if (mode === 'export') {
        dataDialogConfirm.textContent = 'Готово';
    } else {
        dataDialogConfirm.textContent = 'Ок';
    }

    if (typeof dataDialog.showModal === 'function') {
        dataDialog.showModal();
    } else {
        dataDialog.setAttribute('open', 'true');
    }
}

dataDialog.addEventListener('close', () => {
    dataTextarea.value = '';
    pendingDialogMode = null;
});

dataDialog.addEventListener('cancel', () => {
    dataTextarea.value = '';
    pendingDialogMode = null;
});

dataDialog.addEventListener('submit', (event) => {
    event.preventDefault();
    if (pendingDialogMode === 'import') {
        try {
            const parsed = JSON.parse(dataTextarea.value);
            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error('Некорректный формат данных.');
            }
            if (typeof parsed.semesters !== 'number' || !Array.isArray(parsed.tasks)) {
                throw new Error('Отсутствуют необходимые поля.');
            }
            semesterCount = clamp(Math.floor(parsed.semesters), 1, 20);
            if (parsed.maxCreditsPerTwoSemesters !== undefined) {
                maxCreditsPerTwoSemesters = sanitizeLimitValue(parsed.maxCreditsPerTwoSemesters);
            } else {
                maxCreditsPerTwoSemesters = DEFAULT_MAX_CREDITS_PER_TWO_SEMESTERS;
            }
            if (maxCreditsInput) {
                maxCreditsInput.value = formatCredits(maxCreditsPerTwoSemesters);
            }
            let nextId = taskIdCounter;
            let maxId = taskIdCounter - 1;
            const usedColorSeeds = new Set();
            let fallbackColorSeed = 0;
            let maxColorSeed = -1;
            const importedTasks = parsed.tasks
                .filter(task => task && typeof task.name === 'string')
                .map(task => {
                    const duration = clamp(Math.floor(task.duration || 1), 1, semesterCount);
                    const start = clamp(Math.floor(task.start || 0), 0, Math.max(0, semesterCount - 1));
                    const creditsSource = Array.isArray(task.credits) ? task.credits : [];
                    const credits = [];
                    for (let i = 0; i < duration; i++) {
                        credits.push(sanitizeCreditsValue(creditsSource[i]));
                    }
                    const idFromData = Number(task.id);
                    const id = Number.isFinite(idFromData) ? Math.floor(idFromData) : nextId++;
                    maxId = Math.max(maxId, id);
                    const colorSeedCandidate = Number(task.colorSeed ?? task.colorIndex);
                    let colorSeed;
                    if (Number.isFinite(colorSeedCandidate) && colorSeedCandidate >= 0) {
                        colorSeed = Math.floor(colorSeedCandidate);
                        if (usedColorSeeds.has(colorSeed)) {
                            while (usedColorSeeds.has(fallbackColorSeed)) {
                                fallbackColorSeed++;
                            }
                            colorSeed = fallbackColorSeed++;
                        }
                    } else {
                        while (usedColorSeeds.has(fallbackColorSeed)) {
                            fallbackColorSeed++;
                        }
                        colorSeed = fallbackColorSeed++;
                    }
                    usedColorSeeds.add(colorSeed);
                    maxColorSeed = Math.max(maxColorSeed, colorSeed);
                    return {
                        id,
                        name: task.name.trim(),
                        duration,
                        start,
                        credits,
                        colorSeed
                    };
                });
            importedTasks.forEach(ensureTaskBounds);
            const validation = checkCreditLimits(importedTasks);
            if (!validation.valid) {
                throw new Error(`Превышена трудоёмкость для ${validation.label} семестров после импорта.`);
            }
            tasks = importedTasks;
            taskIdCounter = Math.max(maxId + 1, nextId);
            colorSeedCounter = Math.max(maxColorSeed + 1, fallbackColorSeed);
            renderAll();
        } catch (error) {
            alert(error.message || 'Не удалось импортировать данные.');
            return;
        }
    }
    if (typeof dataDialog.close === 'function') {
        dataDialog.close();
    } else {
        dataDialog.removeAttribute('open');
    }
});

function renderAll() {
    tasks.forEach(ensureTaskBounds);
    renderSemesterHeader();
    renderTaskList();
    renderChart();
    renderCreditsSummary();
}

addDisciplinesBtn.addEventListener('click', addTasksFromInput);
addSemesterBtn.addEventListener('click', () => {
    semesterCount = clamp(semesterCount + 1, 1, 20);
    renderAll();
});
removeSemesterBtn.addEventListener('click', () => {
    semesterCount = clamp(semesterCount - 1, 1, 20);
    renderAll();
});
exportBtn.addEventListener('click', handleExportJson);
exportExcelBtn.addEventListener('click', handleExportExcel);
importBtn.addEventListener('click', handleImport);

if (maxCreditsInput) {
    maxCreditsInput.value = formatCredits(maxCreditsPerTwoSemesters);
    maxCreditsInput.addEventListener('change', () => {
        maxCreditsPerTwoSemesters = sanitizeLimitValue(maxCreditsInput.value);
        maxCreditsInput.value = formatCredits(maxCreditsPerTwoSemesters);
        renderAll();
        const validation = checkCreditLimits();
        if (!validation.valid) {
            alert(`Текущая нагрузка превышает лимит для ${validation.label} семестров. Лимит ${formatCredits(maxCreditsPerTwoSemesters)} з.е.`);
        }
    });
}

bulkInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        addTasksFromInput();
    }
});

renderAll();
