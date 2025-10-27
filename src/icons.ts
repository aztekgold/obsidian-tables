// src/icons.ts
import { setIcon } from 'obsidian';

/**
 * Icon name mappings to Lucide icon IDs used by Obsidian
 * See: https://docs.obsidian.md/Plugins/User+interface/Icons
 */
export const ICON_NAMES = {
  sort: 'arrow-up-down',
  filter: 'filter',
  text: 'case-sensitive',
  dropdown: 'circle-chevron-down',
  multiselect: 'list',
  checkbox: 'check-square',
  date: 'calendar',
  link: 'link',
  plus: 'plus',
  moreVertical: 'more-vertical',
  trash: 'trash-2',
  gripVertical: 'grip-vertical',
  table: 'table',
} as const;

/**
 * Creates an icon element using Obsidian's setIcon utility
 * @param iconName The Lucide icon name (e.g., 'plus', 'trash-2')
 * @param size Optional size (default 16)
 * @param className Optional additional CSS class name
 * @returns An HTMLElement with the icon
 */
export function createIconElement(iconName: string, size: number = 16, className?: string): HTMLElement {
  const iconContainer = document.createElement('span');
  iconContainer.classList.add('json-table-icon');
  
  if (className) {
    iconContainer.classList.add(className);
  }
  
  // Set the icon using Obsidian's utility (only takes 2 params)
  setIcon(iconContainer, iconName);
  
  // Always set custom size to ensure consistency
  const svg = iconContainer.querySelector('svg');
  if (svg) {
    svg.setAttribute('width', size.toString());
    svg.setAttribute('height', size.toString());
    // Also set stroke width for better appearance at smaller sizes
    svg.setAttribute('stroke-width', '2');
  }
  
  return iconContainer;
}