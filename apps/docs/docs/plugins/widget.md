# Plugin Widgets (Plugins)

Widgets are reusable UI components that can be embedded in various parts of the `Tuff` interface. This guide explains how to create, register, and use widgets in your plugins.

## What are Widgets?

Widgets are self-contained UI components that can display information, provide controls, or offer interactive features. They can be placed in sidebars, dashboards, panels, or other designated areas of the application.

## Creating a Widget

To create a widget, you need to define its structure, behavior, and appearance.

### Widget Structure

A widget consists of several key parts:

1. **Metadata**: Information about the widget (name, description, etc.)
2. **Configuration**: Settings that users can customize
3. **Rendering Logic**: Code that generates the widget's UI
4. **Event Handling**: Logic to handle user interactions

### Basic Widget Example

Here's a simple example of a widget that displays the current time:

```javascript
// widget.js
import { widget } from '@polyglot-toolbox/plugin-sdk';

class ClockWidget {
  constructor() {
    this.interval = null;
  }
  
  // Widget metadata
  static get metadata() {
    return {
      id: 'clock-widget',
      name: 'Clock',
      description: 'Displays the current time',
      version: '1.0.0'
    };
  }
  
  // Widget configuration schema
  static get configSchema() {
    return {
      timeFormat: {
        type: 'select',
        label: 'Time Format',
        options: [
          { value: '12h', label: '12 Hour' },
          { value: '24h', label: '24 Hour' }
        ],
        default: '12h'
      },
      showSeconds: {
        type: 'boolean',
        label: 'Show Seconds',
        default: false
      }
    };
  }
  
  // Initialize the widget
  async init(config) {
    this.config = config;
    this.element = document.createElement('div');
    this.element.className = 'clock-widget';
    
    // Start the clock
    this.updateTime();
    this.interval = setInterval(() => this.updateTime(), 1000);
    
    return this.element;
  }
  
  // Update the time display
  updateTime() {
    const now = new Date();
    let timeString;
    
    if (this.config.timeFormat === '12h') {
      timeString = now.toLocaleTimeString('en-US', { 
        hour12: true,
        second: this.config.showSeconds ? '2-digit' : undefined
      });
    } else {
      timeString = now.toLocaleTimeString('en-US', { 
        hour12: false,
        second: this.config.showSeconds ? '2-digit' : undefined
      });
    }
    
    this.element.innerHTML = `<div class="clock-time">${timeString}</div>`;
  }
  
  // Handle configuration changes
  async onConfigChange(newConfig) {
    this.config = newConfig;
    this.updateTime();
  }
  
  // Clean up when the widget is removed
  async destroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
}

// Register the widget
widget.register(ClockWidget);
```

### Widget Styles

Widgets should include their own CSS styles:

```css
/* widget.css */
.clock-widget {
  padding: 16px;
  text-align: center;
  font-family: var(--theme-font-family);
}

.clock-time {
  font-size: var(--theme-typography-h2-fontSize);
  font-weight: var(--theme-typography-h2-fontWeight);
  color: var(--theme-text);
}
```

## Widget Registration

To make your widget available in the application, you need to register it:

```javascript
import { widget } from '@polyglot-toolbox/plugin-sdk';
import { ClockWidget } from './widget.js';

// Register the widget
widget.register(ClockWidget);
```

### Registration Options

You can provide additional options when registering a widget:

```javascript
widget.register(ClockWidget, {
  // Specify where the widget can be placed
  placement: ['sidebar', 'dashboard'],
  
  // Set default configuration
  defaultConfig: {
    timeFormat: '24h',
    showSeconds: true
  },
  
  // Provide tags for categorization
  tags: ['time', 'utility', 'display']
});
```

## Widget Configuration

Widgets can have configurable options that users can adjust.

### Configuration Schema

Define a configuration schema to specify what options are available:

```javascript
static get configSchema() {
  return {
    title: {
      type: 'string',
      label: 'Widget Title',
      default: 'My Widget'
    },
    refreshInterval: {
      type: 'number',
      label: 'Refresh Interval (seconds)',
      default: 30,
      min: 5,
      max: 300
    },
    showBorder: {
      type: 'boolean',
      label: 'Show Border',
      default: true
    },
    colorScheme: {
      type: 'select',
      label: 'Color Scheme',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'auto', label: 'Auto' }
      ],
      default: 'auto'
    }
  };
}
```

### Handling Configuration Changes

React to configuration changes in your widget:

```javascript
async onConfigChange(newConfig) {
  this.config = newConfig;
  
  // Update the widget based on new configuration
  this.updateStyles();
  this.restartRefreshTimer();
}
```

## Advanced Widget Features

### Data Fetching

