import { dbService } from './db-service.js';
import { backgroundService } from './background.js';
import { aiProviderService } from './ai-provider-service.js';
import { aiService } from './ai-service.js';
import { errorService } from './error-service.js';
import { CONFIG, getAISettings, setAISettings, setApiKey } from './config.js';
import ErrorBoundary from './error-boundary.js';

// Initialize state variables at the top level
let taskListBoundary = null;
let projectListBoundary = null;
let settingsBoundary = null;

// Project Management
let projects = []; // Will be loaded from IndexedDB

// Task Templates Management
let templates = JSON.parse(localStorage.getItem('task_templates')) || [];
let categories = JSON.parse(localStorage.getItem('task_categories')) || [
    { id: 'development', name: 'Development', color: '#3498db' },
    { id: 'meeting', name: 'Meeting', color: '#e74c3c' },
    { id: 'planning', name: 'Planning', color: '#2ecc71' },
    { id: 'research', name: 'Research', color: '#9b59b6' }
];

// Helper functions
function generateUUID() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

function showInitializationError() {
    const container = document.createElement('div');
    container.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        text-align: center;
    `;
    container.innerHTML = `
        <h3 style="color: #d32f2f;">Initialization Error</h3>
        <p>Failed to initialize the application. Please try refreshing the page.</p>
        <button onclick="location.reload()" style="
            background: #2196f3;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 10px;
        ">Refresh Page</button>
    `;
    document.body.appendChild(container);
}

function createTaskModal() {
    const modal = document.createElement('div');
    modal.innerHTML = `
        <div id="taskModal" class="modal">
            <div class="modal-content">
                <h3>Confirm Task</h3>
                <p>Please confirm or modify the detected task:</p>
                <div id="taskSuggestion" class="task-suggestion"></div>
                <div class="form-group">
                    <label for="taskInput">Task Name</label>
                    <input type="text" id="taskInput" class="form-control">
                </div>
                <div class="form-group">
                    <label for="taskProjectSelect">Project</label>
                    <select id="taskProjectSelect" class="form-control">
                        <!-- Projects will be populated dynamically -->
                    </select>
                </div>
                <div class="modal-actions">
                    <button id="confirmTask" class="btn">Confirm</button>
                    <button id="cancelTask" class="btn btn-danger">Cancel</button>
                </div>
            </div>
        </div>
        <div id="modalOverlay" class="modal-overlay"></div>
    `;
    document.body.appendChild(modal);
}

async function updateTaskList() {
    const taskContainer = document.getElementById('taskContainer');
    if (!taskContainer) {
        throw new Error('Task container not found');
    }
    
    // Clear existing tasks
    taskContainer.innerHTML = '';
    
    // Load and display recent tasks
    const tasks = await dbService.getRecentTasks();
    if (tasks && Array.isArray(tasks)) {
        tasks.forEach(task => addTaskToUI(task));
    }
    
    // Update task summary
    updateTaskSummary();
}

// Define initialization functions
async function initializeTaskList() {
    const taskContainer = document.getElementById('taskContainer');
    if (!taskContainer) {
        throw new Error('Task container not found');
    }
    
    await updateTaskList();
    filterTasks();
}

async function initializeProjectList() {
    const projectList = document.getElementById('projectList');
    if (!projectList) {
        throw new Error('Project list container not found');
    }
    
    try {
        // Load projects from IndexedDB
        projects = await dbService.getAllProjects();
        
        // If no projects exist, create default project
        if (projects.length === 0) {
            const defaultProject = {
                id: crypto.randomUUID(),
                name: 'Default',
                color: '#3498db',
                billableRate: 0,
                defaultBillable: true,
                description: 'Default project for unclassified tasks',
                categories: ['Development', 'Research', 'Meeting', 'Planning'],
                isDefaultProject: true
            };
            await dbService.addProject(defaultProject);
            projects = [defaultProject];
        }
        
        // Update UI with loaded projects
        await updateProjectLists();
    } catch (error) {
        errorService.error('Failed to initialize project list', error);
        throw error;
    }
}

async function initializeSettings() {
    const settingsForm = document.querySelector('.settings-form');
    if (!settingsForm) {
        throw new Error('Settings form not found');
    }
    
    // Load saved interval
    const savedInterval = localStorage.getItem('capture_interval');
    if (savedInterval) {
        const interval = parseInt(savedInterval, 10);
        if (interval > 0) {
            document.getElementById('captureInterval').value = interval;
            backgroundService.setCaptureInterval(interval);
        }
    }
    
    // Initialize AI provider settings
    initializeAIProviderUI();
}

async function setupEventListeners() {
    const startButton = document.getElementById('startTracking');
    const pauseButton = document.getElementById('pauseTracking');
    const settingsForm = document.querySelector('.settings-form');
    const intervalInput = document.getElementById('captureInterval');
    const addProjectButton = document.getElementById('addProject');
    const addManualTaskButton = document.getElementById('addManualTask');
    const projectFilter = document.getElementById('projectFilter');
    const dateFilter = document.getElementById('dateFilter');
    const clearFiltersButton = document.getElementById('clearFilters');
    const defaultProjectForm = document.getElementById('defaultProjectForm');

    if (!startButton || !pauseButton || !settingsForm || !intervalInput || 
        !addProjectButton || !addManualTaskButton || !projectFilter || 
        !dateFilter || !clearFiltersButton || !defaultProjectForm) {
        throw new Error('Required UI elements not found');
    }

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
            localStorage.setItem('capture_interval', interval);
        }
    });

    // Handle default project form submission
    defaultProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const defaultProjectSelect = document.getElementById('defaultProject');
        const selectedProjectId = defaultProjectSelect.value;
        
        try {
            // Find the selected project
            const selectedProject = projects.find(p => p.id === selectedProjectId);
            if (!selectedProject) {
                throw new Error('Selected project not found');
            }

            // Update all projects to not be default
            for (const project of projects) {
                if (project.id !== selectedProjectId) {
                    project.isDefaultProject = false;
                    await dbService.updateProject(project);
                }
            }

            // Set the selected project as default
            selectedProject.isDefaultProject = true;
            await dbService.updateProject(selectedProject);

            // Reload projects from database to ensure we have the latest data
            projects = await dbService.getAllProjects();

            // Update UI
            await updateProjectLists();
            errorService.info('Default project updated successfully');
        } catch (error) {
            errorService.error('Failed to update default project', error);
            alert('Failed to update default project: ' + error.message);
        }
    });

    // Event listeners for filters
    projectFilter.addEventListener('change', filterTasks);
    dateFilter.addEventListener('change', filterTasks);
    clearFiltersButton.addEventListener('click', () => {
        projectFilter.value = '';
        dateFilter.value = 'today';
        filterTasks();
    });

    // Project management buttons
    addProjectButton.addEventListener('click', () => openProjectModal());
    addManualTaskButton.addEventListener('click', () => openManualTaskModal());
    
    // Add Category button
    const addCategoryButton = document.getElementById('addCategory');
    if (addCategoryButton) {
        addCategoryButton.addEventListener('click', () => openCategoryModal());
    }

    // Load saved interval
    const savedInterval = localStorage.getItem('capture_interval');
    if (savedInterval) {
        const interval = parseInt(savedInterval, 10);
        if (interval > 0) {
            intervalInput.value = interval;
            backgroundService.setCaptureInterval(interval);
        }
    }
}

// Export functions at the top level
export async function initializeUI() {
    try {
        // Initialize error boundaries first
        taskListBoundary = new ErrorBoundary('taskContainer', errorService);
        projectListBoundary = new ErrorBoundary('projectList', errorService);
        settingsBoundary = new ErrorBoundary('settings-form', errorService);

        // Initialize each component with its error boundary
        await taskListBoundary.captureError(async () => {
            await initializeTaskList();
            // Set up task-related event listeners
            const taskContainer = document.getElementById('taskContainer');
            if (!taskContainer) {
                throw new Error('Task container not found');
            }
        });

        await projectListBoundary.captureError(async () => {
            await initializeProjectList();
            // Set up project-related event listeners
            const projectList = document.getElementById('projectList');
            if (!projectList) {
                throw new Error('Project list not found');
            }
        });

        await settingsBoundary.captureError(async () => {
            await initializeSettings();
            // Set up settings-related event listeners
            const settingsForm = document.querySelector('.settings-form');
            if (!settingsForm) {
                throw new Error('Settings form not found');
            }
        });

        // Initialize UI components
        await updateProjectLists();
        updateTemplateList();
        updateCategoryList();
        updateCategorySelectors();
        initializeAIProviderUI();
        filterTasks();

        // Set up event listeners after all components are initialized
        await setupEventListeners();

    } catch (error) {
        errorService.error('Failed to initialize UI components', error);
        throw error; // Re-throw to trigger the error handler in DOMContentLoaded
    }
}

export async function addTask(task) {
    if (!taskListBoundary) {
        throw new Error('UI not initialized');
    }
    try {
        await taskListBoundary.captureError(async () => {
            // Validate task data
            if (!task || !task.name) {
                throw new Error('Invalid task data');
            }

            const result = await dbService.addTask(task);
            if (!result) {
                throw new Error('Failed to add task to database');
            }

            await updateTaskList();
        });
    } catch (error) {
        errorService.error('Failed to add task', error, { task });
        throw error;
    }
}

async function saveProject(project) {
    try {
        // If project has no id, it's a new project
        if (!project.id) {
            project.id = crypto.randomUUID();
            await dbService.addProject(project);
        } else {
            await dbService.updateProject(project);
        }
        
        // Reload projects from database to ensure we have the latest data
        projects = await dbService.getAllProjects();
        
        // Update UI with latest data
        await updateProjectLists();
    } catch (error) {
        errorService.error('Failed to save project', error);
    }
}

export async function exportTasks() {
    try {
        const tasks = await dbService.getAllTasks();
        if (!tasks || tasks.length === 0) {
            errorService.warn('No tasks available for export');
            return;
        }

        const csvContent = generateCSVContent(tasks);
        downloadCSV(csvContent);
    } catch (error) {
        errorService.error('Failed to export tasks', error);
        throw error;
    }
}

// Initialize everything when the DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize services first
        await dbService.initialize();
        await backgroundService.initialize();
        
        // Initialize UI
        await initializeUI();
    } catch (error) {
        errorService.fatal('Critical initialization error', error);
        showInitializationError();
    }
});

// ---------------------
// The following are helper functions and UI management routines
// ---------------------

function saveProjects() {
    // This function is no longer needed as projects are saved individually
    // Keeping it for backward compatibility, but it's a no-op now
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

async function updateProjectLists() {
    try {
        const projectList = document.getElementById('projectList');
        const projectSelects = document.querySelectorAll('select[id$="Project"]');
        
        // Update project list
        if (projectList) {
            projectList.innerHTML = projects.map(project => `
                <div class="project-item" style="background-color: ${project.color}20">
                    <span>${project.name}</span>
                    <div class="project-actions">
                        <button onclick="openProjectModal('${project.id}')" class="btn">Edit</button>
                        ${!project.isDefaultProject ? `<button onclick="deleteProject('${project.id}')" class="btn btn-danger">Delete</button>` : ''}
                    </div>
                </div>
            `).join('');
        }

        // Find the default project
        const defaultProject = projects.find(p => p.isDefaultProject);

        // Update all project select dropdowns
        projectSelects.forEach(select => {
            // For the defaultProject select, we want to select the project with isDefaultProject: true
            // For other selects, maintain their current selection
            const currentValue = select.id === 'defaultProject' && defaultProject ? defaultProject.id : select.value;
            
            select.innerHTML = projects.map(project => 
                `<option value="${project.id}" ${project.id === currentValue ? 'selected' : ''}>
                    ${project.name}
                </option>`
            ).join('');
        });
    } catch (error) {
        errorService.error('Failed to update project lists', error);
    }
}

function updateTemplateList() {
    const templateList = document.getElementById('templateList');
    if (!templateList) return;
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
    if (!categoryList) return;
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
    
    const taskCategory = document.getElementById('taskCategory');
    const templateCategory = document.getElementById('templateCategory');
    const projectCategories = document.getElementById('projectCategories');
    if (taskCategory) taskCategory.innerHTML = categoryOptions;
    if (templateCategory) templateCategory.innerHTML = categoryOptions;
    if (projectCategories) projectCategories.innerHTML = categoryOptions;
}

// Define closeProjectModal function
function closeProjectModal() {
    const modal = document.getElementById('projectModal');
    if (modal) {
        modal.close('cancel');
    }
}

// Make it available globally
window.closeProjectModal = closeProjectModal;

// Project Modal Handling
window.openProjectModal = async function(projectId = null) {
    try {
        const modal = document.getElementById('projectModal');
        const form = document.getElementById('projectForm');
        const nameInput = document.getElementById('projectName');
        const descInput = document.getElementById('projectDescription');
        const categoriesSelect = document.getElementById('projectCategories');
        const colorInput = document.getElementById('projectColor');
        const rateInput = document.getElementById('billableRate');
        const billableCheck = document.getElementById('defaultBillable');

        // Clear previous form data
        form.reset();

        if (projectId) {
            // Load existing project data
            const project = projects.find(p => p.id === projectId);
            if (project) {
                nameInput.value = project.name;
                descInput.value = project.description || '';
                colorInput.value = project.color || '#3498db';
                rateInput.value = project.billableRate || 0;
                billableCheck.checked = project.defaultBillable || false;
                
                // Set selected categories
                if (project.categories) {
                    Array.from(categoriesSelect.options).forEach(option => {
                        option.selected = project.categories.includes(option.value);
                    });
                }
            }
        }

        // Show modal using showModal()
        modal.showModal();

        // Handle form submission
        form.onsubmit = async (e) => {
            e.preventDefault();
            const selectedCategories = Array.from(categoriesSelect.selectedOptions).map(opt => opt.value);
            
            const projectData = {
                id: projectId || crypto.randomUUID(),
                name: nameInput.value,
                description: descInput.value,
                categories: selectedCategories,
                color: colorInput.value,
                billableRate: parseFloat(rateInput.value) || 0,
                defaultBillable: billableCheck.checked
            };

            await saveProject(projectData);
            modal.close('save');
        };

        // Handle cancel button
        const cancelButton = form.querySelector('button[value="cancel"]');
        cancelButton.onclick = () => modal.close('cancel');

        // Handle dialog close
        modal.addEventListener('close', () => {
            if (modal.returnValue === 'save') {
                // Project was saved, already handled in form submit
            } else {
                // Modal was cancelled or closed
                form.reset();
            }
        }, { once: true });

    } catch (error) {
        errorService.error('Failed to open project modal', error);
    }
};

// Manual Task Entry
window.openManualTaskModal = () => {
    const modal = document.getElementById('manualTaskModal');
    const form = document.getElementById('manualTaskForm');
    const now = new Date();
    
    // Set default values
    form.querySelector('#taskStartTime').value = now.toISOString().slice(0, 16);
    form.querySelector('#taskEndTime').value = new Date(now.getTime() + 30*60000).toISOString().slice(0, 16);
    
    // Show modal using showModal()
    modal.showModal();

    // Handle form submission
    form.onsubmit = async (e) => {
        e.preventDefault();
        const selectedProject = form.querySelector('#taskProject').value;
        const selectedCategory = form.querySelector('#taskCategory').value;
        
        // Validate that the selected category is supported by the project
        const project = projects.find(p => p.id === selectedProject);
        if (!project.categories.includes(selectedCategory)) {
            alert(`The category "${selectedCategory}" is not supported by the project "${project.name}". Please select a supported category.`);
            return;
        }

        const startTime = new Date(form.querySelector('#taskStartTime').value);
        const endTime = new Date(form.querySelector('#taskEndTime').value);
        
        const task = {
            uuid: backgroundService.generateUUID ? backgroundService.generateUUID() : generateUUID(),
            name: form.querySelector('#taskName').value,
            project: selectedProject,
            category: selectedCategory,
            startTime: startTime,
            endTime: endTime,
            duration: Math.round((endTime - startTime) / 1000 / 60),
            description: form.querySelector('#taskDescription').value,
            billable: form.querySelector('#taskBillable').checked,
            confidence: 1.0,
            timestamp: new Date().toISOString(),
            context: {
                projectInfo: 'Manually created task',
                taskHistory: 'No task history available',
                timestamp: new Date().toISOString()
            }
        };

        await dbService.addTask(task);
        backgroundService.addTaskToUI(task);
        modal.close('save');
    };

    // Handle cancel button
    const cancelButton = form.querySelector('button[value="cancel"]');
    cancelButton.onclick = () => modal.close('cancel');

    // Handle dialog close
    modal.addEventListener('close', () => {
        if (modal.returnValue === 'save') {
            // Task was saved, already handled in form submit
        } else {
            // Modal was cancelled or closed
            form.reset();
        }
    }, { once: true });
};

// Task Filtering
function filterTasks() {
    const projectFilter = document.getElementById('projectFilter');
    const dateFilter = document.getElementById('dateFilter');
    const tasks = document.querySelectorAll('.task-item');
    
    tasks.forEach(task => {
        let show = true;
        
        // Project filter
        if (projectFilter.value && task.dataset.project !== projectFilter.value) {
            show = false;
        }
        
        // Date filter
        const taskDate = new Date(task.dataset.timestamp);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        switch(dateFilter.value) {
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

// Export functionality
const addExportButton = () => {
    const exportButton = document.createElement('button');
    exportButton.className = 'btn';
    exportButton.textContent = 'Export Tasks';
    exportButton.style.marginTop = '20px';
    
    exportButton.addEventListener('click', () => {
        // Get all tasks from the UI
        const tasks = Array.from(document.querySelectorAll('.task-item')).map(task => {
            const name = task.querySelector('.task-name').textContent;
            const confidenceText = task.querySelector('.task-confidence').textContent;
            const confidence = parseFloat(confidenceText.match(/[\d.]+/)[0]) / 100;
            const projectId = task.dataset.project;
            const project = projects.find(p => p.id === projectId)?.name || 'Unknown Project';
            const category = task.querySelector('.task-category').textContent.replace('Category: ', '');
            const duration = parseInt(task.querySelector('.task-duration').textContent.match(/\d+/)[0]);
            const timeRange = task.querySelector('.task-time').textContent.trim().split(' - ');
            const billable = task.querySelector('.billable-checkbox input').checked;
            const description = task.querySelector('.task-description')?.textContent || '';
            const taskId = task.dataset.taskId;
            const screenshot = task.dataset.screenshot || dbService.defaultScreenshot;
            const analysisDescription = task.querySelector('.task-analysis-content')?.textContent || '';
            const classificationPrompt = task.dataset.classificationPrompt || '';

            return {
                UUID: taskId || 'N/A',
                Date: new Date().toLocaleDateString(),
                'Start Time': timeRange[0],
                'End Time': timeRange[1],
                Duration: duration,
                Project: project,
                'Project ID': projectId,
                Category: category,
                Task: name,
                Description: description,
                'Analysis Description': analysisDescription,
                'Classification Prompt': classificationPrompt,
                Billable: billable ? 'Yes' : 'No',
                Confidence: confidence.toFixed(2),
                Screenshot: screenshot
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
            'Project ID',
            'Category',
            'Task',
            'Description',
            'Analysis Description',
            'Classification Prompt',
            'Billable',
            'Confidence',
            'Screenshot'
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
        a.style.display = 'none';
        a.href = url;
        a.download = `taskshot_timesheet_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    const taskListContainer = document.querySelector('.task-list');
    if (taskListContainer) {
      taskListContainer.appendChild(exportButton);
    }
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
    const selectedProject = form.querySelector('#templateProject').value;
    const selectedCategory = form.querySelector('#templateCategory').value;

    // Validate that the selected category is supported by the project
    const project = projects.find(p => p.id === selectedProject);
    if (!project.categories.includes(selectedCategory)) {
        alert(`The category "${selectedCategory}" is not supported by the project "${project.name}". Please select a supported category.`);
        return;
    }

    const templateData = {
        id: form.dataset.editId || Date.now().toString(),
        name: form.querySelector('#templateName').value,
        project: selectedProject,
        category: selectedCategory,
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

// Add dynamic category filtering for template form
document.getElementById('templateProject').addEventListener('change', (e) => {
    const selectedProject = e.target.value;
    const project = projects.find(p => p.id === selectedProject);
    const categorySelect = document.getElementById('templateCategory');
    
    // Filter categories to only show those supported by the selected project
    Array.from(categorySelect.options).forEach(option => {
        option.disabled = !project.categories.includes(option.value);
        if (option.disabled && option.selected) {
            categorySelect.value = project.categories[0]; // Select first supported category
        }
    });
});

// Ensure 'uncategorized' category exists
if (!categories.find(c => c.id === 'uncategorized')) {
    categories.push({
        id: 'uncategorized',
        name: 'Uncategorized',
        color: '#808080'
    });
    saveCategories();
}

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
    
    // Show modal using showModal()
    modal.showModal();

    // Handle form submission
    form.onsubmit = (e) => {
        e.preventDefault();
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
        modal.close('save');
    };

    // Handle cancel button
    const cancelButton = form.querySelector('button[value="cancel"]');
    cancelButton.onclick = () => modal.close('cancel');

    // Handle dialog close
    modal.addEventListener('close', () => {
        if (modal.returnValue === 'save') {
            // Category was saved, already handled in form submit
        } else {
            // Modal was cancelled or closed
            form.reset();
        }
    }, { once: true });
};

// Make closeCategoryModal available globally
window.closeCategoryModal = () => {
    const modal = document.getElementById('categoryModal');
    if (modal) {
        modal.close('cancel');
    }
};

// Task Merging
let selectedTasks = new Set();

async function createCompositeScreenshot(screenshots) {
    return new Promise((resolve, reject) => {
        // Calculate the grid size based on number of screenshots
        const count = screenshots.length;
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        
        // Create a canvas for the composite image
        const canvas = document.createElement('canvas');
        const size = 300; // Final image size
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Fill with white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        
        // Calculate thumbnail size
        const thumbWidth = size / cols;
        const thumbHeight = size / rows;
        
        // Counter for loaded images
        let loadedCount = 0;
        
        // Load and draw each screenshot
        screenshots.forEach((screenshot, index) => {
            const img = new Image();
            img.onload = () => {
                // Calculate position in grid
                const col = index % cols;
                const row = Math.floor(index / cols);
                const x = col * thumbWidth;
                const y = row * thumbHeight;
                
                // Draw the image
                ctx.drawImage(img, x, y, thumbWidth, thumbHeight);
                
                loadedCount++;
                if (loadedCount === screenshots.length) {
                    // All images loaded, return the composite
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                }
            };
            img.onerror = () => {
                loadedCount++;
                // Continue even if some images fail to load
                if (loadedCount === screenshots.length) {
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                }
            };
            img.src = screenshot;
        });
    });
}

function updateMergeButton() {
    const mergeButton = document.getElementById('mergeSelected');
    mergeButton.disabled = selectedTasks.size < 2;
}

window.toggleTaskSelection = (taskId) => {
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    const checkbox = taskElement.querySelector('.task-checkbox');
    
    if (selectedTasks.has(taskId)) {
        selectedTasks.delete(taskId);
        taskElement.classList.remove('selected');
        checkbox.checked = false;
    } else {
        selectedTasks.add(taskId);
        taskElement.classList.add('selected');
        checkbox.checked = true;
    }
    updateMergeButton();
};

document.getElementById('mergeSelected').addEventListener('click', async () => {
    if (selectedTasks.size < 2) return;

    const tasks = Array.from(selectedTasks).map(taskId => {
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        return {
            id: taskId,
            name: taskElement.querySelector('.task-name').textContent,
            project: taskElement.dataset.project,
            category: taskElement.dataset.category,
            startTime: new Date(taskElement.dataset.startTime),
            endTime: new Date(taskElement.dataset.endTime),
            description: taskElement.querySelector('.task-description')?.textContent || '',
            billable: taskElement.dataset.billable === 'true',
            confidence: parseFloat(taskElement.querySelector('.task-confidence').textContent.match(/[\d.]+/)[0]) / 100,
            screenshot: taskElement.dataset.screenshot
        };
    }).sort((a, b) => a.startTime - b.startTime);

    // Create composite screenshot from all task screenshots
    const screenshots = tasks.map(t => t.screenshot).filter(Boolean);
    const compositeScreenshot = await createCompositeScreenshot(screenshots);

    // Use the minimum confidence score from all merged tasks
    const minConfidence = Math.min(...tasks.map(t => t.confidence));

    const mergedTask = {
        uuid: backgroundService.generateUUID ? backgroundService.generateUUID() : generateUUID(),
        name: tasks[0].name,
        project: tasks[0].project,
        category: tasks[0].category,
        startTime: tasks[0].startTime,
        endTime: tasks[tasks.length - 1].endTime,
        duration: Math.round((tasks[tasks.length - 1].endTime - tasks[0].startTime) / 1000 / 60),
        description: tasks.map(t => t.description).filter(Boolean).join('\n'),
        billable: tasks[0].billable,
        confidence: minConfidence,
        timestamp: new Date().toISOString(),
        screenshot: compositeScreenshot,
        context: {
            projectInfo: 'Merged from multiple tasks',
            taskHistory: tasks.map(t => `${t.name} (${t.project})`).join('\n'),
            timestamp: new Date().toISOString()
        }
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

// Export addTaskToUI function and make it available globally
export function addTaskToUI(task) {
    const taskContainer = document.getElementById('taskContainer');
    if (!taskContainer) return;
    const taskElement = document.createElement('div');
    taskElement.className = 'task-item';
    taskElement.dataset.taskId = task.uuid;
    taskElement.dataset.project = task.project;
    taskElement.dataset.category = task.category;
    taskElement.dataset.billable = task.billable;
    taskElement.dataset.startTime = task.startTime;
    taskElement.dataset.endTime = task.endTime;
    taskElement.dataset.timestamp = task.timestamp;
    taskElement.dataset.duration = task.duration;
    taskElement.dataset.screenshot = task.screenshot || dbService.defaultScreenshot;
    taskElement.dataset.classificationPrompt = task.classification_prompt || task.prompt || '';
    
    // Format times for display
    const startTime = new Date(task.startTime).toLocaleTimeString();
    const startTimeHours = new Date(task.startTime).getHours();
    const startTimeMinutes = new Date(task.startTime).getMinutes();
    const endTime = new Date(task.endTime).toLocaleTimeString();
    const endTimeHours = new Date(task.endTime).getHours();
    const endTimeMinutes = new Date(task.endTime).getMinutes();
    const taskDate= new Date(task.context.timestamp).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const taskMonth = new Date(task.context.timestamp).toLocaleString('en-US', { month: 'long' });
    const taskYear = new Date(task.context.timestamp).toLocaleString('en-US', { year: 'numeric' });
    const taskDay = new Date(task.context.timestamp).toLocaleString('en-US', { day: 'numeric' });

    const taskIconSVG = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <!-- Background square with rounded corners -->
    <rect x="5" y="5" width="90" height="90" rx="10" fill="none" stroke="#000" stroke-width="1.5"/>
    
    <!-- Main circular elements -->
    <g stroke="#000" fill="none">
        <!-- Outer ring -->
        <circle cx="50" cy="50" r="30" stroke-width="1.5"/>
        
        <!-- Middle ring with gaps -->
        <path d="M50 30 A20 20 0 0 1 70 50 M50 70 A20 20 0 0 1 30 50" stroke-width="1.5"/>
        
        <!-- Inner ring -->
        <circle cx="50" cy="50" r="12" stroke-width="1.5"/>
    </g>
    
    <!-- Radiating lines -->
    <g stroke="#000" stroke-width="1">
        <line x1="50" y1="20" x2="50" y2="28"/>
        <line x1="50" y1="72" x2="50" y2="80"/>
        <line x1="20" y1="50" x2="28" y2="50"/>
        <line x1="72" y1="50" x2="80" y2="50"/>
        
        <!-- Diagonal lines -->
        <line x1="29.3" y1="29.3" x2="35.3" y2="35.3"/>
        <line x1="70.7" y1="29.3" x2="64.7" y2="35.3"/>
        <line x1="29.3" y1="70.7" x2="35.3" y2="64.7"/>
        <line x1="70.7" y1="70.7" x2="64.7" y2="64.7"/>
    </g>
    
    <!-- Corner elements -->
    <g stroke="#000" stroke-width="1.5" fill="none">
        <path d="M25 25 L25 30 L30 30"/>
        <path d="M75 25 L75 30 L70 30"/>
        <path d="M25 75 L25 70 L30 70"/>
        <path d="M75 75 L75 70 L70 70"/>
    </g>
    
    <!-- Center element -->
    <g>
        <circle cx="50" cy="50" r="4" fill="none" stroke="#000" stroke-width="1"/>
        <circle cx="50" cy="50" r="1.5" fill="#000"/>
    </g>
</svg>

    `;
    
    taskElement.innerHTML = `
        <div class="task-content">
            <div class="task-header">
                <label class="task-select">
                    <div class="task-select-left">
                    <input type="checkbox" class="task-checkbox" title="Select for merging" style="width: 20px; height: 20px; margin-right: 10px;">
                  
               <strong class="task-name">${task.name}</strong>
                    </div>
                <div class="task-time">
                    ${startTime} - ${endTime} ${taskDate}
                </div>
                 </label>

                

                
          
            </div>
            <div class="task-actions">
             <span class="task-project">Project: ${task.project}</span> |
                    <span class="task-category">Category: ${task.category}</span> |
                    <span class="task-duration">Duration: ${task.duration} min</span>
                <label class="billable-checkbox">
                    <input type="checkbox" ${task.billable ? 'checked' : ''} onclick="event.stopPropagation();">
                    <span>Billable</span>
                </label>
            </div>
            <details class="task-details">
            <summary>View Task Details</summary>
            <div class="task-group">
                <div class="task-details">
                    <span class="task-project">Project: ${task.project}</span> |
                    <span class="task-category">Category: ${task.category}</span> |
                    <span class="task-duration">Duration: ${task.duration} min</span>
                     <div class="task-confidence">Confidence: ${(task.confidence * 100).toFixed(1)}%</div>
                     ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                     ${task.analysis_description ? `
                        <details class="task-analysis">
                            <summary>View Detailed Analysis</summary>
                            <div class="task-analysis-content">${formatMarkdown(task.analysis_description)}</div>
                        </details>` : ''}
                        ${task.classification_prompt || task.prompt ? `
                        <details class="task-analysis">
                            <summary>View Classification Prompt</summary>
                            <div class="task-analysis-content">${formatMarkdown(task.classification_prompt || task.prompt)}</div>
                        </details>` : ''}
                        ${task.context ? `
                        <details class="task-analysis">
                            <summary>View Classification Context</summary>
                            <div class="task-analysis-content">
                                <h4>Context at ${new Date(task.context.timestamp).toLocaleString()}</h4>
                                <h5>Recent Task History:</h5>
                                ${formatMarkdown(task.context.taskHistory)}
                                <h5>Project Information:</h5>
                                ${formatMarkdown(task.context.projectInfo)}
                            </div>
                        </details>` : '<div>No context available</div>'}
                </div>            
                <div class="task-image">
                    <img src="${task.screenshot || dbService.defaultScreenshot}" 
                        alt="Task Screenshot" 
                        class="task-screenshot"
                        style="width: 300px; height: 300px; object-fit: contain; margin-right: 10px; cursor: pointer;"
                        title="Click to view full screenshot">
                </div>
            </div>
            </details>
           
            
            
            <div class="task-uuid">ID: ${task.uuid}</div>
            
        </div>
    `;

    // Add click handler for screenshot preview
    const screenshotImg = taskElement.querySelector('.task-screenshot');
    screenshotImg.addEventListener('click', () => {
        showScreenshotPreview(task.screenshot || dbService.defaultScreenshot);
    });

    // Add click handler for task selection
    taskElement.querySelector('.task-checkbox').addEventListener('click', (e) => {
        e.stopPropagation();
        window.toggleTaskSelection(task.uuid);
    });
    
    taskContainer.appendChild(taskElement);
}

// Make addTaskToUI available globally
//window.addTaskToUI = addTaskToUI;

function showScreenshotPreview(screenshot) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        cursor: pointer;
    `;

    const img = document.createElement('img');
    img.src = screenshot;
    img.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
        background: white;
        padding: 10px;
        border-radius: 5px;
    `;

    modal.appendChild(img);
    document.body.appendChild(modal);

    modal.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

// Initialize AI Provider UI
function initializeAIProviderUI() {
    const providers = aiProviderService.getAvailableProviders();
    const aiProviderSelect = document.getElementById('aiProvider');
    const visionModelSelect = document.getElementById('visionModel');
    const textModelSelect = document.getElementById('textModel');
    const apiKeySection = document.getElementById('apiKeySection');
    const apiKeyInput = document.getElementById('apiKeyInput');

    // Populate provider dropdown
    aiProviderSelect.innerHTML = providers.map(provider => 
        `<option value="${provider.id}">${provider.name}</option>`
    ).join('');

    // Handle provider change
    aiProviderSelect.addEventListener('change', () => {
        const selectedProvider = providers.find(p => p.id === aiProviderSelect.value);
        
        // Show/hide API key section
        apiKeySection.style.display = selectedProvider.requiresKey ? 'block' : 'none';
        
        // Update model dropdowns
        visionModelSelect.innerHTML = selectedProvider.models
            .filter(model => model.type === 'vision')
            .map(model => `<option value="${model.id}">${model.name}</option>`)
            .join('');
        
        textModelSelect.innerHTML = selectedProvider.models
            .filter(model => model.type === 'text')
            .map(model => `<option value="${model.id}">${model.name}</option>`)
            .join('');
    });

    // Set initial values from settings or defaults
    const settings = getAISettings();
    if (settings && settings.provider) {
        aiProviderSelect.value = settings.provider;
        aiProviderSelect.dispatchEvent(new Event('change')); // Trigger change event to update models
        
        if (settings.visionModel) {
            visionModelSelect.value = settings.visionModel;
        }
        if (settings.textModel) {
            textModelSelect.value = settings.textModel;
        }

        // Show API key section if needed
        const selectedProvider = providers.find(p => p.id === settings.provider);
        if (selectedProvider && selectedProvider.requiresKey) {
            apiKeySection.style.display = 'block';
            // Clear any previous error message
            document.getElementById('apiKeyError').style.display = 'none';
        }
    } else {
        // Set defaults
        aiProviderSelect.value = CONFIG.DEFAULT_AI_PROVIDER;
        aiProviderSelect.dispatchEvent(new Event('change'));
    }

    // Handle settings save
    document.getElementById('saveAISettings').addEventListener('click', async () => {
        const provider = aiProviderSelect.value;
        const visionModel = visionModelSelect.value;
        const textModel = textModelSelect.value;
        const apiKey = apiKeyInput.value.trim();
        const errorElement = document.getElementById('apiKeyError');

        try {
            const selectedProvider = providers.find(p => p.id === provider);
            if (selectedProvider.requiresKey && !apiKey) {
                throw new Error('API key is required for this provider');
            }

            // Save settings
            setAISettings({
                provider,
                visionModel,
                textModel
            });

            // Save API key if needed
            if (selectedProvider.requiresKey) {
                const keyName = CONFIG.AI_PROVIDERS[provider].keyName;
                setApiKey(keyName, apiKey);
            }

            errorElement.style.display = 'none';
            errorService.info('AI settings saved successfully');
            
            // Reinitialize AI services
            await aiService.initialize();
            await backgroundService.initialize();
            
            location.reload(); // Reload to apply new settings
        } catch (error) {
            errorService.error('Failed to save AI settings', error);
            errorElement.textContent = error.message;
            errorElement.style.display = 'block';
        }
    });
}

// Global functions for project management
window.editProject = (projectId) => {
    openProjectModal(projectId);
};

window.editCategory = (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    if (category) {
        const modal = document.getElementById('categoryModal');
        const form = document.getElementById('categoryForm');
        form.querySelector('#categoryName').value = category.name;
        form.querySelector('#categoryColor').value = category.color;
        form.dataset.editId = categoryId;
        modal.style.display = 'block';
    }
};

window.deleteProject = async (projectId) => {
    try {
        const project = projects.find(p => p.id === projectId);
        if (!project) {
            throw new Error('Project not found');
        }

        if (project.isDefaultProject) {
            alert('The default project cannot be deleted.');
            return;
        }

        if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) {
            return;
        }

        // Get or create default project for reassigning tasks
        let defaultProject = projects.find(p => p.isDefaultProject);
        
        if (!defaultProject) {
            defaultProject = {
                id: crypto.randomUUID(),
                name: 'Default',
                color: '#3498db',
                billableRate: 0,
                defaultBillable: true,
                description: 'Default project for unclassified tasks',
                categories: ['Development', 'Research', 'Meeting', 'Planning'],
                isDefaultProject: true
            };
            await dbService.addProject(defaultProject);
            projects.push(defaultProject);
        }

        // Update tasks that were using this project
        const tasks = document.querySelectorAll(`.task-item[data-project="${projectId}"]`);
        for (const taskElement of tasks) {
            const taskId = taskElement.dataset.taskId;
            const task = await dbService.getTask(taskId);
            if (task) {
                task.project = defaultProject.id;
                await dbService.updateTask(task);
                taskElement.dataset.project = defaultProject.id;
                taskElement.querySelector('.task-project').textContent = `Project: ${defaultProject.name}`;
            }
        }

        // Delete project from database
        await dbService.deleteProject(projectId);

        // Remove project from local array
        projects = projects.filter(p => p.id !== projectId);

        // Update UI
        await updateProjectLists();
    } catch (error) {
        errorService.error('Failed to delete project', error);
        alert('Failed to delete project: ' + error.message);
    }
};

window.deleteCategory = (categoryId) => {
    if (confirm('Are you sure you want to delete this category? Tasks using this category will be set to "Uncategorized".')) {
        // Check if category is in use by any projects
        const projectsUsingCategory = projects.filter(p => p.categories.includes(categoryId));
        if (projectsUsingCategory.length > 0) {
            const projectNames = projectsUsingCategory.map(p => p.name).join(', ');
            if (!confirm(`This category is used by the following projects: ${projectNames}\nDo you want to remove it from these projects?`)) {
                return;
            }
            // Remove category from projects
            projects = projects.map(p => ({
                ...p,
                categories: p.categories.filter(c => c !== categoryId)
            }));
            saveProjects();
        }

        // Update tasks using this category
        const tasks = document.querySelectorAll(`.task-item[data-category="${categoryId}"]`);
        tasks.forEach(task => {
            task.dataset.category = 'uncategorized';
            task.querySelector('.task-category').textContent = 'Category: Uncategorized';
        });

        // Remove the category
        categories = categories.filter(c => c.id !== categoryId);
        saveCategories();
    }
};

function formatMarkdown(text) {
    if (!text) return '';
  
    let html = text;
  
    // --- 1) CODE BLOCKS (triple backticks) ---
    // Capture everything between ``` ... ```
    html = html.replace(/```([\s\S]*?)```/g, function (match, codeBlock) {
      // Replace < and > inside code so browsers display them literally
      const escapedCode = codeBlock
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<pre><code>${escapedCode}</code></pre>`;
    });
  
    // --- 2) INLINE CODE (single backticks) ---
    // For inline code, do a similar escape
    html = html.replace(/`([^`]+)`/g, function (match, code) {
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<code>${escaped}</code>`;
    });
  
    // --- 3) HEADINGS (# to ######) ---
    // Order matters: detect longer (######) before shorter (#).
    html = html
      .replace(/^######\s+(.*)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
      .replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
  
    // --- 4) BLOCKQUOTES (>) ---
    // For lines starting with ">"
    html = html.replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>');
  
    // --- 5) BOLD & ITALICS ---
    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
    // --- 6) LIST ITEMS ---
    // (a) Unordered list: lines starting with "-" or "*"
    html = html.replace(/^(\-|\*)\s+(.*)$/gm, '<li data-md-type="ul">$2</li>');
  
    // (b) Ordered list: lines starting with digit+dot
    html = html.replace(/^(\d+)\.\s+(.*)$/gm, '<li data-md-type="ol">$2</li>');
  
    // --- 7) WRAP CONSECUTIVE <li> ... </li> BLOCKS IN <ul> OR <ol> ---
    // This regex finds consecutive <li> blocks (including their newlines)
    html = html.replace(/(?:<li data-md-type="(ol|ul)">.*?<\/li>\s*)+/gm, function (match) {
      // Check the first <li>'s data attribute to decide ol vs ul
      const listType = match.includes('data-md-type="ol"') ? 'ol' : 'ul';
      // Remove the data-md-type attributes and wrap in list tags
      const cleanedItems = match.replace(/\s?data-md-type="(ol|ul)"/g, '');
      return `<${listType}>\n${cleanedItems}\n</${listType}>`;
    });
  
    // --- 8) PARAGRAPHS ---
    // (a) Split on blank lines => separate <p> blocks
    // We'll do this by first trimming extra spaces and ensuring consistent newlines
    html = html.replace(/\r\n/g, '\n');
    html = html.replace(/\n{2,}/g, '\n\n'); // unify multiple blank lines into two
    const paragraphs = html.split(/\n\s*\n/);
    html = paragraphs
      .map(par => {
        // If this chunk already contains block-level tags (like <h1>, <ul>, <ol>, etc.), 
        // or if it's entirely a list or blockquote, we might not want to wrap in <p>.
        // A naive approach is to check if it starts with < (block-level) or has <ul>, <ol>, <h, <blockquote>, <pre>, <hr>, etc.
        if (/^(<h\d|<ul>|<ol>|<blockquote>|<pre>|<table>|<hr>)/i.test(par.trim())) {
          return par;
        }
        return `<p>${par.trim()}</p>`;
      })
      .join('\n');
  
    return html;
  }
function formatMarkdownOG(text) {
    if (!text) return '';
    
    return text
        // Convert numbered lists (ensuring proper numbering)
        .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, '<ol>$&</ol>')
        
        // Convert bullet lists
        .replace(/^\*\s+(.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
        
        // Convert headers (##, ###)
        .replace(/^###\s+(.+)$/gm, '<h4>$1</h4>')
        .replace(/^##\s+(.+)$/gm, '<h3>$1</h3>')
        
        // Convert bold text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        
        // Convert italics
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        
        // Convert paragraphs (double newlines)
        .replace(/\n\n/g, '</p><p>')
        
        // Wrap in paragraph tags if not already wrapped
        .replace(/^(.+)$/gm, function(match) {
            if (!/^<[ho]/.test(match) && !/^<[up]/.test(match)) {
                return '<p>' + match + '</p>';
            }
            return match;
        });
}