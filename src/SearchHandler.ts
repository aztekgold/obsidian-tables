import { AgentableRow, ColumnDef } from './types';

/**
 * Ephemeral, per-instance free-text search that filters rows client-side.
 * Unlike FilterHandler/SortHandler, the query is intentionally not persisted
 * to the table's saved data - it's a transient view-only filter, reset when
 * the note is closed and reopened.
 */
export class SearchHandler {
  private query = '';

  public getQuery(): string {
    return this.query;
  }

  public setQuery(query: string): void {
    this.query = query;
  }

  public hasActiveSearch(): boolean {
    return this.query.trim().length > 0;
  }

  public getSearchedRows(rows: AgentableRow[], columns: ColumnDef[]): AgentableRow[] {
    const query = this.query.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter(row =>
      columns.some(col => {
        const cellValue = row.cells[col.id];
        return cellValue != null && String(cellValue).toLowerCase().includes(query);
      })
    );
  }
}
