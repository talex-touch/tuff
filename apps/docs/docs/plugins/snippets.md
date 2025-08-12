# Code Snippets (Plugins)

Code snippets are predefined pieces of code that can be quickly inserted into your documents. The `Tuff` provides a powerful snippet system that allows plugins to define, manage, and insert code snippets.

## What are Snippets?

Snippets are templates of code that can be inserted into your document with a simple trigger. They can include placeholders for dynamic content and can significantly speed up your coding workflow.

## Using Snippets

### Inserting a Snippet

To insert a snippet, you can either:

1. Type the snippet prefix and press `Tab` (or your configured expansion key)
2. Use the snippet picker from the command palette (`Ctrl+Shift+P` and search for "Insert Snippet")

### Example Snippet

Here's an example of a simple snippet for a JavaScript function:

::: code-group

```javascript [Simple Snippet Example]
function ${1:functionName}(${2:params}) {
  ${3:// Your code here}
}
```

:::

In this snippet:
- `${1:functionName}` is a placeholder that will be highlighted first when the snippet is inserted
- `${2:params}` is the second placeholder
- `${3:// Your code here}` is the third placeholder
- The numbers indicate the tab order

## Creating Snippets in Plugins

Plugins can define their own snippets that will be available to users when working with files associated with that plugin.

### Snippet Definition Format

Snippets are defined in JSON format. Here's the basic structure:

::: code-group

```json [Snippet Definition Format]
{
  "snippet-name": {
    "prefix": "trigger-word",
    "body": [
      "line 1 of snippet",
      "line 2 of snippet"
    ],
    "description": "Description of what this snippet does"
  }
}
```

:::

### Example Snippet Definition

Here's a complete example of a snippet definition for a plugin that works with HTML files:

::: code-group

```json [HTML Snippet Example]
{
  "html-div": {
    "prefix": "div",
    "body": [
      "<div class=\"${1:class-name}\">",
      "  ${2:<!-- Content -->}",
      "</div>"
    ],
    "description": "Creates an HTML div element with a class"
  },
  "html-link": {
    "prefix": "link",
    "body": [
      "<a href=\"${1:url}\">${2:link text}</a>"
    ],
    "description": "Creates an HTML anchor element"
  }
}
```

:::

### Registering Snippets

To register snippets in your plugin, use the `snippets` API provided by the plugin SDK:

::: code-group

```javascript [Registering Snippets]
// In your plugin's main file
import { snippets } from '@polyglot-toolbox/plugin-sdk';

// Define your snippets
const mySnippets = {
  "log-message": {
    "prefix": "log",
    "body": [
      "console.log('${1:message}');"
    ],
    "description": "Insert a console.log statement"
  },
  "function-arrow": {
    "prefix": "afn",
    "body": [
      "const ${1:functionName} = (${2:params}) => {",
      "  ${3:// function body}",
      "};"
    ],
    "description": "Create an arrow function"
  }
};

// Register the snippets
snippets.register('my-plugin-snippets', mySnippets);
```

:::

## Advanced Snippet Features

The snippet system supports several advanced features to make your snippets more powerful.

### Placeholders with Defaults

You can provide default values for placeholders:

::: code-group

```json [Placeholders with Defaults]
{
  "greeting": {
    "prefix": "greet",
    "body": [
      "Hello, ${1:name:World}!"
    ],
    "description": "A greeting with a default name"
  }
}
```

:::

In this example, if the user doesn't change the placeholder, it will default to "World".

### Choice Placeholders

Placeholders can offer a choice of values:

::: code-group

```json [Choice Placeholders]
{
  "element": {
    "prefix": "elem",
    "body": [
      "<${1|div,span,p,a|} class=\"${2:class-name}\">",
      "  ${3:<!-- Content -->}",
      "</${1}>"
    ],
    "description": "Create an HTML element with a choice of tags"
  }
}
```

:::

### Variables

Snippets can include variables that are automatically replaced with dynamic content:

::: code-group

```json [Variables]
{
  "current-date": {
    "prefix": "date",
    "body": [
      "Today is ${CURRENT_DATE}/${CURRENT_MONTH}/${CURRENT_YEAR}"
    ],
    "description": "Insert the current date"
  }
}
```

:::

Available variables include:
- `CURRENT_DATE`: The current date (e.g., 01)
- `CURRENT_MONTH`: The current month (e.g., 01)
- `CURRENT_YEAR`: The current year (e.g., 2023)
- `CURRENT_HOUR`: The current hour (e.g., 14)
- `CURRENT_MINUTE`: The current minute (e.g., 30)
- `CURRENT_SECOND`: The current second (e.g., 45)
- `TM_FILENAME`: The name of the current file
- `TM_FILENAME_BASE`: The name of the current file without extension
- `TM_DIRECTORY`: The directory of the current file
- `TM_LINE_INDEX`: The zero-indexed line number
- `TM_LINE_NUMBER`: The one-indexed line number
- `TM_SELECTED_TEXT`: The currently selected text

### Transformations

Placeholders can include transformations to modify the text:

::: code-group

```json [Transformations]
{
  "uppercase": {
    "prefix": "upcase",
    "body": [
      "${1:text/(.*)/${1:/upcase}/}"
    ],
    "description": "Transform text to uppercase"
  }
}
```

:::

### Mirroring

You can mirror the content of one placeholder to another:

::: code-group

