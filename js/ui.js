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
let projects = JSON.parse(localStorage.getItem('projects')) || [
    { 
        id: generateUUID(),
        name: 'Default',
        color: '#3498db', 
        billableRate: 0, 
        defaultBillable: true,
        description: 'Default project for unclassified tasks',
        categories: ['Development', 'Research', 'Meeting', 'Planning'],
        isDefaultProject: true
    }
];

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
    
    // Load and display projects
    updateProjectLists();
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

// Export functions at the top level
export async function initializeUI() {
    try {
        // Initialize error boundaries first
        taskListBoundary = new ErrorBoundary('taskContainer', errorService);
        projectListBoundary = new ErrorBoundary('projectList', errorService);
        settingsBoundary = new ErrorBoundary('settings-form', errorService);

        // Initialize each component with its error boundary
        await taskListBoundary.captureError(initializeTaskList);
        await projectListBoundary.captureError(initializeProjectList);
        await settingsBoundary.captureError(initializeSettings);
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

export async function saveProject(project) {
    if (!projectListBoundary) {
        throw new Error('UI not initialized');
    }
    try {
        await projectListBoundary.captureError(async () => {
            // Validate project data
            if (!project || !project.name) {
                throw new Error('Invalid project data');
            }

            const result = await dbService.saveProject(project);
            if (!result) {
                throw new Error('Failed to save project to database');
            }

            await updateProjectList();
        });
    } catch (error) {
        errorService.error('Failed to save project', error, { project });
        throw error;
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
        
        // Set up event listeners
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

        // Create task confirmation modal
        createTaskModal();
        
        // Initialize everything
        updateProjectLists();
        updateTemplateList();
        updateCategoryList();
        updateCategorySelectors();
        initializeAIProviderUI();
        filterTasks();
        
        // Load saved interval on startup
        const savedInterval = localStorage.getItem('capture_interval');
        if (savedInterval) {
            const interval = parseInt(savedInterval, 10);
            if (interval > 0) {
                intervalInput.value = interval;
                backgroundService.setCaptureInterval(interval);
            }
        }
    } catch (error) {
        errorService.fatal('Critical initialization error', error);
        showInitializationError();
    }
});

// ---------------------
// The following are helper functions and UI management routines
// ---------------------

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
    const projectList = document.getElementById('projectList');
    if (!projectList) return;
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
    
    const projectFilter = document.getElementById('projectFilter');
    const defaultProjectSelect = document.getElementById('defaultProject');
    if (projectFilter) {
      projectFilter.innerHTML = '<option value="">All Projects</option>' + projectOptions;
    }
    if (defaultProjectSelect) {
      defaultProjectSelect.innerHTML = projectOptions;
    }
    const taskProject = document.getElementById('taskProject');
    if (taskProject) {
      taskProject.innerHTML = projectOptions;
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

// Project Modal Handling
function openProjectModal(projectId = null) {
    const modal = document.getElementById('projectModal');
    const form = document.getElementById('projectForm');
    const nameInput = document.getElementById('projectName');
    const colorInput = document.getElementById('projectColor');
    const billableRateInput = document.getElementById('billableRate');
    const defaultBillableInput = document.getElementById('defaultBillable');
    const descriptionInput = document.getElementById('projectDescription');
    const categoriesInput = document.getElementById('projectCategories');

    // Update categories dropdown
    const categoryOptions = categories.map(category => 
        `<option value="${category.id}">${category.name}</option>`
    ).join('');
    categoriesInput.innerHTML = categoryOptions;

    // If editing existing project
    if (projectId) {
        const project = projects.find(p => p.id === projectId);
        if (project) {
            nameInput.value = project.name;
            colorInput.value = project.color || '#3498db';
            billableRateInput.value = project.billableRate || '';
            defaultBillableInput.checked = project.defaultBillable || false;
            descriptionInput.value = project.description || '';
            
            // Set selected categories
            if (project.categories && Array.isArray(project.categories)) {
                Array.from(categoriesInput.options).forEach(option => {
                    option.selected = project.categories.includes(option.value);
                });
            }
            form.dataset.editId = projectId;
        }
    } else {
        // New project
        form.reset();
        delete form.dataset.editId;
    }

    modal.style.display = 'block';
}

function closeProjectModal() {
    const modal = document.getElementById('projectModal');
    modal.style.display = 'none';
}

// Project Form Handling
document.getElementById('projectForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const projectData = {
        id: form.dataset.editId || generateUUID(),
        name: form.querySelector('#projectName').value,
        color: form.querySelector('#projectColor').value,
        billableRate: parseFloat(form.querySelector('#billableRate').value) || 0,
        defaultBillable: form.querySelector('#defaultBillable').checked,
        description: form.querySelector('#projectDescription').value || '',
        categories: Array.from(form.querySelector('#projectCategories').selectedOptions).map(opt => opt.value)
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
        timestamp: new Date().toISOString()
    };

    await dbService.addTask(task);
    backgroundService.addTaskToUI(task);
    closeManualTaskModal();
});

