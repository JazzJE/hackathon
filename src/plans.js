const {validate,supportedApps} = require('./agent');
function correctApp(plan,index,appId,platform,appCatalog) {
  if (!Number.isInteger(index) || index<0 || index>=plan.actions.length) throw Error('Choose an app action in the current plan.');
  if (!supportedApps(platform,appCatalog).includes(appId)) throw Error('Choose an app from your installed-app list.');
  const next=structuredClone(plan), action=next.actions[index];
  if (action.type==='open_app') action.value=appId;
  else if (action.type==='arrange_app') action.value=JSON.stringify({...JSON.parse(action.value),app:appId});
  else throw Error('Only app-launch and window-layout steps can change apps.');
  const name=appCatalog?.[appId]?.name || appId;
  next.title='Your corrected plan';
  next.explanation=`You chose ${name} for step ${index+1}. Review the updated actions below.`;
  next.correctedByUser=true;
  return validate(next,platform,appCatalog);
}
function captureFresh(frame,displays,now=Date.now()) {
  if (!frame) return;
  const display=displays.find(d=>d.id===frame.displayId);
  if (now-frame.createdAt>120000 || !display || ['x','y','width','height'].some(k=>display.bounds[k]!==frame.bounds[k])) throw Error('This desktop capture expired or the display changed. Open a fresh desktop canvas.');
}
module.exports={correctApp,captureFresh};
