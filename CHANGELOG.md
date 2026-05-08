# Changelog

## 1.4.0 (2026-05-08)

### New Features

- **Schema Re-Write - Agentable V1.0:** Tables now use the Agentable V1.0 schema, making data accessible to AI agents and external tooling without bespoke adapters. I have seperated the schema and table manager tools into their own repo as I plan to use across multiple projects and wanted to detail the schema and add tooling, in order to make the format more robust and assit in agentic workflows. The Schema now uses a more simplified json schema lowering file sizes and token ingestion count. Agentable V1.0 Introduces a collision-resistant Base36 row ID strategy that is natively sortable by date - TTTTTTTTTRRR (9 Time + 3 Random). Existing tables are automatically migrated in-memory on first open and persisted on next save — no manual action required and I will ensure a maintained upgrade path as the schema evolves. 

- **Embed View Selection:** Obsidian Tables now allows the standard Obsidian alias syntax to pin an embed to a specific view, or create a new one on the fly:
  - `![[MyTable.table.md|Sprint Board]]`: if a view named "Sprint Board" exists, the embed renders that view; if it does not exist, the view is created automatically and saved to the file.
  - Omitting the alias (`![[MyTable.table.md]]`) renders the table's default (first) view.
  - When specifying a view, the header is removed and the view is pinned. The embed header displays the table name and, when a view is pinned, the view name separated by a `›` chevron.

- **URL Column Type:** New `url` column type renders values as clickable external links when the content matches a URL pattern. Falls back to plain text otherwise. Editable inline like a standard text cell.

- **Email Column Type:** New `email` column type renders values as `mailto:` links when the content matches an email address pattern. Falls back to plain text otherwise. Editable inline.

### Improvements

- **Context Menus:** All column and row context menus migrated to Obsidian's native Bases-style panel UI for a consistent look and feel.
- **Dropdown & Multi-select:** Options now support custom colours and can be renamed directly from the column menu. alongside addition from the cell context menu.
- **File Handling:** Improved file rename and delete detection to reliably update linked note references across tables.
- **Live Preview Embeds:** Embedded tables in live preview are now fully interactive, with a title header and improved layout.
- **Row Drag Handle:** Drag handle icon resized and refined; add row button updated to match Obsidian UI conventions.
- **CSS:** Moved all inline styles to CSS classes to reduce runtime overhead and prevent conflicts with other plugins.
- **Settings:** Removed the legacy HTML table renderer option — the default renderer is now the only renderer.

### Bug Fixes
- Fixed filter rules not persisting correctly edits to operator or value were saved one interaction behind due to in-memory reference invalidation.
- Fixed live preview errors caused by incorrect TypeScript output configuration.
- Fixed embedded and inline tables not rendering correctly after the renderer consolidation.
- Fixed column drag handle losing its placeholder position during reorder.
- Fixed popup positioning when the table is near the edge of the viewport.
- Fixed a race condition when creating new table files.

---

## 1.3.0 (2026-02-15)

### Features
- **Mobile Support:** Enabled mobile usage (`isDesktopOnly: false`).
- **Sticky Action Column:** The action column (add/delete row buttons) can now be made sticky, ensuring it remains visible when scrolling horizontally. This can be toggled in settings.
- **Delete Option:** Added a "Delete Option" button to the column editor for Dropdown/Multi-select columns, allowing removal of options.
- **Row Reordering:** Renamed "Beta Features" setting to "Enable Row Reordering" for clarity.

### Improvements
- **Settings:** Reorganized plugin settings for better usability, moving key settings like "Sticky Action Column" to the core section.
- **UI:** Improved text input vertical alignment in cells.
- **UI:** Fixed transparent background issues on sticky columns.

### Fixes
- Fixed file opening logic for `.table.md` files.
- Fixed cell padding and text alignment regressions.
