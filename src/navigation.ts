import type {Action} from './model.ts';

export function isNavigationUrl(url:string):boolean {
  const normalized=url.replace(/[\u0000-\u0020]/g,'');
  const scheme=/^([a-z][a-z\d+.-]*):/i.exec(normalized)?.[1]?.toLowerCase();
  return !scheme||['http','https','mailto','tel'].includes(scheme)||normalized==='about:blank';
}

/** Navigation uses browser windows and named frames; prototype script URLs are not evaluated. */
export function navigate(action:Action,url:string,win:Window=window):void {
  if(!url||!isNavigationUrl(url))return;
  switch(action.navigation){
    case 'new':win.open(url,'_blank');break;
    case 'popup':win.open(url,'_blank',action.windowFeatures||'popup');break;
    case 'parent':win.parent.location.href=url;break;
    case 'frame':if(action.target)win.open(url,action.target);break;
    case 'parent-frame':if(action.target)win.parent.open(url,action.target);break;
    default:win.location.href=url;
  }
}
