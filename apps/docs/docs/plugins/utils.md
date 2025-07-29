# Plugin Utilities (Plugins)

The `Polyglot Toolbox` provides a comprehensive set of utility functions through the plugin SDK to help you build more efficient and robust plugins. This guide covers the most commonly used utilities.

## String Utilities

### Formatting

Format strings for display:

::: code-group

```javascript [String Formatting]
import { utils } from '@polyglot-toolbox/plugin-sdk';

// Capitalize the first letter of a string
const capitalized = utils.string.capitalize('hello world');
console.log(capitalized); // "Hello world"

// Convert to kebab-case
const kebabCase = utils.string.toKebabCase('HelloWorld');
console.log(kebabCase); // "hello-world"

// Convert to camelCase
const camelCase = utils.string.toCamelCase('hello-world');
console.log(camelCase); // "helloWorld"

// Truncate a string with ellipsis
const truncated = utils.string.truncate('This is a long string', 10);
console.log(truncated); // "This is a..."
```

:::

### Validation

Validate string formats:

::: code-group

```javascript [String Validation]
// Check if a string is a valid email
const isValidEmail = utils.string.isValidEmail('user@example.com');
console.log(isValidEmail); // true

// Check if a string is a valid URL
const isValidUrl = utils.string.isValidUrl('https://example.com');
console.log(isValidUrl); // true

// Check if a string contains only alphanumeric characters
const isAlphanumeric = utils.string.isAlphanumeric('abc123');
console.log(isAlphanumeric); // true
```

:::

## Array Utilities

### Manipulation

Manipulate arrays efficiently:

::: code-group

```javascript [Array Manipulation]
// Group an array by a property
const users = [
  { name: 'Alice', department: 'Engineering' },
  { name: 'Bob', department: 'Marketing' },
  { name: 'Charlie', department: 'Engineering' }
];

const grouped = utils.array.groupBy(users, 'department');
console.log(grouped);
// {
//   Engineering: [
//     { name: 'Alice', department: 'Engineering' },
//     { name: 'Charlie', department: 'Engineering' }
//   ],
//   Marketing: [
//     { name: 'Bob', department: 'Marketing' }
//   ]
// }

// Remove duplicates from an array
const withDuplicates = [1, 2, 2, 3, 3, 4];
const unique = utils.array.unique(withDuplicates);
console.log(unique); // [1, 2, 3, 4]

// Shuffle an array
const ordered = [1, 2, 3, 4, 5];
const shuffled = utils.array.shuffle(ordered);
console.log(shuffled); // [3, 1, 5, 2, 4] (random order)
```

:::

### Search and Filter

Search and filter arrays:

::: code-group

```javascript [Array Search and Filter]
const items = [
  { id: 1, name: 'Apple', category: 'Fruit' },
  { id: 2, name: 'Carrot', category: 'Vegetable' },
  { id: 3, name: 'Banana', category: 'Fruit' }
];

// Find items matching a query
const results = utils.array.search(items, 'Apple', ['name']);
console.log(results); // [{ id: 1, name: 'Apple', category: 'Fruit' }]

// Filter items by multiple criteria
const filtered = utils.array.filter(items, {
  category: 'Fruit',
  name: (name) => name.startsWith('A')
});
console.log(filtered); // [{ id: 1, name: 'Apple', category: 'Fruit' }]
```

:::

## Object Utilities

### Manipulation

Manipulate objects effectively:

::: code-group

```javascript [Object Manipulation]
// Deep clone an object
const original = { a: 1, b: { c: 2 } };
const cloned = utils.object.clone(original);
cloned.b.c = 3;
console.log(original.b.c); // 2
console.log(cloned.b.c); // 3

// Merge objects deeply
const obj1 = { a: 1, b: { c: 2 } };
const obj2 = { b: { d: 3 }, e: 4 };
const merged = utils.object.merge(obj1, obj2);
console.log(merged); // { a: 1, b: { c: 2, d: 3 }, e: 4 }

// Pick specific properties from an object
const user = { name: 'Alice', age: 30, email: 'alice@example.com' };
const publicInfo = utils.object.pick(user, ['name', 'email']);
console.log(publicInfo); // { name: 'Alice', email: 'alice@example.com' }

// Omit specific properties from an object
const privateInfo = utils.object.omit(user, ['email']);
console.log(privateInfo); // { name: 'Alice', age: 30 }
```

:::

### Validation

Validate object structures:

::: code-group

```javascript [Object Validation]
// Check if an object has all required properties
const requiredProps = ['name', 'email'];
const user = { name: 'Alice', email: 'alice@example.com' };
const isValid = utils.object.hasProperties(user, requiredProps);
console.log(isValid); // true

// Validate object against a schema
const schema = {
  name: 'string',
  age: 'number',
  active: 'boolean'
};

const data = { name: 'Alice', age: 30, active: true };
const isValidSchema = utils.object.validateSchema(data, schema);
console.log(isValidSchema); // true
```

:::

## Date Utilities

### Formatting

Format dates for display:

::: code-group

