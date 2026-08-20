const params=new URLSearchParams(location.search),player=params.get('player'),action=params.get('action');
if(player){
  const apply=()=>{
    const primary=document.getElementById('playerSelect');if(!primary||![...primary.options].some(o=>o.value===player))return false;
    primary.value=player;primary.dispatchEvent(new Event('change',{bubbles:true}));
    ['statPlayer','evalPlayer','notePlayer'].forEach(id=>{const s=document.getElementById(id);if(s&&[...s.options].some(o=>o.value===player))s.value=player;});
    if(action==='evaluar')document.getElementById('evaluationPanel')?.scrollIntoView({behavior:'smooth',block:'start'});else document.querySelector('.player-focus')?.scrollIntoView({behavior:'smooth',block:'start'});
    return true;
  };
  if(!apply()){const observer=new MutationObserver(()=>{if(apply())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),7000);}
}
