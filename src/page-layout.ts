import type { Css, Page } from './model.ts';

/** Center the content bounds while preserving every authored widget coordinate. */
export function pageStyle(page: Pick<Page, 'width' | 'height' | 'alignment' | 'contentLeft'>): Css {
  const css: Css = {'--rp-page-width':`${page.width}px`,width: `${page.width}px`, height: `${page.height}px`};
  if (page.alignment === 'center') {
    const left = page.contentLeft ?? 0;
    Object.assign(css, {width: `${Math.max(0, page.width - left)}px`, left: `${-left}px`,
      'margin-left': 'auto', 'margin-right': 'auto', overflow: 'visible'});
  }
  return css;
}