```javascript [Date Formatting]
// Format a date
const date = new Date('2023-10-15T14:30:00Z');
const formatted = utils.date.format(date, 'YYYY-MM-DD HH:mm');
console.log(formatted); // "2023-10-15 14:30"

// Get relative time
const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
const relative = utils.date.relativeTime(pastDate);
console.log(relative); // "1 day ago"
```

:::

### Manipulation

Manipulate dates:

::: code-group

```javascript [Date Manipulation]
// Add time to a date
const now = new Date();
const tomorrow = utils.date.add(now, 1, 'day');
console.log(tomorrow); // Date object for tomorrow

// Calculate the difference between two dates
const startDate = new Date('2023-10-01');
const endDate = new Date('2023-10-15');
const diff = utils.date.difference(startDate, endDate, 'day');
console.log(diff); // 14
```

:::

## Number Utilities

### Formatting

Format numbers for display:

::: code-group

```javascript [Number Formatting]
// Format a number with commas
const formattedNumber = utils.number.format(1234567.89);
console.log(formattedNumber); // "1,234,567.89"

// Format a number as currency
const formattedCurrency = utils.number.formatCurrency(1234.56, 'USD');
console.log(formattedCurrency); // "$1,234.56"

// Format a number as a percentage
const formattedPercent = utils.number.formatPercent(0.1234);
console.log(formattedPercent); // "12.34%"
```

:::

### Validation

Validate number formats:

::: code-group

```javascript [Number Validation]
// Check if a value is a valid number
const isValid = utils.number.isValid(123);
console.log(isValid); // true

// Clamp a number between min and max values
const clamped = utils.number.clamp(150, 0, 100);
console.log(clamped); // 100
```

:::

## File Utilities

### Path Manipulation

Manipulate file paths:

::: code-group

```javascript [File Path Manipulation]
// Join path segments
const fullPath = utils.file.joinPath('home', 'user', 'documents', 'file.txt');
console.log(fullPath); // "home/user/documents/file.txt"

// Get the file extension
const extension = utils.file.getExtension('/path/to/file.txt');
console.log(extension); // "txt"

// Get the file name without extension
const fileName = utils.file.getFileName('/path/to/file.txt');
console.log(fileName); // "file"

// Get the directory name
const dirName = utils.file.getDirName('/path/to/file.txt');
console.log(dirName); // "/path/to"
```

:::

### Size Formatting

Format file sizes:

::: code-group

```javascript [File Size Formatting]
// Format bytes to human-readable format
const formattedSize = utils.file.formatSize(1024 * 1024 * 1.5); // 1.5 MB in bytes
console.log(formattedSize); // "1.5 MB"
```

:::

## Network Utilities

### URL Manipulation

Manipulate URLs:

::: code-group

```javascript [URL Manipulation]
// Parse a URL
const urlInfo = utils.network.parseUrl('https://example.com/path?query=value');
console.log(urlInfo);
// {
//   protocol: 'https:',
//   hostname: 'example.com',
//   pathname: '/path',
//   query: { query: 'value' }
// }

// Build a URL from components
const url = utils.network.buildUrl({
  protocol: 'https',
  hostname: 'example.com',
  pathname: '/api/data',
  query: { page: 1, limit: 10 }
});
console.log(url); // "https://example.com/api/data?page=1&limit=10"
```

:::

### Validation

Validate network-related data:

::: code-group

```javascript [Network Validation]
// Check if a string is a valid IP address
const isValidIP = utils.network.isValidIP('192.168.1.1');
console.log(isValidIP); // true

// Check if a port number is valid
const isValidPort = utils.network.isValidPort(8080);
console.log(isValidPort); // true
```

:::

## Async Utilities

### Promise Helpers

Work with promises more effectively:

::: code-group

```javascript [Promise Helpers]
// Sleep for a specified time
async function delayedOperation() {
  console.log('Starting operation');
  await utils.async.sleep(2000); // Wait for 2 seconds
  console.log('Operation completed');
}

// Retry a function with exponential backoff
async function unreliableOperation() {
  // Simulate an operation that might fail
  if (Math.random() > 0.7) {
    throw new Error('Operation failed');
  }
  return 'Success';
}

utils.async.retry(unreliableOperation, {
  maxRetries: 3,
  delay: 1000
}).then(result => {
  console.log('Result:', result);
}).catch(error => {
  console.error('Failed after retries:', error);
});
```

:::

### Concurrency Control

Control concurrent operations:

::: code-group

```javascript [Concurrency Control]
// Limit the number of concurrent operations
const urls = [
  'https://api.example.com/data1',
  'https://api.example.com/data2',
  'https://api.example.com/data3'
];

const results = await utils.async.mapLimit(urls, 2, async (url) => {
  const response = await fetch(url);
  return response.json();
});

console.log('Results:', results);
```

:::

## Best Practices for Using Utilities

When using utilities in your plugin, consider the following best practices:

### 1. Use Utilities for Common Tasks

Instead of writing your own implementations, use the provided utilities:

::: code-group

