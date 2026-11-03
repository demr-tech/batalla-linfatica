/* Question libraries belong to this browser. Only a chosen room snapshot is sent to the game server. */
window.Banks=(()=>{
const key='batalla-question-banks-v1';let library=[],selected='',editing=-1,currentId='',back=null;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))library=saved.map(b=>validate(b,true))}catch{}
function validate(data,allowEmpty=false){
 if(!data||typeof data!=='object'||typeof data.name!=='string'||!data.name.trim()||data.name.length>80)throw Error('El banco necesita un nombre de hasta 80 caracteres.');
 if(!Array.isArray(data.questions)||data.questions.length>100||(!allowEmpty&&!data.questions.length))throw Error('Cada banco debe tener entre 1 y 100 preguntas.');
 const questions=data.questions.map(q=>{
  if(!q||typeof q.text!=='string'||!q.text.trim()||q.text.length>800)throw Error('Cada pregunta necesita texto de hasta 800 caracteres.');
  if(!Array.isArray(q.options)||q.options.length<2||q.options.length>4||q.options.some(o=>typeof o!=='string'||!o.trim()||o.length>200))throw Error('Cada pregunta necesita entre 2 y 4 opciones de hasta 200 caracteres.');
  const options=q.options.map(o=>o.trim());if(new Set(options.map(o=>o.toLowerCase())).size!==options.length)throw Error('Las opciones deben ser diferentes.');
  if(!Number.isInteger(q.correct)||q.correct<0||q.correct>=options.length)throw Error('Selecciona una respuesta correcta válida.');
  const explanation=q.explanation??'';if(typeof explanation!=='string'||explanation.length>1000)throw Error('La explicación admite hasta 1000 caracteres.');
  return {text:q.text.trim(),options,correct:q.correct,explanation:explanation.trim()};
 });
 const result={id:typeof data.id==='string'?data.id:crypto.randomUUID(),name:data.name.trim(),questions};
 if(new TextEncoder().encode(JSON.stringify(result)).length>200000)throw Error('El banco es demasiado grande. Divide las preguntas en varios bancos.');
 return result;
}
function save(next){if(next.length>20)throw Error('Puedes guardar hasta 20 bancos en este navegador.');try{localStorage.setItem(key,JSON.stringify(next));library=next}catch{throw Error('El navegador no pudo guardar el banco. Puede que no quede espacio o que el almacenamiento esté bloqueado.')}}
function bank(){return library.find(b=>b.id===currentId)}
function put(value){const next=library.map(b=>b.id===value.id?value:b);save(next)}
function alertError(error){const el=document.querySelector('#bank-message');if(el){el.textContent=error.message;el.className='bank-message error'}else toast(error.message)}
function payload(topic){if(!topic?.startsWith('custom:'))return null;const b=library.find(b=>b.id===topic.slice(7));if(!b)throw Error('Ese banco no está disponible en este navegador.');const v=validate(b);return {name:v.name,questions:v.questions}}
function configure(topic,count){
 if(!topic||!count)return;
 for(const b of library.filter(b=>b.questions.length)){const option=document.createElement('option');option.value='custom:'+b.id;option.textContent='📚 '+b.name+' · '+b.questions.length+' preguntas';topic.append(option)}
 if(selected&&library.some(b=>'custom:'+b.id===selected&&b.questions.length))topic.value=selected;
 const update=()=>{const custom=topic.value.startsWith('custom:')?library.find(b=>'custom:'+b.id===topic.value):null;const max=custom?custom.questions.length:{all:45,linfatico:30,snc:15}[topic.value];const previous=+count.value;const sizes=[...new Set([10,15,30,45,max].filter(n=>n<=max))].sort((a,b)=>a-b);count.innerHTML=sizes.map(n=>'<option value="'+n+'">'+(n===max?'Todas':n===10?'Sprint':'Batalla')+' · '+n+' preguntas</option>').join('');const desired=Math.min(previous||15,max);count.value=String(sizes.includes(desired)?desired:max)};
 topic.onchange=update;update();
}
function open(onBack){back=onBack;editing=-1;if(!bank())currentId=library[0]?.id||'';render()}
function render(){
 const b=bank();document.querySelector('#room-controls').hidden=true;
 document.querySelector('#app').innerHTML=`<div class="bank-heading"><div><div class="eyebrow">Tu propia arena de conocimiento</div><h2>Mis bancos de preguntas</h2></div><button type="button" class="secondary" id="banks-back">← Volver al juego</button></div><p>Se guardan solo en <strong>este navegador y dispositivo</strong>. Exporta una copia para conservarla o llevarla a otro teléfono. Cada banco admite hasta 100 preguntas.</p><div id="bank-message" class="bank-message" role="status"></div><div class="bank-layout"><aside class="card bank-library"><button type="button" class="primary" id="bank-new">＋ Nuevo banco</button><button type="button" class="secondary" id="bank-import">↑ Importar archivo JSON</button><input type="file" id="bank-file" accept=".json,application/json" hidden><div class="bank-list">${library.map(item=>`<button type="button" class="bank-pick ${item.id===currentId?'selected':''}" data-bank="${esc(item.id)}"><strong>${esc(item.name)}</strong><span>${item.questions.length} preguntas</span></button>`).join('')||'<p class="small">Todavía no tienes bancos. Crea el primero o importa uno que te hayan compartido.</p>'}</div></aside><section class="card bank-editor">${b?editor(b):'<div class="center"><div class="orb" style="margin:0 auto">📚</div><h2>Un banco, mil posibilidades</h2><p>Crea tus propias preguntas de cualquier materia y juega con tus compañeros.</p><button type="button" class="primary" id="bank-first">Crear mi primer banco →</button></div>'}</section></div>`;
 document.querySelector('#banks-back').onclick=()=>{if(!dirty()||confirm('Hay una pregunta sin guardar. ¿Quieres volver al juego y descartarla?'))back()};
 document.querySelector('#bank-new').onclick=newBank;document.querySelector('#bank-first')?.addEventListener('click',newBank);
 document.querySelector('#bank-import').onclick=()=>document.querySelector('#bank-file').click();document.querySelector('#bank-file').onchange=importFile;
 document.querySelectorAll('[data-bank]').forEach(button=>button.onclick=()=>{if(dirty()&&!confirm('Hay una pregunta sin guardar. ¿Quieres descartarla y abrir otro banco?'))return;currentId=button.dataset.bank;editing=-1;render()});
 if(!b)return;
 document.querySelector('#bank-name').onchange=()=>{try{const value=validate({...b,name:document.querySelector('#bank-name').value},true);put(value);b.name=value.name;document.querySelector('.bank-pick.selected strong').textContent=value.name}catch(e){alertError(e)}};
 document.querySelector('#question-form').onsubmit=e=>{e.preventDefault();saveQuestion()};
 document.querySelector('#bank-use').onclick=()=>{if(dirty()){alertError(Error('Guarda primero la pregunta que estás escribiendo.'));return}try{validate(bank());selected='custom:'+b.id;back()}catch(e){alertError(e)}};
 document.querySelector('#bank-export').onclick=exportBank;
 document.querySelector('#bank-delete').onclick=()=>{if(!confirm('¿Eliminar este banco de este navegador? Exporta una copia antes si quieres conservarlo.'))return;try{save(library.filter(item=>item.id!==b.id));currentId=library[0]?.id||'';editing=-1;render()}catch(e){alertError(e)}};
 document.querySelectorAll('[data-edit-question]').forEach(button=>button.onclick=()=>{if(dirty()&&!confirm('¿Descartar la pregunta sin guardar para editar otra?'))return;editing=+button.dataset.editQuestion;render();fillQuestion(bank().questions[editing])});
 document.querySelectorAll('[data-delete-question]').forEach(button=>button.onclick=()=>{if(!confirm('¿Eliminar esta pregunta del banco?'))return;try{put({...bank(),questions:bank().questions.filter((_,i)=>i!==+button.dataset.deleteQuestion)});editing=-1;render()}catch(e){alertError(e)}});
 document.querySelector('#cancel-edit')?.addEventListener('click',()=>{editing=-1;render()});
}
function editor(b){return `<label for="bank-name">Nombre del banco</label><input id="bank-name" maxlength="80" value="${esc(b.name)}" placeholder="Ej. Anatomía · Unidad 2"><div class="bank-actions"><button type="button" class="primary" id="bank-use" ${b.questions.length?'':'disabled'}>🎮 Jugar con este banco</button><button type="button" class="secondary" id="bank-export">↓ Exportar JSON</button><button type="button" class="secondary" id="bank-delete">Eliminar banco</button></div><h3>${editing<0?'Agregar una pregunta':'Editar pregunta '+(editing+1)}</h3><form id="question-form"><label for="question-text">Pregunta</label><textarea id="question-text" maxlength="800" rows="3" placeholder="Escribe tu pregunta o caso clínico…" required></textarea><div class="bank-options">${['A','B','C','D'].map((letter,i)=>`<label for="option-${i}">Opción ${letter}${i>1?' (opcional)':''}<input id="option-${i}" maxlength="200" ${i<2?'required':''} placeholder="Respuesta ${letter}"></label>`).join('')}</div><label for="question-correct">Respuesta correcta</label><select id="question-correct">${['A','B','C','D'].map((letter,i)=>`<option value="${i}">Opción ${letter}</option>`).join('')}</select><label for="question-explanation">Explicación (opcional)</label><textarea id="question-explanation" maxlength="1000" rows="2" placeholder="¿Por qué es correcta? Esta explicación aparecerá después de la ronda."></textarea><button class="primary" type="submit">${editing<0?'＋ Guardar pregunta':'Guardar cambios'}</button>${editing>=0?'<button type="button" class="secondary" id="cancel-edit">Cancelar edición</button>':''}</form><h3>Preguntas guardadas · ${b.questions.length} / 100</h3><div class="saved-questions">${b.questions.map((q,i)=>`<article class="saved-question"><strong>${i+1}. ${esc(q.text)}</strong><p class="small">✓ ${esc(q.options[q.correct])}</p><div><button type="button" class="secondary" data-edit-question="${i}">Editar</button><button type="button" class="secondary" data-delete-question="${i}">Eliminar</button></div></article>`).join('')||'<p class="small">Guarda una pregunta para poder jugar con este banco.</p>'}</div>`}
function newBank(){if(dirty()&&!confirm('¿Descartar la pregunta sin guardar y crear otro banco?'))return;try{const b={id:crypto.randomUUID(),name:'Mi banco '+(library.length+1),questions:[]};save([...library,b]);currentId=b.id;editing=-1;render();document.querySelector('#bank-name').focus()}catch(e){alertError(e)}}
function dirty(){return !!document.querySelector('#question-text')?.value.trim()}
function fillQuestion(q){document.querySelector('#question-text').value=q.text;[0,1,2,3].forEach(i=>document.querySelector('#option-'+i).value=q.options[i]||'');document.querySelector('#question-correct').value=String(q.correct);document.querySelector('#question-explanation').value=q.explanation}
function saveQuestion(){try{
 const b=bank(),raw=[0,1,2,3].map(i=>document.querySelector('#option-'+i).value.trim()),originalCorrect=+document.querySelector('#question-correct').value;
 if(!raw[originalCorrect])throw Error('La respuesta correcta debe corresponder a una opción que hayas escrito.');
 const options=raw.filter(Boolean),correct=raw.slice(0,originalCorrect).filter(Boolean).length;
 const q={text:document.querySelector('#question-text').value,options,correct,explanation:document.querySelector('#question-explanation').value};
 const questions=[...b.questions];if(editing<0)questions.push(q);else questions[editing]=q;
 put(validate({...b,name:document.querySelector('#bank-name').value,questions}));editing=-1;render();document.querySelector('#bank-message').textContent='✓ Pregunta guardada en este navegador.';
 }catch(e){alertError(e)}}
function exportBank(){try{const b=validate({...bank(),name:document.querySelector('#bank-name').value},true);put(b);const data=JSON.stringify({version:1,name:b.name,questions:b.questions},null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=(b.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'mi-banco')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){alertError(e)}}
async function importFile(event){try{const file=event.target.files[0];if(!file)return;if(file.size>250000)throw Error('El archivo admite como máximo 250 KB.');const data=JSON.parse(await file.text()),b=validate({...data,id:crypto.randomUUID()},true);save([...library,b]);currentId=b.id;editing=-1;render();document.querySelector('#bank-message').textContent='✓ Banco importado. Puedes editarlo o jugar.'}catch(e){alertError(e instanceof SyntaxError?Error('El archivo no tiene un formato JSON válido.'):e)}}
return {open,configure,payload};
})();
