// The only preset is the user's explicit money shortcut.
function moneyPlan(){return {title:'Open Dogecoin',explanation:'Opening crypto.com/us/price/dogecoin.',confidence:1,comedy:true,topic:'money',quick:true,actions:[{type:'open_url',value:'https://crypto.com/us/price/dogecoin'}]};}
function isMoneyHint(hint){return /^(?:\$|money|cash|dollars?|dogecoin|crypto)(?:[.!])?$/i.test(String(hint||'').trim());}
module.exports={moneyPlan,isMoneyHint};