Widgets can fetch data from external sources:

```javascript
class WeatherWidget {
  // ... other widget code ...
  
  async init(config) {
    this.config = config;
    this.element = document.createElement('div');
    this.element.className = 'weather-widget';
    
    // Load initial data
    await this.loadData();
    
    // Set up refresh interval
    this.setupRefresh();
    
    return this.element;
  }
  
  async loadData() {
    try {
      const response = await fetch(
        `https://api.weather.com/v1/current?location=${this.config.location}&key=${this.config.apiKey}`
      );
      const data = await response.json();
      
      this.displayWeather(data);
    } catch (error) {
      console.error('Failed to load weather data:', error);
      this.displayError('Failed to load weather data');
    }
  }
  
  displayWeather(data) {
    this.element.innerHTML = `
      <div class="weather-info">
        <h3>${data.location}</h3>
        <div class="temperature">${data.temperature}°${data.unit}</div>
        <div class="condition">${data.condition}</div>
      </div>
    `;
  }
  
  displayError(message) {
    this.element.innerHTML = `<div class="error">${message}</div>`;
  }
  
  setupRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    this.refreshInterval = setInterval(() => {
      this.loadData();
    }, this.config.refreshInterval * 1000);
  }
  
  async onConfigChange(newConfig) {
    this.config = newConfig;
    await this.loadData();
    this.setupRefresh();
  }
  
  async destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}
```

### Event Handling

Widgets can emit events and listen to events from other parts of the application:

```javascript
class InteractiveWidget {
  // ... other widget code ...
  
  async init(config) {
    this.config = config;
    this.element = document.createElement('div');
    this.element.className = 'interactive-widget';
    
    this.render();
    this.setupEventListeners();
    
    return this.element;
  }
  
  render() {
    this.element.innerHTML = `
      <div class="counter">
        <button id="decrement-btn">-</button>
        <span id="count-display">0</span>
        <button id="increment-btn">+</button>
        <button id="reset-btn">Reset</button>
      </div>
    `;
  }
  
  setupEventListeners() {
    const decrementBtn = this.element.querySelector('#decrement-btn');
    const incrementBtn = this.element.querySelector('#increment-btn');
    const resetBtn = this.element.querySelector('#reset-btn');
    const countDisplay = this.element.querySelector('#count-display');
    
    let count = 0;
    
    decrementBtn.addEventListener('click', () => {
      count--;
      countDisplay.textContent = count;
      
      // Emit an event when the count changes
      this.emitEvent('countChanged', { count });
    });
    
    incrementBtn.addEventListener('click', () => {
      count++;
      countDisplay.textContent = count;
      
      // Emit an event when the count changes
      this.emitEvent('countChanged', { count });
    });
    
    resetBtn.addEventListener('click', () => {
      count = 0;
      countDisplay.textContent = count;
      
      // Emit an event when the count is reset
      this.emitEvent('countReset', { count });
    });
  }
  
  // Emit a custom event
  emitEvent(eventName, data) {
    // Use the widget API to emit events
    widget.emit(eventName, {
      widgetId: this.constructor.metadata.id,
      ...data
    });
  }
  
  // Listen to events from other widgets or the application
  async onAppEvent(eventName, data) {
    if (eventName === 'applicationStarted') {
      console.log('Application started, initializing widget');
    }
  }
}
```

## Widget Best Practices

When creating widgets for your plugin, consider the following best practices:

### 1. Keep Widgets Lightweight

Widgets should be lightweight and load quickly:

```javascript
// Good - Lazy loading heavy dependencies
class DataVisualizationWidget {
  async init(config) {
    this.config = config;
    this.element = document.createElement('div');
    
    // Show loading state initially
    this.element.innerHTML = '<div class="loading">Loading...</div>';
    
    // Load heavy visualization library only when needed
    const { Chart } = await import('./chart-library.js');
    this.Chart = Chart;
    
    // Render the actual widget
    this.render();
    
    return this.element;
  }
}

// Avoid - Loading everything upfront
import { HeavyChartLibrary } from './heavy-chart-library.js'; // This slows down the app

class SlowWidget {
  // ...
}
```

### 2. Handle Errors Gracefully

Always handle potential errors in widgets:

```javascript
class DataWidget {
  async loadData() {
    try {
      const data = await this.fetchData();
      this.displayData(data);
    } catch (error) {
      console.error('Failed to load data:', error);
      this.displayError('Failed to load data. Please try again later.');
    }
  }
  
