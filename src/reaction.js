window.doodle.reactionData().then(data=>{document.getElementById('emoji').textContent=data.emoji;document.getElementById('title').textContent=data.title;document.getElementById('line').textContent=data.line});
document.getElementById('close').onclick=()=>window.close();document.addEventListener('keydown',e=>{if(e.key==='Escape')window.close()});