```javascript [Use Utilities for Common Tasks]
// Good - Using utility function
const uniqueItems = utils.array.unique(items);

// Avoid - Writing your own implementation
const uniqueItems = [...new Set(items)]; // Less clear and potentially less efficient
```

:::

### 2. Combine Utilities for Complex Operations

Chain utilities to perform complex operations:

```javascript
// Good - Combining utilities
const processedData = utils.array.unique(
  utils.array.search(users, 'engineer', ['jobTitle'])
).map(user => utils.object.pick(user, ['name', 'email']));

// Avoid - Writing complex logic manually
const processedData = [];
users.forEach(user => {
  if (user.jobTitle.toLowerCase().includes('engineer')) {
    // ... complex logic to check for duplicates and pick properties
  }
});
```

### 3. Handle Errors Gracefully

Always handle potential errors when using utilities:

```javascript
// Good - Handling errors
try {
  const parsed = utils.network.parseUrl(userInput);
  // Use parsed URL
} catch (error) {
  console.error('Invalid URL:', error);
  toast.error('Please enter a valid URL');
}

// Avoid - Not handling errors
const parsed = utils.network.parseUrl(userInput); // Might throw an error
```

### 4. Use Type-Safe Utilities

Take advantage of type checking when available:

```javascript
// Good - Using type-safe utilities
if (utils.number.isValid(userInput)) {
  const number = parseFloat(userInput);
  // Process number safely
} else {
  console.log('Invalid number input');
}
```

## Example: Data Processing Plugin

Here's a complete example of a plugin that makes extensive use of utilities:

```javascript
// plugin.js
import { utils, toast } from '@polyglot-toolbox/plugin-sdk';

class DataProcessingPlugin {
  constructor() {
    this.init();
  }
  
  init() {
    // Set up event listeners
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    const processButton = document.getElementById('process-data-btn');
    if (processButton) {
      processButton.addEventListener('click', () => {
        this.processData();
      });
    }
  }
  
  async processData() {
    try {
      // Get data from some source
      const rawData = await this.fetchData();
      
      // Validate and clean data
      const validData = this.validateAndCleanData(rawData);
      
      // Process the data
      const processedData = this.transformData(validData);
      
      // Display results
      this.displayResults(processedData);
      
      toast.success(`Successfully processed ${processedData.length} items`);
    } catch (error) {
      console.error('Error processing data:', error);
      toast.error('Failed to process data. Please try again.');
    }
  }
  
  async fetchData() {
    // Simulate fetching data
    const response = await fetch('/api/data');
    const data = await response.json();
    
    // Validate response
    if (!Array.isArray(data)) {
      throw new Error('Invalid data format');
    }
    
    return data;
  }
  
  validateAndCleanData(data) {
    // Remove invalid entries
    const validEntries = data.filter(entry => {
      return utils.string.isValidEmail(entry.email) &&
             utils.number.isValid(entry.age) &&
             entry.name && entry.name.trim() !== '';
    });
    
    // Remove duplicates based on email
    const uniqueEntries = utils.array.unique(validEntries, 'email');
    
    // Clean and format data
    return uniqueEntries.map(entry => ({
      ...entry,
      name: utils.string.capitalize(entry.name.trim()),
      email: entry.email.toLowerCase(),
      age: parseInt(entry.age, 10),
      registered: utils.date.format(new Date(entry.registered), 'YYYY-MM-DD')
    }));
  }
  
  transformData(data) {
    // Group by age range
    const groupedByAge = utils.array.groupBy(data, (item) => {
      if (item.age < 18) return 'minor';
      if (item.age < 65) return 'adult';
      return 'senior';
    });
    
    // Calculate statistics
    const statistics = Object.keys(groupedByAge).map(group => {
      const items = groupedByAge[group];
      const averageAge = items.reduce((sum, item) => sum + item.age, 0) / items.length;
      
      return {
        group,
        count: items.length,
        averageAge: utils.number.clamp(averageAge, 0, 100),
        names: utils.array.unique(items.map(item => item.name))
      };
    });
    
    return statistics;
  }
  
  displayResults(data) {
    const resultsContainer = document.getElementById('results-container');
    if (!resultsContainer) return;
    
    // Clear previous results
    resultsContainer.innerHTML = '';
    
    // Display each group
    data.forEach(group => {
      const groupElement = document.createElement('div');
      groupElement.className = 'group-result';
      
      groupElement.innerHTML = `
        <h3>${utils.string.capitalize(group.group)} (${group.count} people)</h3>
        <p>Average age: ${group.averageAge.toFixed(1)}</p>
        <p>Names: ${group.names.join(', ')}</p>
      `;
      
      resultsContainer.appendChild(groupElement);
    });
  }
}

// Initialize the plugin
new DataProcessingPlugin();
```

This plugin demonstrates proper use of utilities by:
1. Using array utilities for filtering, grouping, and removing duplicates
2. Using string utilities for validation and formatting
3. Using number utilities for validation and clamping
4. Using date utilities for formatting
5. Handling errors gracefully
6. Combining multiple utilities for complex operations

For more information about the plugin SDK and available APIs, see the [Plugin SDK documentation](/docs/plugins/introduction).