```json [Mirroring]
{
  "tag-pair": {
    "prefix": "tag",
    "body": [
      "<${1:div}>",
      "  $2",
      "</${1}>"
    ],
    "description": "Create a tag pair with mirrored closing tag"
  }
}
```

:::

In this example, whatever you type in the first placeholder will be mirrored in the closing tag.

## Managing Snippets

### Listing Registered Snippets

You can list all registered snippets:

::: code-group

```javascript [Listing Registered Snippets]
import { snippets } from '@polyglot-toolbox/plugin-sdk';

// Get all snippets
const allSnippets = snippets.list();
console.log(allSnippets);

// Get snippets for a specific scope
const htmlSnippets = snippets.list('html');
console.log(htmlSnippets);
```

:::

### Unregistering Snippets

If you need to remove snippets:

::: code-group

```javascript [Unregistering Snippets]
import { snippets } from '@polyglot-toolbox/plugin-sdk';

// Unregister all snippets for your plugin
snippets.unregister('my-plugin-snippets');
```

:::

## Snippet Best Practices

When creating snippets for your plugin, consider the following best practices:

### 1. Use Descriptive Prefixes

Choose prefixes that are easy to remember and clearly indicate what the snippet does:

::: code-group

```json [Use Descriptive Prefixes]
// Good
{
  "console-log": {
    "prefix": "clog",
    "body": ["console.log($1);"]
  }
}

// Avoid
{
  "console-log": {
    "prefix": "cl",
    "body": ["console.log($1);"]
  }
}
```

:::

### 2. Provide Clear Descriptions

Always include a description that explains what the snippet does:

::: code-group

```json [Provide Clear Descriptions]
// Good
{
  "http-get-request": {
    "prefix": "httpget",
    "body": [
      "fetch('${1:url}')",
      "  .then(response => response.json())",
      "  .then(data => {",
      "    $2",
      "  })",
      "  .catch(error => {",
      "    console.error('Error:', error);",
      "  });"
    ],
    "description": "Create a basic HTTP GET request with fetch API"
  }
}
```

:::

### 3. Use Logical Tab Order

Arrange placeholders in a logical order that matches the natural flow of writing the code:

::: code-group

```json [Use Logical Tab Order]
// Good - Logical order
{
  "function-declaration": {
    "prefix": "fn",
    "body": [
      "function ${1:functionName}(${2:params}) {",
      "  ${3:// function body}",
      "}"
    ]
  }
}

// Avoid - Illogical order
{
  "function-declaration": {
    "prefix": "fn",
    "body": [
      "function ${3:functionName}(${1:params}) {",
      "  ${2:// function body}",
      "}"
    ]
  }
}
```

:::

### 4. Include Common Variations

Consider including multiple snippets for common variations of a pattern:

::: code-group

```json [Include Common Variations]
{
  "for-loop": {
    "prefix": "for",
    "body": [
      "for (let ${1:i} = 0; ${1} < ${2:array}.length; ${1}++) {",
      "  ${3:// loop body}",
      "}"
    ],
    "description": "Create a for loop"
  },
  "for-of-loop": {
    "prefix": "forof",
    "body": [
      "for (const ${1:item} of ${2:array}) {",
      "  ${3:// loop body}",
      "}"
    ],
    "description": "Create a for-of loop"
  }
}
```

:::

## Example: Language-Specific Snippet Plugin

Here's a complete example of a plugin that provides snippets for a specific programming language:

::: code-group

```javascript [Language-Specific Snippet Plugin Example]
// plugin.js
import { snippets } from '@polyglot-toolbox/plugin-sdk';

class PythonSnippetsPlugin {
  constructor() {
    this.registerSnippets();
  }
  
  registerSnippets() {
    const pythonSnippets = {
      "function-definition": {
        "prefix": "def",
        "body": [
          "def ${1:function_name}(${2:params}):",
          "    \"\"\"${3:Function description}\"\"\"",
          "    ${4:pass}"
        ],
        "description": "Create a Python function definition"
      },
      "class-definition": {
        "prefix": "class",
        "body": [
          "class ${1:ClassName}(${2:object}):",
          "    \"\"\"${3:Class description}\"\"\"",
          "",
          "    def __init__(self, ${4:params}):",
          "        ${5:super(${1:ClassName}, self).__init__()}"
        ],
        "description": "Create a Python class definition"
      },
      "if-statement": {
        "prefix": "if",
        "body": [
          "if ${1:condition}:",
          "    ${2:pass}"
        ],
        "description": "Create a Python if statement"
      },
      "for-loop": {
        "prefix": "for",
        "body": [
          "for ${1:item} in ${2:iterable}:",
          "    ${3:pass}"
        ],
        "description": "Create a Python for loop"
      },
      "try-except": {
        "prefix": "try",
        "body": [
          "try:",
          "    ${1:pass}",
          "except ${2:Exception} as ${3:e}:",
          "    ${4:pass}"
        ],
        "description": "Create a Python try-except block"
      }
    };
    
    // Register snippets for Python files
    snippets.register('python-snippets', pythonSnippets, ['python']);
    
    console.log('Python snippets registered');
  }
}

// Initialize the plugin
new PythonSnippetsPlugin();
```

:::

This plugin demonstrates how to:
1. Define multiple snippets for a specific language
2. Register snippets with a specific scope (Python)
3. Provide useful descriptions for each snippet
4. Use logical tab order in placeholders

For more information about the plugin SDK and available APIs, see the [Plugin SDK documentation](/docs/plugins/introduction).