import { AbstractLinkRenderer } from './AbstractLinkRenderer';

const IS_URL = /^https?:\/\/|^ftp:\/\/|^\/\//i;

export class UrlRenderer extends AbstractLinkRenderer {
  protected buildLink(displayEl: HTMLElement, val: string): void {
    if (IS_URL.test(val)) {
      const link = displayEl.createEl('a', {
        text: val,
        cls: 'json-table-url-link external-link',
        attr: { href: val },
      });
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(val, '_blank', 'noopener,noreferrer');
      });
    } else {
      displayEl.createEl('span', { text: val });
    }
  }
}
