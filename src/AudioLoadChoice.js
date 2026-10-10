import React from 'react';
export default function AudioLoadChoice({stage,onMode,onFiles,onFolder,onClose}) {
 return <div className="audio-load-choice" role="group" aria-label="Carregar músicas">
  {stage==='mode'?<><button onClick={()=>onMode('append')}>ADICIONAR MAIS</button><button onClick={()=>onMode('replace')}>SUBSTITUIR TUDO</button></>
   :<><button onClick={onFiles}>MÚSICAS</button><button onClick={onFolder}>PASTA</button></>}
  <button onClick={onClose} aria-label="Cancelar seleção">×</button>
 </div>;
}
