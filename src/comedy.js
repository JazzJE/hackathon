const TOPICS=['money','love','school','work','gym','coffee','food','cat','music','car','computer','chaos'];
const JOKES={
  money:{emoji:'💸',title:'Your tuition is now a dog with a market cap.',line:'Diversifying from broke into volatile.',url:'https://coinmarketcap.com/view/memes/'},
  love:{emoji:'💔',title:'Your crush is typing…',line:'Never mind. That was the group chat.',query:'how to recover from being left on read'},
  school:{emoji:'🎓',title:'Academic weapon. On safety.',line:'Your degree in procrastination is ready.',query:'how to learn an entire semester in 20 minutes'},
  work:{emoji:'💼',title:'Rejected before you applied.',line:'Entry level. Requires 12 years of being 22.',query:'jobs no experience no skills high salary'},
  gym:{emoji:'🛋️',title:'Welcome to Planet Sit-ness.',line:'Your rest day streak is getting competitive.',query:'workout lying down doing nothing',youtube:true},
  coffee:{emoji:'☕',title:'Your blood is a cold brew.',line:'Prescribing one nap. Insurance denied it.',query:'10 hours relaxing sleep sounds',youtube:true},
  food:{emoji:'🍜',title:'MICHELIN STARVED.',line:'Tonight’s special: tap water and a nap.',query:'recipes when there is literally nothing in the fridge'},
  cat:{emoji:'🐈',title:'Finally. A useful command.',line:'The internet was built for this exact moment.',query:'cat images',images:true},
  music:{emoji:'🎻',title:'Your life needs a soundtrack.',line:'Unfortunately, the budget was one tiny violin.',query:'worlds smallest violin sad sound',youtube:true},
  car:{emoji:'🚗',title:'That sound costs $900.',line:'The check engine light is a subscription now.',query:'why does my car sound expensive'},
  computer:{emoji:'💻',title:'Installing motivation… 1%',line:'Error 404: effort not found.',query:'have you tried turning it off and on again'},
  chaos:{emoji:'🌱',title:'Emergency grass intervention.',line:'Your screen time report called your parents.',query:'how to touch grass tutorial'}
};
function comedyPlan(topic){
  const joke=JOKES[topic]||JOKES.chaos;
  const url=joke.url||(joke.youtube?`https://www.youtube.com/results?search_query=${encodeURIComponent(joke.query)}`:`https://www.google.com/search?${joke.images?'tbm=isch&':''}q=${encodeURIComponent(joke.query)}`);
  return {title:joke.title,explanation:joke.line,confidence:1,comedy:true,topic:Object.hasOwn(JOKES,topic)?topic:'chaos',quick:true,actions:[{type:'open_url',value:url}]};
}
function topicFromHint(hint){
  const text=String(hint||'').toLowerCase();
  const words={money:/\b(money|cash|dollar|rich|billionaire|rent|bank|coin)\b|\$/,love:/\b(heart|love|crush|date|dating)\b/,school:/\b(book|school|exam|study|homework|college|degree)\b/,work:/\b(job|work|resume|career|briefcase)\b/,gym:/\b(gym|weight|dumbbell|muscle|workout)\b/,coffee:/\b(coffee|caffeine|espresso|cup)\b/,food:/\b(food|pizza|burger|noodle|hungry)\b/,cat:/\b(cat|kitten|meow)\b/,music:/\b(music|song|spotify|guitar|headphone|note)\b/,car:/\b(car|truck|drive|engine)\b/,computer:/\b(computer|laptop|keyboard|monitor)\b/};
  return Object.keys(words).find(topic=>words[topic].test(text))||null;
}
module.exports={TOPICS,JOKES,comedyPlan,topicFromHint};
