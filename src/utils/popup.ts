/**
 * Positions a popup element relative to an anchor element, ensuring it stays within window bounds.
 * @param popup The popup element to position
 * @param anchor The anchor element (button) to position relative to
 * @param options Configuration options
 */
export function positionPopup(
    popup: HTMLElement,
    anchor: HTMLElement,
    options: { align?: 'left' | 'right' | 'auto'; gap?: number } = {}
) {
    let { align = 'left', gap = 5 } = options;
    const anchorRect = anchor.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect(); // Note: popup must be in DOM to get dimensions

    // Auto-alignment logic
    if (align === 'auto') {
        // If anchor is on the right half of the screen, align right. Otherwise left.
        align = anchorRect.left > window.innerWidth / 2 ? 'right' : 'left';
    }

    let top = anchorRect.bottom + gap;
    let left = align === 'right'
        ? anchorRect.right - popupRect.width
        : anchorRect.left;

    // 1. Vertical Collision (Bottom)
    if (top + popupRect.height > window.innerHeight) {
        // Flip to top if it fits, otherwise keep at bottom but shift up?
        // Usually flipping is better if there's space above
        const spaceAbove = anchorRect.top;
        if (spaceAbove > popupRect.height + gap) {
            top = anchorRect.top - popupRect.height - gap;
        } else {
            // If it doesn't fit above either, just clamp to bottom edge
            top = window.innerHeight - popupRect.height - gap;
        }
    }

    // 2. Horizontal Collision (Right)
    if (left + popupRect.width > window.innerWidth) {
        left = window.innerWidth - popupRect.width - gap;
    }

    // 3. Horizontal Collision (Left)
    if (left < gap) {
        left = gap;
    }

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
}
