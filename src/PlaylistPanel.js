import React from 'react';
export default function PlaylistPanel({playlist:p}){return <div className="stream-session"><section role="dialog" aria-modal="true" aria-label="Playlist local" className="stream-session-dialog playlist-panel">
 <h2>PLAYER LOCAL</h2><p title={p.name}>{p.length? (p.index+1)+'/'+p.length+' · '+p.name:'Escolha músicas no aparelho'}</p>
 <div><button onClick={p.files}>ABRIR ÁUDIOS</button><button onClick={p.folder}>PASTA / ÁUDIOS</button></div>
 <div><button disabled={!p.length} onClick={p.previous}>◀ ANTERIOR</button><button disabled={!p.length} onClick={p.next}>PRÓXIMA ▶</button></div>
 <div><button aria-pressed={p.repeat} onClick={p.toggleRepeat}>REPETIR {p.repeat?'ON':'OFF'}</button><button aria-pressed={p.shuffle} onClick={p.toggleShuffle}>ALEATÓRIO {p.shuffle?'ON':'OFF'}</button></div>
 {p.message && <p role="status">{p.message}</p>}
 <p>Use PLAY / STOP e VOLTAR no painel.</p>
 </section></div>;}
