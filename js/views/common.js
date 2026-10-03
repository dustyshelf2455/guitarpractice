// Shared page scaffolding for the secondary screens.

import { el, icon } from '../util.js';
import { iconButton } from './sheets.js';

/** A page with a sticky header and a back button that returns to `parent`. */
export function page(ctx, { title, parent = '#/', actions = [] }, ...children) {
  const head = el('header', { class: 'page-head' },
    iconButton('back', 'Back', () => ctx.back(parent)),
    el('h1', { class: 'page-title', text: title }),
    ...actions,
  );
  return el('div', { class: 'screen page' }, head, el('main', {}, children));
}

export function section(title, ...children) {
  return el('section', { class: 'section' },
    title ? el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: title })) : null,
    children,
  );
}

export function swatch(color) {
  return el('span', { class: 'swatch', dataset: { color: color == null ? 'none' : String(color) }, 'aria-hidden': 'true' });
}

/** A tappable row that navigates. */
export function linkRow(ctx, hash, title, sub, extra = null) {
  return el('a', { class: 'row row-link', href: hash, dataset: { key: hash } },
    el('span', { class: 'row-main' },
      el('span', { class: 'row-title' }, title),
      sub ? el('span', { class: 'row-sub' }, sub) : null,
    ),
    extra,
    icon('chevron', 'chev'),
  );
}

export function emptyState(title, text) {
  return el('div', { class: 'empty' }, el('strong', { text: title }), text ? el('span', { text }) : null);
}
