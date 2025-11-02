const semesterHeader = document.getElementById('semesterHeader');
const semesterCountLabel = document.getElementById('semesterCountLabel');
const taskList = document.getElementById('taskList');
const chart = document.getElementById('chart');
const bulkInput = document.getElementById('bulkInput');
const addDisciplinesBtn = document.getElementById('addDisciplines');
const addSemesterBtn = document.getElementById('addSemester');
const removeSemesterBtn = document.getElementById('removeSemester');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const dataDialog = document.getElementById('dataDialog');
const dataDialogTitle = document.getElementById('dataDialogTitle');
const dataDialogHint = document.getElementById('dataDialogHint');
const dataDialogConfirm = document.getElementById('dataDialogConfirm');
const dataTextarea = document.getElementById('dataTextarea');
const taskTemplate = document.getElementById('taskTemplate');

let semesterCount = 8;
let taskIdCounter = 1;
let tasks = [];
let pendingDialogMode = null;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function createTask(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    return {
        id: taskIdCounter++,
        name: trimmed,
        duration: 1,
        start: 0
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
}

function renderTaskList() {
    taskList.innerHTML = '';
    tasks.forEach(task => {
        ensureTaskBounds(task);
        const node = document.importNode(taskTemplate.content, true);
        const container = node.querySelector('.task-item');
        const nameEl = node.querySelector('.task-name');
        const durationInput = node.querySelector('.task-duration-input');
        const removeButton = node.querySelector('.task-remove');

        nameEl.textContent = task.name;
        durationInput.value = task.duration;
        durationInput.max = semesterCount;

        durationInput.addEventListener('change', () => {
            const newDuration = parseInt(durationInput.value, 10);
            if (Number.isNaN(newDuration)) return;
            task.duration = clamp(newDuration, 1, semesterCount);
            ensureTaskBounds(task);
            renderAll();
        });

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
        block.textContent = `${task.duration} сем.`;
        updateBlockPosition(block, task);

        block.addEventListener('pointerdown', startDrag);

        track.appendChild(block);
        row.appendChild(label);
        row.appendChild(track);
        chart.appendChild(row);
    });
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
            task.start = finalStart;
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

function handleExport() {
    const data = {
        semesters: semesterCount,
        tasks: tasks.map(task => ({
            id: task.id,
            name: task.name,
            duration: task.duration,
            start: task.start
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
            tasks = parsed.tasks
                .filter(task => task && typeof task.name === 'string')
                .map(task => ({
                    id: taskIdCounter++,
                    name: task.name.trim(),
                    duration: clamp(Math.floor(task.duration || 1), 1, semesterCount),
                    start: clamp(Math.floor(task.start || 0), 0, Math.max(0, semesterCount - 1))
                }));
            tasks.forEach(ensureTaskBounds);
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
exportBtn.addEventListener('click', handleExport);
importBtn.addEventListener('click', handleImport);

bulkInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        addTasksFromInput();
    }
});

renderAll();
