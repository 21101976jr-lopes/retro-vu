import React,{useEffect,useRef,useState} from 'react';
export default function RadioTrackName({name,onClick}){
 const box=useRef(null),text=useRef(null),[distance,setDistance]=useState(0);
 useEffect(()=>{
  const measure=()=>setDistance(Math.max(0,(text.current?.scrollWidth||0)-(box.current?.clientWidth||0)));
  measure();const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
  if(box.current)observer?.observe(box.current);
  window.addEventListener('resize',measure);
  return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
 },[name]);
 return <button ref={box} type="button" aria-label="Abrir controles do player" onClick={onClick} className="radio-track-name" title={name}>
  <span ref={text} className={distance>0?'radio-track-scroll':''} style={{'--track-shift':`-${distance}px`,'--track-duration':`${Math.max(6,distance/22)}s`}}>{name||'LOAD / ABRIR'}</span>
 </button>;
}