  displayError(message) {
    this.element.innerHTML = `
      <div class="error-container">
        <div class="error-message">${message}</div>
        <button id="retry-btn">Retry</button>
      </div>
    `;
    
    const retryBtn = this.element.querySelector('#retry-btn');
    retryBtn.addEventListener('click', () => {
      this.loadData();
    });
  }
}
```

### 3. Respect User Preferences

Consider user preferences like theme and accessibility settings:

```javascript
class AccessibleWidget {
  async init(config) {
    this.config = config;
    this.element = document.createElement('div');
    
    // Respect reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.element.classList.add('reduced-motion');
    }
    
    // Respect high contrast preference
    if (window.matchMedia('(prefers-contrast: high)').matches) {
      this.element.classList.add('high-contrast');
    }
    
    this.render();
    return this.element;
  }
}
```

### 4. Clean Up Resources

Always clean up resources when a widget is destroyed:

```javascript
class TimerWidget {
  async init(config) {
    this.config = config;
    this.element = document.createElement('div');
    
    // Set up interval
    this.interval = setInterval(() => {
      this.updateDisplay();
    }, 1000);
    
    // Set up event listener
    this.resizeHandler = () => this.handleResize();
    window.addEventListener('resize', this.resizeHandler);
    
    this.render();
    return this.element;
  }
  
  async destroy() {
    // Clean up interval
    if (this.interval) {
      clearInterval(this.interval);
    }
    
    // Remove event listener
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
  }
}
```

## Example: Comprehensive Widget Plugin

Here's a complete example of a plugin that provides a comprehensive widget:

```javascript
// plugin.js
import { widget, toast } from '@polyglot-toolbox/plugin-sdk';

class TaskManagerWidget {
  constructor() {
    this.tasks = [];
    this.filter = 'all';
  }
  
  // Widget metadata
  static get metadata() {
    return {
      id: 'task-manager-widget',
      name: 'Task Manager',
      description: 'Manage your tasks and to-do lists',
      version: '1.0.0'
    };
  }
  
  // Widget configuration schema
  static get configSchema() {
    return {
      defaultFilter: {
        type: 'select',
        label: 'Default Filter',
        options: [
          { value: 'all', label: 'All Tasks' },
          { value: 'active', label: 'Active Tasks' },
          { value: 'completed', label: 'Completed Tasks' }
        ],
        default: 'all'
      },
      showDueDates: {
        type: 'boolean',
        label: 'Show Due Dates',
        default: true
      }
    };
  }
  
  // Initialize the widget
  async init(config) {
    this.config = config;
    this.filter = config.defaultFilter;
    
    // Create the widget element
    this.element = document.createElement('div');
    this.element.className = 'task-manager-widget';
    
    // Load tasks from storage
    await this.loadTasks();
    
    // Render the widget
    this.render();
    
    // Set up event listeners
    this.setupEventListeners();
    
    return this.element;
  }
  
  // Load tasks from storage
  async loadTasks() {
    try {
      const storedTasks = await widget.storage.get('tasks', []);
      this.tasks = storedTasks;
    } catch (error) {
      console.error('Failed to load tasks:', error);
      toast.error('Failed to load tasks');
    }
  }
  
  // Save tasks to storage
  async saveTasks() {
    try {
      await widget.storage.set('tasks', this.tasks);
    } catch (error) {
      console.error('Failed to save tasks:', error);
      toast.error('Failed to save tasks');
    }
  }
  
  // Render the widget UI
  render() {
    const filteredTasks = this.getFilteredTasks();
    
    this.element.innerHTML = `
      <div class="task-manager-container">
        <h2>Task Manager</h2>
        
        <div class="task-input-container">
          <input type="text" id="task-input" placeholder="Add a new task..." />
          <button id="add-task-btn">Add</button>
        </div>
        
        <div class="task-filters">
          <button class="filter-btn ${this.filter === 'all' ? 'active' : ''}" data-filter="all">All</button>
          <button class="filter-btn ${this.filter === 'active' ? 'active' : ''}" data-filter="active">Active</button>
          <button class="filter-btn ${this.filter === 'completed' ? 'active' : ''}" data-filter="completed">Completed</button>
        </div>
        
        <ul class="task-list">
          ${filteredTasks.map(task => this.renderTask(task)).join('')}
        </ul>
        
        <div class="task-stats">
          ${this.tasks.filter(t => !t.completed).length} tasks remaining
        </div>
      </div>
    `;
  }
  
  // Render a single task
  renderTask(task) {
    return `
      <li class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
        <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} />
        <span class="task-text">${task.text}</span>
        ${this.config.showDueDates && task.dueDate ? 
          `<span class="task-due-date">${new Date(task.dueDate).toLocaleDateString()}</span>` : 
          ''
        }
        <button class="task-delete-btn">✕</button>
      </li>
    `;
  }
  
