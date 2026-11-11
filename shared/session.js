const serverURL='https://nova-face-id.nova-face-id.workers.dev';
const homePath='/face-id-voice/';
const panelPath=homePath+'panel';
const roomPath=location.hostname==='renzosaltamartini.github.io'?panelPath+'/room/':'/panel/room';
const validRoomPageId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{43}$/.test(id);
const roomUrl=id=>roomPath+(validRoomPageId(id)?'?page='+id:'');

const sessionKey='nova-session-v1';
const rememberedSessionKey='nova-remembered-session-v1';
function rememberedSession(){
  try{return localStorage.getItem(rememberedSessionKey)}catch{return null}
}
function setRememberedSession(token){
  try{
    if(token)localStorage.setItem(rememberedSessionKey,token);
    else localStorage.removeItem(rememberedSessionKey);
    return true;
  }catch{return false}
}

async function api(route,body){
  let result;
  try{
    result=await fetch(serverURL+route,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    });
  }catch{
    throw Error('No se pudo conectar con Renx. Revisá tu conexión.');
  }
  const data=await result.json().catch(()=>({}));
  if(!result.ok){
    const error=Error(data.error||'No se pudo completar la solicitud.');
    error.status=result.status;
    throw error;
  }
  return data;
}
