import {
    EditorView,
    WidgetType,
    Decoration,
    DecorationSet
} from '@codemirror/view';
import {
    RangeSetBuilder,
    StateField,
    Prec,
    EditorState
} from '@codemirror/state';
import {
    App,
    TFile,
    editorLivePreviewField
} from 'obsidian';
import { EmbedTableRenderer } from './EmbedTableRenderer';

// Regex to find embeds: ![[link]]
const EMBED_REGEX = /!\[\[([^\[\]]+)\]\]/g;

class TableEmbedWidget extends WidgetType {
    constructor(
        private app: App,
        private file: TFile,
        private src: string
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const container = document.createElement('div');
        container.addClass('json-table-embed-container');
        // container.addClass('internal-embed'); // Remove this to avoid being hidden by our own CSS!
        container.setAttribute('src', this.src);

        // Prevent click/mousedown from propagating to the editor and moving the cursor
        // This prevents the table from disappearing (due to cursor entering the embed range)
        container.addEventListener('mousedown', (e) => {
            // Prevent the editor from getting focus/cursor placement
            e.preventDefault();
            e.stopPropagation();
        });

        // Render the table
        const renderer = new EmbedTableRenderer(container, this.app, this.file);

        // Trigger load manually since we are not in a standard Obsidian lifecycle
        renderer.load();

        return container;
    }

    eq(other: TableEmbedWidget): boolean {
        return other.file.path === this.file.path;
    }
}

const buildDecorations = (state: EditorState, app: App): DecorationSet => {
    // Only active in Live Preview
    if (!state.field(editorLivePreviewField)) {
        return Decoration.none;
    }

    const builder = new RangeSetBuilder<Decoration>();
    const text = state.doc.sliceString(0, state.doc.length);

    let match;
    EMBED_REGEX.lastIndex = 0; // Reset regex

    while ((match = EMBED_REGEX.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const linkText = match[1];

        // Parse link text to get path (handle aliases like [[path|alias]])
        const pipeIndex = linkText.indexOf('|');
        const path = pipeIndex >= 0 ? linkText.substring(0, pipeIndex) : linkText;

        // Get the file associated with this view (if possible)
        // Note: In StateField, we don't have easy access to the "active file" of the specific view 
        // if there are multiple views. But app.workspace.getActiveFile() is a reasonable fallback.
        const activeFile = app.workspace.getActiveFile();
        const sourcePath = activeFile ? activeFile.path : '';

        const file = app.metadataCache.getFirstLinkpathDest(path, sourcePath);

        if (file instanceof TFile && (file.name.endsWith('.table.json') || file.name.endsWith('.table.md'))) {
            // Check if the cursor is inside the range. If so, don't replace (allow editing).
            // We relax the check to (to < end) so that if the cursor is AT the end (where the widget is),
            // we still show the widget. This prevents the table from disappearing when interacting with it.
            const { from, to } = state.selection.main;
            if (from > start && to < end) {
                continue;
            }

            // Strategy: Render widget AFTER the embed link
            // The CSS will hide the original .internal-embed
            builder.add(
                end,
                end,
                Decoration.widget({
                    widget: new TableEmbedWidget(app, file, path),
                    side: 1,
                    block: true
                })
            );
        }
    }

    return builder.finish();
};

export const tableEmbedExtension = (app: App) => Prec.highest(StateField.define<DecorationSet>({
    create(state) {
        return buildDecorations(state, app);
    },
    update(oldState, transaction) {
        if (transaction.docChanged || transaction.selection) {
            return buildDecorations(transaction.state, app);
        }
        return oldState;
    },
    provide(field) {
        return EditorView.decorations.from(field);
    }
}));