// Add dynamic category filtering when project is selected
document.getElementById('taskProject').addEventListener('change', (e) => {
    const selectedProject = e.target.value;
    const project = projects.find(p => p.id === selectedProject);
    const categorySelect = document.getElementById('taskCategory');
    
    // Filter categories to only show those supported by the selected project
    Array.from(categorySelect.options).forEach(option => {
        option.disabled = !project.categories.includes(option.value);
        if (option.disabled && option.selected) {
            categorySelect.value = project.categories[0]; // Select first supported category
        }
    });
});

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
        screenshot: compositeScreenshot
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
    //console.log('addTaskToUI', task);
    const taskContainer = document.getElementById('taskContainer');
    //console.log('taskContainer', taskContainer);
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
    
    // Format times for display
    const startTime = new Date(task.startTime).toLocaleTimeString();
    const endTime = new Date(task.endTime).toLocaleTimeString();
    
    taskElement.innerHTML = `
        <div class="task-content">
            <div class="task-header">
                <label class="task-select">
                    <input type="checkbox" class="task-checkbox" title="Select for merging" style="width: 20px; height: 20px; margin-right: 10px;">
                    <span>Select</span>
                </label>
                <img src="${task.screenshot || dbService.defaultScreenshot}" 
                     alt="Task Screenshot" 
                     class="task-screenshot"
                     style="width: 50px; height: 50px; object-fit: contain; margin-right: 10px; cursor: pointer;"
                     title="Click to view full screenshot">
                <strong class="task-name">${task.name}</strong>
            </div>
            <div class="task-details">
                <span class="task-project">Project: ${task.project}</span> |
                <span class="task-category">Category: ${task.category}</span> |
                <span class="task-duration">Duration: ${task.duration} min</span>
            </div>
            <div class="task-time">
                ${startTime} - ${endTime}
            </div>
            <div class="task-confidence">Confidence: ${(task.confidence * 100).toFixed(1)}%</div>
            ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
            <div class="task-uuid">ID: ${task.uuid}</div>
            <div class="task-actions">
                <label class="billable-checkbox">
                    <input type="checkbox" ${task.billable ? 'checked' : ''} onclick="event.stopPropagation();">
                    <span>Billable</span>
                </label>
            </div>
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
    //taskContainer.prepend(taskElement);
     // Add to beginning of list
     /* if (taskContainer.firstChild) {
        console.log('taskContainer.firstChild', taskContainer.firstChild);
        taskContainer.insertBefore(taskElement, taskContainer.firstChild);
    } else {
        taskContainer.appendChild(taskElement);
    } */

    // Keep only last 10 tasks
   // while (taskContainer.children.length > 10) {
        //taskContainer.removeChild(taskContainer.lastChild);
   //}
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
    const project = projects.find(p => p.id === projectId);
    if (project && project.isDefaultProject) {
        alert('The default project cannot be deleted.');
        return;
    }
    
    if (confirm('Are you sure you want to delete this project? This cannot be undone.')) {
        projects = projects.filter(p => p.id !== projectId);
        saveProjects();
        // Update any tasks that were using this project to use the default project
        const defaultProject = projects.find(p => p.isDefaultProject);
        const tasks = document.querySelectorAll(`.task-item[data-project="${projectId}"]`);
        tasks.forEach(task => {
            task.dataset.project = defaultProject.id;
            task.querySelector('.task-project').textContent = `Project: ${defaultProject.name}`;
        });
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

// Make closeProjectModal available globally
window.closeProjectModal = closeProjectModal;