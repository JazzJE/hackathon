const TOPICS=['money','love','school','work','gym','coffee','food','cat','music','car','computer'];
const JOKES={
  money:{emoji:'💸',title:'Your tuition has entered its crypto era.',line:'Diversifying from broke into volatile.',url:'https://crypto.com/'},
  love:{emoji:'💔',title:'Your crush is typing…',line:'Never mind. That was the group chat.',query:'how to recover from being left on read'},
  school:{emoji:'🎓',title:'Academic weapon. On safety.',line:'Your degree in procrastination is ready.',query:'how to learn an entire semester in 20 minutes'},
  work:{emoji:'💼',title:'Rejected before you applied.',line:'Entry level. Requires 12 years of being 22.',query:'jobs no experience no skills high salary'},
  gym:{emoji:'🛋️',title:'Welcome to Planet Sit-ness.',line:'Your rest day streak is getting competitive.',query:'workout lying down doing nothing',youtube:true},
  coffee:{emoji:'☕',title:'Your blood is a cold brew.',line:'Prescribing one nap. Insurance denied it.',query:'10 hours relaxing sleep sounds',youtube:true},
  food:{emoji:'🍜',title:'MICHELIN STARVED.',line:'Tonight’s special: tap water and a nap.',query:'recipes when there is literally nothing in the fridge'},
  cat:{emoji:'🐈',title:'Finally. A useful command.',line:'The internet was built for this exact moment.',query:'cat images',images:true},
  music:{emoji:'🎻',title:'Your life needs a soundtrack.',line:'Unfortunately, the budget was one tiny violin.',query:'worlds smallest violin sad sound',youtube:true},
  car:{emoji:'🚗',title:'That sound costs $900.',line:'The check engine light is a subscription now.',query:'why does my car sound expensive'},
  computer:{emoji:'💻',title:'Installing motivation… 1%',line:'Error 404: effort not found.',query:'have you tried turning it off and on again'}
};
function comedyPlan(topic){
  if(!Object.hasOwn(JOKES,topic))return drawingPlan(topic);
  const joke=JOKES[topic];
  const url=joke.url||(joke.youtube?`https://www.youtube.com/results?search_query=${encodeURIComponent(joke.query)}`:`https://www.google.com/search?${joke.images?'tbm=isch&':''}q=${encodeURIComponent(joke.query)}`);
  return {title:joke.title,explanation:joke.line,confidence:1,comedy:true,topic,quick:true,actions:[{type:'open_url',value:url}]};
}
function drawingPlan(description){
  const caption=String(description||'').trim().replace(/^the (image|drawing|picture) (shows|depicts|is of)\s+/i,'').replace(/[\r\n]+/g,' ').replace(/^['"]|['"]$/g,'').slice(0,130);
  if(!caption||/^(none|unknown|chaos|unclear|unrecognized|i (cannot|can't).*)[.!]?$/i.test(caption))throw Error('No drawing description was returned. Add a short hint and try again.');
  const topic=topicFromHint(caption);
  if(topic){
    const plan=comedyPlan(topic);
    if(topic!=='money'){
      const joke=JOKES[topic],query=`${caption} ${joke.query}`;
      plan.actions=[{type:'open_url',value:joke.youtube?`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`:`https://www.google.com/search?${joke.images?'tbm=isch&':''}q=${encodeURIComponent(query)}`}];
    }
    return {...plan,caption,explanation:`You drew ${caption}. ${plan.explanation}`};
  }
  return {title:`${caption.slice(0,65)} has entered the chat.`,explanation:`You drew ${caption}. The browser is making it everybody's problem.`,caption,confidence:1,comedy:true,topic:'custom',quick:true,actions:[{type:'open_url',value:`https://www.google.com/search?q=${encodeURIComponent(caption+' meme')}`}]};
}
function topicFromHint(hint){
  const text=String(hint||'').toLowerCase();
  const words={money:/\b(money|cash|dollar|rich|billionaire|rent|bank|coin)\b|\$/,love:/\b(heart|love|crush|date|dating)\b/,school:/\b(book|school|exam|study|homework|college|degree)\b/,work:/\b(job|work|resume|career|briefcase)\b/,gym:/\b(gym|weight|dumbbell|muscle|workout)\b/,coffee:/\b(coffee|caffeine|espresso|cup)\b/,food:/\b(food|pizza|burger|noodle|hungry)\b/,cat:/\b(cat|kitten|meow)\b/,music:/\b(music|song|spotify|guitar|headphone|note)\b/,car:/\b(car|truck|drive|engine)\b/,computer:/\b(computer|laptop|keyboard|monitor)\b/};
  return Object.keys(words).find(topic=>words[topic].test(text))||null;
}
module.exports={TOPICS,JOKES,comedyPlan,drawingPlan,topicFromHint};
