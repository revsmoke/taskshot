import { dbService } from './db-service.js';
import { backgroundService } from './background.js';

document.addEventListener('DOMContentLoaded', () => {
    // Get UI elements
    const startButton = document.getElementById('startTracking');
    const pauseButton = document.getElementById('pauseTracking');
    const settingsForm = document.querySelector('.settings-form');
    const intervalInput = document.getElementById('captureInterval');
    const addProjectButton = document.getElementById('addProject');
    const addManualTaskButton = document.getElementById('addManualTask');
    const projectFilter = document.getElementById('projectFilter');
    const dateFilter = document.getElementById('dateFilter');
    const clearFiltersButton = document.getElementById('clearFilters');
    const projectList = document.getElementById('projectList');
    const defaultProjectSelect = document.getElementById('defaultProject');

    // Project Management
    let projects = JSON.parse(localStorage.getItem('projects')) || [
        { id: 'default', name: 'Default', color: '#3498db', billableRate: 0, defaultBillable: true }
    ];

    // Task Templates Management
    let templates = JSON.parse(localStorage.getItem('task_templates')) || [];
    let categories = JSON.parse(localStorage.getItem('task_categories')) || [
        { id: 'development', name: 'Development', color: '#3498db' },
        { id: 'meeting', name: 'Meeting', color: '#e74c3c' },
        { id: 'planning', name: 'Planning', color: '#2ecc71' },
        { id: 'research', name: 'Research', color: '#9b59b6' }
    ];

    function saveProjects() {
        localStorage.setItem('projects', JSON.stringify(projects));
        updateProjectLists();
    }

    function saveTemplates() {
        localStorage.setItem('task_templates', JSON.stringify(templates));
        updateTemplateList();
    }

    function saveCategories() {
        localStorage.setItem('task_categories', JSON.stringify(categories));
        updateCategoryList();
        updateCategorySelectors();
    }

    function updateProjectLists() {
        // Update project list display
        projectList.innerHTML = projects.map(project => `
            <div class="project-item" style="background-color: ${project.color}20; border-left: 4px solid ${project.color}">
                <span>${project.name}</span>
                <div class="project-actions">
                    <button class="btn" onclick="editProject('${project.id}')">Edit</button>
                    ${project.id !== 'default' ? `<button class="btn btn-danger" onclick="deleteProject('${project.id}')">Delete</button>` : ''}
                </div>
            </div>
        `).join('');

        // Update project selectors
        const projectOptions = projects.map(project => 
            `<option value="${project.id}">${project.name}</option>`
        ).join('');
        
        projectFilter.innerHTML = '<option value="">All Projects</option>' + projectOptions;
        defaultProjectSelect.innerHTML = projectOptions;
        document.getElementById('taskProject').innerHTML = projectOptions;
    }

    function updateTemplateList() {
        const templateList = document.getElementById('templateList');
        templateList.innerHTML = templates.map(template => `
            <div class="template-item">
                <span>${template.name}</span>
                <div class="template-actions">
                    <button class="btn" onclick="useTemplate('${template.id}')">Use</button>
                    <button class="btn" onclick="editTemplate('${template.id}')">Edit</button>
                    <button class="btn btn-danger" onclick="deleteTemplate('${template.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    }

    function updateCategoryList() {
        const categoryList = document.getElementById('categoryList');
        categoryList.innerHTML = categories.map(category => `
            <div class="category-item" style="border-left: 4px solid ${category.color}">
                <span>${category.name}</span>
                <div class="category-actions">
                    <button class="btn" onclick="editCategory('${category.id}')">Edit</button>
                    <button class="btn btn-danger" onclick="deleteCategory('${category.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    }

    function updateCategorySelectors() {
        const categoryOptions = categories.map(category => 
            `<option value="${category.id}">${category.name}</option>`
        ).join('');
        
        document.getElementById('taskCategory').innerHTML = categoryOptions;
        document.getElementById('templateCategory').innerHTML = categoryOptions;
    }

    // Project Modal Handling
    window.openProjectModal = (projectId = null) => {
        const modal = document.getElementById('projectModal');
        const form = document.getElementById('projectForm');
        
        if (projectId) {
            const project = projects.find(p => p.id === projectId);
            if (project) {
                form.querySelector('#projectName').value = project.name;
                form.querySelector('#projectColor').value = project.color;
                form.querySelector('#billableRate').value = project.billableRate;
                form.querySelector('#defaultBillable').checked = project.defaultBillable;
                form.dataset.editId = projectId;
            }
        } else {
            form.reset();
            delete form.dataset.editId;
        }
        
        modal.style.display = 'block';
    };

    window.closeProjectModal = () => {
        document.getElementById('projectModal').style.display = 'none';
    };

    // Project Form Handling
    document.getElementById('projectForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        const projectData = {
            id: form.dataset.editId || Date.now().toString(),
            name: form.querySelector('#projectName').value,
            color: form.querySelector('#projectColor').value,
            billableRate: parseFloat(form.querySelector('#billableRate').value) || 0,
            defaultBillable: form.querySelector('#defaultBillable').checked
        };

        if (form.dataset.editId) {
            projects = projects.map(p => p.id === form.dataset.editId ? projectData : p);
        } else {
            projects.push(projectData);
        }

        saveProjects();
        closeProjectModal();
    });

    // Manual Task Entry
    window.openManualTaskModal = () => {
        const modal = document.getElementById('manualTaskModal');
        const form = document.getElementById('manualTaskForm');
        const now = new Date();
        
        // Set default values
        form.querySelector('#taskStartTime').value = now.toISOString().slice(0, 16);
        form.querySelector('#taskEndTime').value = new Date(now.getTime() + 30*60000).toISOString().slice(0, 16);
        
        modal.style.display = 'block';
    };

    window.closeManualTaskModal = () => {
        document.getElementById('manualTaskModal').style.display = 'none';
    };

    // Manual Task Form Handling
    document.getElementById('manualTaskForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const startTime = new Date(form.querySelector('#taskStartTime').value);
        const endTime = new Date(form.querySelector('#taskEndTime').value);
        
        const task = {
            uuid: backgroundService.generateUUID(),
            name: form.querySelector('#taskName').value,
            project: form.querySelector('#taskProject').value,
            category: form.querySelector('#taskCategory').value,
            startTime: startTime,
            endTime: endTime,
            duration: Math.round((endTime - startTime) / 1000 / 60),
            description: form.querySelector('#taskDescription').value,
            billable: form.querySelector('#taskBillable').checked,
            confidence: 1.0,
            timestamp: new Date().toISOString()
        };

        await dbService.addTask(task);
        backgroundService.addTaskToUI(task);
        closeManualTaskModal();
    });

    // Task Filtering
    function filterTasks() {
        const projectId = projectFilter.value;
        const dateRange = dateFilter.value;
        const tasks = document.querySelectorAll('.task-item');
        
        tasks.forEach(task => {
            let show = true;
            
            // Project filter
            if (projectId && task.dataset.project !== projectId) {
                show = false;
            }
            
            // Date filter
            const taskDate = new Date(task.dataset.timestamp);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            switch(dateRange) {
                case 'today':
                    if (taskDate < today) show = false;
                    break;
                case 'yesterday':
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    if (taskDate < yesterday || taskDate >= today) show = false;
                    break;
                case 'week':
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    if (taskDate < weekAgo) show = false;
                    break;
                case 'month':
                    const monthAgo = new Date(today);
                    monthAgo.setMonth(monthAgo.getMonth() - 1);
                    if (taskDate < monthAgo) show = false;
                    break;
            }
            
            task.style.display = show ? '' : 'none';
        });
        
        updateTaskSummary();
    }

    function updateTaskSummary() {
        const visibleTasks = Array.from(document.querySelectorAll('.task-item')).filter(
            task => task.style.display !== 'none'
        );
        
        const summary = visibleTasks.reduce((acc, task) => {
            const duration = parseInt(task.dataset.duration);
            const billable = task.dataset.billable === 'true';
            const project = task.dataset.project;
            
            acc.totalTime += duration;
            if (billable) acc.billableTime += duration;
            
            acc.projects[project] = (acc.projects[project] || 0) + duration;
            
            return acc;
        }, { totalTime: 0, billableTime: 0, projects: {} });
        
        document.getElementById('taskSummary').innerHTML = `
            <div>
                <strong>Total Time:</strong> ${Math.round(summary.totalTime / 60 * 10) / 10}h
                (${Math.round(summary.billableTime / 60 * 10) / 10}h billable)
            </div>
            <div>
                <strong>By Project:</strong>
                ${Object.entries(summary.projects).map(([project, duration]) => 
                    `${project}: ${Math.round(duration / 60 * 10) / 10}h`
                ).join(' | ')}
            </div>
        `;
    }

    // Event Listeners
    projectFilter.addEventListener('change', filterTasks);
    dateFilter.addEventListener('change', filterTasks);
    clearFiltersButton.addEventListener('click', () => {
        projectFilter.value = '';
        dateFilter.value = 'today';
        filterTasks();
    });

    addProjectButton.addEventListener('click', () => openProjectModal());
    addManualTaskButton.addEventListener('click', () => openManualTaskModal());

    // Initialize
    updateProjectLists();
    filterTasks();

    // Initialize UI state
    pauseButton.disabled = true;

    // Event handlers
    startButton.addEventListener('click', () => {
        backgroundService.start();
        startButton.disabled = true;
        pauseButton.disabled = false;
    });

    pauseButton.addEventListener('click', () => {
        backgroundService.pause();
        startButton.disabled = false;
        pauseButton.disabled = true;
    });

    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const interval = parseInt(intervalInput.value, 10);
        if (interval > 0) {
            backgroundService.setCaptureInterval(interval);
        }
    });

    // Create a modal for task confirmation
    const createTaskModal = () => {
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div id="taskModal" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); z-index: 1000;">
                <h3>Confirm Task</h3>
                <p>Is this the correct task?</p>
                <div id="taskSuggestion" style="margin: 10px 0;"></div>
                <input type="text" id="taskInput" style="width: 100%; margin: 10px 0; padding: 8px;">
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="btn" id="confirmTask">Confirm</button>
                    <button class="btn btn-danger" id="cancelTask">Cancel</button>
                </div>
            </div>
            <div id="modalOverlay" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5); z-index: 999;"></div>
        `;
        document.body.appendChild(modal);
    };

    createTaskModal();

    // Export functionality
    const addExportButton = () => {
        const exportButton = document.createElement('button');
        exportButton.className = 'btn';
        exportButton.textContent = 'Export Tasks';
        exportButton.style.marginTop = '20px';
        
        exportButton.addEventListener('click', () => {
            // Get all tasks from the UI
            const tasks = Array.from(document.querySelectorAll('.task-item')).map(task => {
                const name = task.querySelector('strong').textContent;
                const confidence = parseFloat(task.querySelector('div div').textContent.match(/[\d.]+/)[0]) / 100;
                const project = task.querySelector('.task-details span:nth-child(1)').textContent.replace('Project: ', '');
                const category = task.querySelector('.task-details span:nth-child(2)').textContent.replace('Category: ', '');
                const duration = parseInt(task.querySelector('.task-details span:nth-child(3)').textContent.match(/\d+/)[0]);
                const timeRange = task.querySelector('.task-time').textContent.trim().split(' - ');
                const billable = task.querySelector('input[type="checkbox"]').checked;
                const description = task.querySelector('.task-description')?.textContent || '';
                const uuid = task.dataset.taskId;

                return {
                    UUID: uuid || 'N/A',
                    Date: new Date().toLocaleDateString(),
                    'Start Time': timeRange[0],
                    'End Time': timeRange[1],
                    Duration: duration,
                    Project: project,
                    Category: category,
                    Task: name,
                    Description: description,
                    Billable: billable ? 'Yes' : 'No',
                    Confidence: confidence
                };
            });

            // Define CSV headers in a standard format
            const headers = [
                'UUID',
                'Date',
                'Start Time',
                'End Time',
                'Duration',
                'Project',
                'Category',
                'Task',
                'Description',
                'Billable',
                'Confidence'
            ];

            // Create CSV content
            const csv = [
                headers,
                ...tasks.map(task => headers.map(header => task[header]))
            ].map(row => row.map(cell => {
                // Properly escape cells containing commas or quotes
                if (cell === null || cell === undefined) {
                    return '';
                }
                cell = cell.toString();
                if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(',')).join('\n');

            // Create and trigger download
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `taskshot_timesheet_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        document.querySelector('.task-list').appendChild(exportButton);
    };

    addExportButton();

    // Template Modal Handling
    window.openTemplateModal = (templateId = null) => {
        const modal = document.getElementById('templateModal');
        const form = document.getElementById('templateForm');
        
        if (templateId) {
            const template = templates.find(t => t.id === templateId);
            if (template) {
                form.querySelector('#templateName').value = template.name;
                form.querySelector('#templateProject').value = template.project;
                form.querySelector('#templateCategory').value = template.category;
                form.querySelector('#templateDescription').value = template.description;
                form.querySelector('#templateBillable').checked = template.billable;
                form.dataset.editId = templateId;
            }
        } else {
            form.reset();
            delete form.dataset.editId;
        }
        
        modal.style.display = 'block';
    };

    window.closeTemplateModal = () => {
        document.getElementById('templateModal').style.display = 'none';
    };

    // Template Form Handling
    document.getElementById('templateForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        const templateData = {
            id: form.dataset.editId || Date.now().toString(),
            name: form.querySelector('#templateName').value,
            project: form.querySelector('#templateProject').value,
            category: form.querySelector('#templateCategory').value,
            description: form.querySelector('#templateDescription').value,
            billable: form.querySelector('#templateBillable').checked
        };

        if (form.dataset.editId) {
            templates = templates.map(t => t.id === form.dataset.editId ? templateData : t);
        } else {
            templates.push(templateData);
        }

        saveTemplates();
        closeTemplateModal();
    });

    // Category Modal Handling
    window.openCategoryModal = (categoryId = null) => {
        const modal = document.getElementById('categoryModal');
        const form = document.getElementById('categoryForm');
        
        if (categoryId) {
            const category = categories.find(c => c.id === categoryId);
            if (category) {
                form.querySelector('#categoryName').value = category.name;
                form.querySelector('#categoryColor').value = category.color;
                form.dataset.editId = categoryId;
            }
        } else {
            form.reset();
            delete form.dataset.editId;
        }
        
        modal.style.display = 'block';
    };

    window.closeCategoryModal = () => {
        document.getElementById('categoryModal').style.display = 'none';
    };

    // Category Form Handling
    document.getElementById('categoryForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        const categoryData = {
            id: form.dataset.editId || form.querySelector('#categoryName').value.toLowerCase().replace(/\s+/g, '_'),
            name: form.querySelector('#categoryName').value,
            color: form.querySelector('#categoryColor').value
        };

        if (form.dataset.editId) {
            categories = categories.map(c => c.id === form.dataset.editId ? categoryData : c);
        } else {
            categories.push(categoryData);
        }

        saveCategories();
        closeCategoryModal();
    });

    // Task Merging
    let selectedTasks = new Set();

    function updateMergeButton() {
        const mergeButton = document.getElementById('mergeSelected');
        mergeButton.disabled = selectedTasks.size < 2;
    }

    window.toggleTaskSelection = (taskId) => {
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (selectedTasks.has(taskId)) {
            selectedTasks.delete(taskId);
            taskElement.classList.remove('selected');
        } else {
            selectedTasks.add(taskId);
            taskElement.classList.add('selected');
        }
        updateMergeButton();
    };

    document.getElementById('mergeSelected').addEventListener('click', async () => {
        if (selectedTasks.size < 2) return;

        const tasks = Array.from(selectedTasks).map(taskId => {
            const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
            return {
                id: taskId,
                name: taskElement.querySelector('strong').textContent,
                project: taskElement.dataset.project,
                category: taskElement.dataset.category,
                startTime: new Date(taskElement.dataset.startTime),
                endTime: new Date(taskElement.dataset.endTime),
                description: taskElement.querySelector('.task-description')?.textContent || '',
                billable: taskElement.dataset.billable === 'true'
            };
        }).sort((a, b) => a.startTime - b.startTime);

        const mergedTask = {
            name: tasks[0].name,
            project: tasks[0].project,
            category: tasks[0].category,
            startTime: tasks[0].startTime,
            endTime: tasks[tasks.length - 1].endTime,
            duration: Math.round((tasks[tasks.length - 1].endTime - tasks[0].startTime) / 1000 / 60),
            description: tasks.map(t => t.description).filter(Boolean).join('\n'),
            billable: tasks[0].billable,
            confidence: 1.0,
            timestamp: new Date().toISOString()
        };

        // Delete original tasks and add merged task
        for (const taskId of selectedTasks) {
            await dbService.deleteTask(taskId);
            document.querySelector(`[data-task-id="${taskId}"]`).remove();
        }

        await dbService.addTask(mergedTask);
        backgroundService.addTaskToUI(mergedTask);

        selectedTasks.clear();
        updateMergeButton();
    });

    // Template Usage
    window.useTemplate = (templateId) => {
        const template = templates.find(t => t.id === templateId);
        if (!template) return;

        const form = document.getElementById('manualTaskForm');
        form.querySelector('#taskName').value = template.name;
        form.querySelector('#taskProject').value = template.project;
        form.querySelector('#taskCategory').value = template.category;
        form.querySelector('#taskDescription').value = template.description;
        form.querySelector('#taskBillable').checked = template.billable;

        openManualTaskModal();
    };

    // Initialize
    updateTemplateList();
    updateCategoryList();
    updateCategorySelectors();

    // Event Listeners
    document.getElementById('addTemplate').addEventListener('click', () => openTemplateModal());
    document.getElementById('addCategory').addEventListener('click', () => openCategoryModal());
}); 