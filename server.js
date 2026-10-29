const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const WebSocket=require('ws');
const PORT=Number(process.env.PORT)||3000;
const rooms=new Map();
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=pathname==='/'?'index.html':pathname.slice(1);
  if(pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}));return;}
  if(!['online.html','index.html'].includes(file)){res.writeHead(404);res.end('Not found');return;}
  fs.readFile(path.join(__dirname,file),(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(data);});
});
const wss=new WebSocket.Server({server,maxPayload:2048});
const send=(ws,obj)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));};
const broadcast=(room,obj,except)=>{for(const player of room.values())if(player.ws!==except)send(player.ws,obj);};
const leave=(ws)=>{if(!ws.room)return;const room=rooms.get(ws.room);if(room){room.delete(ws.id);broadcast(room,{type:'leave',id:ws.id});if(room.size===0)rooms.delete(ws.room);}ws.room=null;};
const cleanName=s=>String(s||'Гравець').slice(0,18).replace(/[<>]/g,'');
wss.on('connection',ws=>{
 ws.id=crypto.randomUUID();ws.room=null;ws.lastMove=0;
 send(ws,{type:'hello',id:ws.id});
 ws.on('message',raw=>{let m;try{m=JSON.parse(raw);}catch{return;}if(!m||typeof m!=='object')return;
  if(m.type==='join'){
   const code=String(m.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
   if(code.length!==6){send(ws,{type:'error',message:'Код має містити 6 символів'});return;}
   leave(ws);let room=rooms.get(code);if(!room){room=new Map();rooms.set(code,room);}
   if(room.size>=5){send(ws,{type:'error',message:'Кімната заповнена'});return;}
   const p={id:ws.id,name:cleanName(m.name),x:0,z:0,angle:0,ws};
   send(ws,{type:'joined',code,id:ws.id,players:[...room.values()].map(({id,name,x,z,angle})=>({id,name,x,z,angle}))});
   room.set(ws.id,p);ws.room=code;broadcast(room,{type:'enter',player:{id:p.id,name:p.name,x:0,z:0,angle:0}},ws);
  } else if(m.type==='move'&&ws.room){
   if(Date.now()-ws.lastMove<45)return;ws.lastMove=Date.now();
   const room=rooms.get(ws.room),p=room?.get(ws.id);if(!p)return;
   const x=Number(m.x),z=Number(m.z),angle=Number(m.angle);
   if(![x,z,angle].every(Number.isFinite))return;
   p.x=Math.max(-50,Math.min(50,x));p.z=Math.max(-50,Math.min(50,z));p.angle=angle%(Math.PI*2);
   broadcast(room,{type:'move',id:ws.id,x:p.x,z:p.z,angle:p.angle},ws);
  }
 });
 ws.on('close',()=>leave(ws));ws.on('error',()=>leave(ws));
});
server.listen(PORT,()=>console.log(`Project3D server on http://localhost:${PORT}`));
