const SELECTOR='select[data-smart-search]';

function fold(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX').trim();
}

function enhance(select){
  if(select.dataset.smartReady==='1')return;
  select.dataset.smartReady='1';
  const wrap=document.createElement('div');
  wrap.className='tos-smart-select';
  const input=document.createElement('input');
  input.type='search';
  input.autocomplete='off';
  input.spellcheck=false;
  input.className='tos-smart-select-input';
  input.placeholder=select.dataset.searchPlaceholder||'Escribe para buscar';
  input.setAttribute('role','combobox');
  input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-expanded','false');
  input.setAttribute('aria-label',select.getAttribute('aria-label')||select.closest('label')?.childNodes?.[0]?.textContent?.trim()||'Buscar');
  const icon=document.createElement('span');
  icon.className='tos-icon tos-icon-search';
  icon.setAttribute('aria-hidden','true');
  const list=document.createElement('div');
  list.className='tos-smart-select-results hidden';
  list.setAttribute('role','listbox');
  const listId=`smart-${select.id||Math.random().toString(36).slice(2)}`;
  list.id=listId;
  input.setAttribute('aria-controls',listId);
  select.classList.add('tos-smart-select-native');
  select.insertAdjacentElement('afterend',wrap);
  wrap.append(icon,input,list);
  let active=-1;

  const options=()=>[...select.options].filter(option=>option.value&&!option.disabled);
  const selectedLabel=()=>select.selectedOptions[0]?.value?select.selectedOptions[0].textContent.trim():'';
  const close=()=>{list.classList.add('hidden');input.setAttribute('aria-expanded','false');active=-1;};
  const choose=option=>{
    select.value=option.value;
    input.value=option.textContent.trim();
    input.dataset.selectedValue=option.value;
    close();
    select.dispatchEvent(new Event('input',{bubbles:true}));
    select.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const render=()=>{
    const query=fold(input.value);
    const matches=options().filter(option=>!query||fold(`${option.textContent} ${option.dataset.search||''}`).includes(query)).slice(0,40);
    list.innerHTML='';
    active=-1;
    if(!matches.length){
      const empty=document.createElement('div');
      empty.className='tos-smart-select-empty';
      empty.textContent='No encontramos a ese Tanner.';
      list.append(empty);
    }else matches.forEach(option=>{
      const button=document.createElement('button');
      button.type='button';
      button.setAttribute('role','option');
      button.dataset.value=option.value;
      const personIcon=document.createElement('span');
      personIcon.className='tos-icon tos-icon-user';
      personIcon.setAttribute('aria-hidden','true');
      const label=document.createElement('span');
      label.textContent=option.textContent.trim();
      button.append(personIcon,label);
      button.addEventListener('pointerdown',event=>{event.preventDefault();choose(option);});
      button.addEventListener('click',()=>{if(select.value!==option.value)choose(option);});
      list.append(button);
    });
    list.classList.remove('hidden');
    input.setAttribute('aria-expanded','true');
  };
  const move=direction=>{
    const rows=[...list.querySelectorAll('button')];
    if(!rows.length)return;
    active=(active+direction+rows.length)%rows.length;
    rows.forEach((row,index)=>row.classList.toggle('active',index===active));
    rows[active].scrollIntoView({block:'nearest'});
  };
  const sync=()=>{
    input.disabled=select.disabled;
    input.required=select.required;
    if(document.activeElement!==input||select.value)input.value=selectedLabel();
    input.dataset.selectedValue=select.value;
  };
  input.addEventListener('focus',()=>{if(input.dataset.selectedValue!==select.value)sync();input.select();render();});
  input.addEventListener('input',()=>{if(input.dataset.selectedValue){select.value='';input.dataset.selectedValue='';}render();});
  input.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'){event.preventDefault();if(list.classList.contains('hidden'))render();move(1);}
    else if(event.key==='ArrowUp'){event.preventDefault();move(-1);}
    else if(event.key==='Enter'&&active>=0){event.preventDefault();list.querySelectorAll('button')[active]?.click();}
    else if(event.key==='Escape'){event.preventDefault();close();}
  });
  input.addEventListener('blur',()=>setTimeout(()=>{if(!select.value)input.value='';else input.value=selectedLabel();close();},120));
  select.addEventListener('change',sync);
  select.form?.addEventListener('reset',()=>setTimeout(sync,0));
  select.addEventListener('invalid',event=>{event.preventDefault();input.focus();input.setCustomValidity('Selecciona un Tanner.');setTimeout(()=>input.setCustomValidity(''),0);});
  new MutationObserver(sync).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','required']});
  sync();
}

function scan(root=document){
  if(root.matches?.(SELECTOR))enhance(root);
  root.querySelectorAll?.(SELECTOR).forEach(enhance);
}

scan();
new MutationObserver(mutations=>mutations.forEach(mutation=>mutation.addedNodes.forEach(node=>{if(node.nodeType===Node.ELEMENT_NODE)scan(node);}))).observe(document.documentElement,{childList:true,subtree:true});
