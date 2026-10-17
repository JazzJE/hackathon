const {PROVIDERS} = require('./agent');
function createSettings(env = {}, platform = process.platform) {
  const provider = Object.hasOwn(PROVIDERS,env.DOODLE_PROVIDER || '') ? env.DOODLE_PROVIDER : env.GEMINI_API_KEY || env.GOOGLE_API_KEY ? 'gemini' : env.OPENAI_API_KEY ? 'openai' : 'gemini';
  const state = {provider,shell:false,install:false,providers:{
    gemini:{key:env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '',model:PROVIDERS.gemini.model},
    openai:{key:env.OPENAI_API_KEY || '',model:PROVIDERS.openai.model}
  }};
  Object.defineProperties(state,{
    key:{get(){return this.providers[this.provider].key;},set(value){this.providers[this.provider].key = value;}},
    model:{get(){return this.providers[this.provider].model;},set(value){this.providers[this.provider].model = value;}}
  });
  return state;
}
function updateSettings(state,args = {},platform = process.platform) {
  const provider = args.provider ?? state.provider;
  if (!Object.hasOwn(PROVIDERS,provider)) throw Error('Choose Google Gemini or OpenAI.');
  const model = args.model?.trim() || state.providers[provider].model;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)) throw Error('Enter a valid model ID.');
  const key = typeof args.key === 'string' ? args.key.trim() : '';
  if (key.length > 1000 || /[\r\n]/.test(key)) throw Error('Paste one API key without line breaks.');
  state.provider = provider;
  state.model = model;
  if (args.forgetKey) state.key = '';
  else if (key) state.key = key;
  if (args.shell !== undefined) state.shell = platform === 'win32' && args.shell === true;
  if (args.install !== undefined) state.install = platform === 'win32' && args.install === true;
}
function publicSettings(state) {
  return {provider:state.provider,model:state.model,hasKey:!!state.key,shell:state.shell,install:state.install,
    providers:Object.fromEntries(Object.entries(state.providers).map(([id,value])=>[id,{hasKey:!!value.key,model:value.model}]))};
}
module.exports = {createSettings,updateSettings,publicSettings};
