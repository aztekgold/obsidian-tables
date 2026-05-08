import { AbstractLinkRenderer } from './AbstractLinkRenderer';

const IS_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailRenderer extends AbstractLinkRenderer {
  protected buildLink(displayEl: HTMLElement, val: string): void {
    if (IS_EMAIL.test(val)) {
      const link = displayEl.createEl('a', {
        text: val,
        cls: 'json-table-url-link',
        attr: { href: `mailto:${val}` },
      });
      link.addEventListener('click', (e) => e.stopPropagation());
    } else {
      displayEl.createEl('span', { text: val });
    }
  }
}
