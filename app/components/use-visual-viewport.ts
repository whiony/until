"use client";
import {useEffect} from 'react';
export function useVisualViewport(){useEffect(()=>{
 const viewport=window.visualViewport,root=document.documentElement;let baseline=viewport?.height||innerHeight,frame=0;const timers:ReturnType<typeof setTimeout>[]=[];
 const typing=()=>document.activeElement instanceof HTMLElement&&document.activeElement.matches('.editor input:not([type=file]):not([type=checkbox]),.editor textarea');
 const update=()=>{const height=viewport?.height||innerHeight;const focused=typing();if(!focused)baseline=Math.max(height,innerHeight);root.style.setProperty('--visible-height',`${height}px`);root.style.setProperty('--visible-top',`${viewport?.offsetTop||0}px`);root.classList.toggle('keyboard-open',!!focused&&Math.max(baseline,innerHeight)-height>100);cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const field=document.activeElement;if(!(field instanceof HTMLElement))return;const scroller=field.closest<HTMLElement>('.editor-fields');if(!scroller)return;const f=field.getBoundingClientRect(),s=scroller.getBoundingClientRect();if(f.bottom>s.bottom-16)scroller.scrollTop+=f.bottom-s.bottom+16;else if(f.top<s.top+16)scroller.scrollTop-=s.top-f.top+16;});};
 const focus=()=>{update();timers.push(setTimeout(update,120),setTimeout(update,350));};update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);document.addEventListener('focusin',focus);document.addEventListener('focusout',focus);
 return()=>{cancelAnimationFrame(frame);timers.forEach(clearTimeout);viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);document.removeEventListener('focusin',focus);document.removeEventListener('focusout',focus);root.classList.remove('keyboard-open');};
},[]);}
