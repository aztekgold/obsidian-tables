# JSON Table Plugin for Obsidian

Create and manage interactive tables in Obsidian with support for multiple column types, sorting, filtering, and more.

## Features

### Multiple Column Types
- **Text** - Simple text input
- **Checkbox** - Boolean values
- **Dropdown** - Single selection from predefined options
- **Multi-select** - Multiple selections from predefined options
- **Note Link** - Link to other notes in your vault
- **Date** - Date picker with customizable format

### Table Management
- **Add/Delete Rows** - Easily add or remove data
- **Add/Delete Columns** - Flexible column management
- **Drag to Reorder Columns** - Intuitive column reordering
- **Resize Columns** - Adjust column widths to your needs
- **Rename Tables** - Quick inline table renaming

### Data Operations
- **Sort** - Sort by any column in ascending or descending order
- **Filter** - Filter rows based on column values with multiple filter rules
- **Persistent Scroll** - Maintains scroll position when editing

### File Formats
- `.table.json` - JSON-based table storage
- `.table.md` - Markdown files with frontmatter for table data

## Usage

### Creating a New Table

1. Create a new file with `.table.json` or `.table.md` extension
2. Open the file - it will automatically render as a table
3. Click "Add row" to start adding data
4. Use the "+" button in the header to add columns

### Editing Tables

- **Edit Cell Values**: Click on any cell to edit its value
- **Add Columns**: Click the "+" button in the table header
- **Delete Columns**: Click the "⋮" button on any column header
- **Reorder Columns**: Drag column headers to reorder
- **Add Rows**: Click "Add row" at the bottom of the table
- **Delete Rows**: Click the trash icon on any row

### Sorting and Filtering

- **Sort**: Click the "Sort" button to choose a column and direction
- **Filter**: Click the "Filter" button to add filter rules
- Multiple filters can be combined

### Column Types

When adding a column, you can choose from different types:

- **Text**: Basic text input
- **Checkbox**: Toggle between checked/unchecked
- **Dropdown**: Select one option from a predefined list
- **Multi-select**: Select multiple options from a predefined list
- **Note Link**: Link to another note in your vault
- **Date**: Pick a date using a date picker

For dropdown and multi-select columns, you can customize the available options and their colors when editing the column.

## Installation

### From Obsidian Community Plugins (Coming Soon)

1. Open Settings → Community plugins
2. Click "Browse" and search for "JSON Table"
3. Click "Install" then "Enable"

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/your-username/json-table-plugin/releases)
2. Extract the files to your vault's plugins folder: `<vault>/.obsidian/plugins/json-table-plugin/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community plugins

## Development

### Building the Plugin

```bash
# Install dependencies
npm install

# Build for development (watches for changes)
npm run dev

# Build for production
npm run build
```

## Support

If you encounter any issues or have suggestions, please [open an issue](https://github.com/your-username/json-table-plugin/issues) on GitHub.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

Created by [Your Name]

---

**Note**: This plugin stores table data in JSON format within your vault files. Always back up your data regularly.