  // Get filtered tasks based on current filter
  getFilteredTasks() {
    switch (this.filter) {
      case 'active':
        return this.tasks.filter(task => !task.completed);
      case 'completed':
        return this.tasks.filter(task => task.completed);
      default:
        return this.tasks;
    }
  }
  
  // Set up event listeners
  setupEventListeners() {
    // Add task button
    const addTaskBtn = this.element.querySelector('#add-task-btn');
    addTaskBtn.addEventListener('click', () => this.addTask());
    
    // Task input
    const taskInput = this.element.querySelector('#task-input');
    taskInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addTask();
      }
    });
    
    // Filter buttons
    const filterButtons = this.element.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setFilter(e.target.dataset.filter);
      });
    });
    
    // Task list (using event delegation)
    const taskList = this.element.querySelector('.task-list');
    taskList.addEventListener('click', (e) => {
      const taskItem = e.target.closest('.task-item');
      if (!taskItem) return;
      
      const taskId = taskItem.dataset.id;
      
      if (e.target.classList.contains('task-checkbox')) {
        this.toggleTask(taskId);
      } else if (e.target.classList.contains('task-delete-btn')) {
        this.deleteTask(taskId);
      }
    });
  }
  
  // Add a new task
  async addTask() {
    const input = this.element.querySelector('#task-input');
    const text = input.value.trim();
    
    if (text) {
      const newTask = {
        id: Date.now().toString(),
        text: text,
        completed: false,
        createdAt: new Date().toISOString()
      };
      
      this.tasks.push(newTask);
      await this.saveTasks();
      this.render();
      input.value = '';
    }
  }
  
  // Toggle task completion status
  async toggleTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.completed = !task.completed;
      await this.saveTasks();
      this.render();
    }
  }
  
  // Delete a task
  async deleteTask(taskId) {
    this.tasks = this.tasks.filter(t => t.id !== taskId);
    await this.saveTasks();
    this.render();
  }
  
  // Set the current filter
  setFilter(filter) {
    this.filter = filter;
    this.render();
  }
  
  // Handle configuration changes
  async onConfigChange(newConfig) {
    this.config = newConfig;
    this.render();
  }
  
  // Clean up when the widget is removed
  async destroy() {
    // Any cleanup code would go here
    console.log('Task Manager widget destroyed');
  }
}

// Register the widget
widget.register(TaskManagerWidget);

export default TaskManagerWidget;
```

Corresponding CSS file:

```css
/* widget.css */
.task-manager-widget {
  padding: 16px;
  font-family: var(--theme-font-family);
}

.task-manager-container h2 {
  margin-top: 0;
  color: var(--theme-text);
}

.task-input-container {
  display: flex;
  margin-bottom: 16px;
}

.task-input-container input {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--theme-border-color);
  border-radius: 4px 0 0 4px;
  font-size: var(--theme-typography-body-fontSize);
}

.task-input-container button {
  padding: 8px 16px;
  background-color: var(--theme-primary);
  color: var(--theme-on-primary);
  border: none;
  border-radius: 0 4px 4px 0;
  cursor: pointer;
}

.task-filters {
  margin-bottom: 16px;
}

.filter-btn {
  background-color: var(--theme-surface);
  color: var(--theme-text);
  border: 1px solid var(--theme-border-color);
  padding: 4px 8px;
  margin-right: 8px;
  border-radius: 4px;
  cursor: pointer;
}

.filter-btn.active {
  background-color: var(--theme-primary);
  color: var(--theme-on-primary);
}

.task-list {
  list-style: none;
  padding: 0;
  margin: 0 0 16px 0;
}

.task-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--theme-border-color);
}

.task-item.completed .task-text {
  text-decoration: line-through;
  color: var(--theme-text-secondary);
}

.task-checkbox {
  margin-right: 8px;
}

.task-text {
  flex: 1;
  color: var(--theme-text);
}

.task-due-date {
  margin: 0 8px;
  font-size: var(--theme-typography-caption-fontSize);
  color: var(--theme-text-secondary);
}

.task-delete-btn {
  background: none;
  border: none;
  color: var(--theme-error);
  cursor: pointer;
  font-size: 16px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-stats {
  text-align: center;
  color: var(--theme-text-secondary);
  font-size: var(--theme-typography-caption-fontSize);
}
```

This widget demonstrates proper use of the widget system by:
1. Defining clear metadata and configuration schema
2. Implementing proper initialization and cleanup
3. Handling user interactions and events
4. Storing and retrieving data
5. Respecting user preferences and themes
6. Handling errors gracefully
7. Following best practices for performance and accessibility

For more information about the plugin SDK and available APIs, see the [Plugin SDK documentation](/docs/plugins/introduction).