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
import { JsonTableSettings } from './types';

// Regex to find embeds: ![[link]]
const EMBED_REGEX = /!\[\[([^[\]]+)\]\]/g;

class TableEmbedWidget extends WidgetType {
    constructor(
        private app: App,
        private file: TFile,
        private src: string,
        private settings: JsonTableSettings,
        private viewName: string | null
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const container = document.createElement('div');
        container.addClass('json-table-embed-container');
        container.setAttribute('src', this.src);

        container.addEventListener('mousedown', (e) => {
            const target = e.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.tagName === 'LABEL' ||
                target.isContentEditable ||
                target.closest('.json-table-div-cell')
            ) {
                e.stopPropagation();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
        });

        const renderer = new EmbedTableRenderer(container, this.app, this.file, this.settings, this.viewName);
        renderer.load();

        return container;
    }

    eq(other: TableEmbedWidget): boolean {
        return other.file.path === this.file.path && other.viewName === this.viewName;
    }
}

const buildDecorations = (state: EditorState, app: App, settings: JsonTableSettings): DecorationSet => {
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

        // Parse ![[filePath|viewName]] — the alias slot doubles as the view name
        const pipeIndex = linkText.indexOf('|');
        const filePath = pipeIndex >= 0 ? linkText.substring(0, pipeIndex).trim() : linkText.trim();
        const viewName = pipeIndex >= 0 ? linkText.substring(pipeIndex + 1).trim() || null : null;

        const activeFile = app.workspace.getActiveFile();
        const sourcePath = activeFile ? activeFile.path : '';

        const file = app.metadataCache.getFirstLinkpathDest(filePath, sourcePath);

        if (file instanceof TFile && (file.name.endsWith('.table.json') || file.name.endsWith('.table.md'))) {
            const { from, to } = state.selection.main;
            if (from > start && to < end) {
                continue;
            }

            builder.add(
                end,
                end,
                Decoration.widget({
                    widget: new TableEmbedWidget(app, file, filePath, settings, viewName),
                    side: 1,
                    block: true
                })
            );
        }
    }

    return builder.finish();
};

export const tableEmbedExtension = (app: App, settings: JsonTableSettings) => Prec.highest(StateField.define<DecorationSet>({
    create(state) {
        return buildDecorations(state, app, settings);
    },
    update(oldState, transaction) {
        if (transaction.docChanged || transaction.selection) {
            // Performance optimization: Check if document contains any embeds before building decorations
            const text = transaction.state.doc.sliceString(0, transaction.state.doc.length);
            if (!text.includes('![[')) {
                return Decoration.none;
            }
            return buildDecorations(transaction.state, app, settings);
        }
        return oldState;
    },
    provide(field) {
        return EditorView.decorations.from(field);
    }
}));
