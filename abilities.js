/* WIXOSS 能力パーサ: 日本語本文 → 構造化された能力/効果 (ブラウザ: window.ABIL / node: module.exports) */
(function(root){
'use strict';
const num=v=>parseInt(String(v).replace(/[^\d-]/g,''),10)||0;
const COL='白赤青緑黒無';

// 括弧(「」『』())の外側だけで '。' 分割
function splitSentences(t){
  const out=[];let d=0,cur='';
  for(const c of t){
    if('「『(（'.includes(c))d++;else if('」』)）'.includes(c))d=Math.max(0,d-1);
    cur+=c;
    if(c==='。'&&d===0){out.push(cur.slice(0,-1));cur=''}
  }
  if(cur.trim())out.push(cur);
  return out.map(s=>s.trim()).filter(Boolean);
}

// 本文 → 段落(種別付き)。①②…の行は前の段落へ連結、(注釈)行は捨てる
function splitAbilities(text){
  const lines=String(text||'').split('<br>').map(s=>s.trim()).filter(Boolean),ps=[];
  for(const l of lines){
    if(/^[①②③④⑤]/.test(l)&&ps.length){ps[ps.length-1]+=l;continue}
    if(/^[(（]/.test(l))continue;
    ps.push(l);
  }
  return ps.map(classify);
}
function classify(p){
  let m;
  if(m=/^ベット―((?:《コインアイコン》)+)/.exec(p))return{kind:'ベット',cost:{coin:m[1].split('《コインアイコン》').length-1},body:'',raw:p};
  if(m=/^【ライフバースト】[：:]?(.*)$/.exec(p))return{kind:'LB',cost:{},body:m[1],raw:p};
  if(m=/^【(出|自|起|常)】((?:《[^》]*》)*)([^：]*)：(.*)$/.exec(p)){
    const a={kind:m[1],cost:parseCost(m[2],m[3]),body:m[4],raw:p};
    if(m[1]==='自'){const t=/^(.+?(?:とき|時))、(.+)$/.exec(m[4]);if(t){a.trigger=trigKey(t[1]);a.trigText=t[1];a.body=t[2]}}
    return a;
  }
  if(m=/^【(使用条件|ガード|チーム|絆常|ライズ|クラフト)】(.*)$/.exec(p))return{kind:m[1],cost:{},body:m[2],raw:p};
  return{kind:'効果',cost:{},body:p,raw:p};   // 接頭辞なし(スペル/アーツ本文)
}
const TRIG=[[/^このシグニがアタックしたとき$/,'self_attack'],[/^このルリグがアタックしたとき$/,'self_attack'],[/^あなたのアタックフェイズ開始時$/,'ap_start_me'],[/^各アタックフェイズ開始時$/,'ap_start_any'],
  [/^あなたのターン終了時$/,'end_me'],[/^ターン終了時$/,'end_any'],[/^このシグニがバニッシュされたとき$/,'self_banished'],[/^あなたのエナフェイズ開始時$/,'enaph_start_me']];
function trigKey(t){for(const[re,k]of TRIG)if(re.test(t))return k;return 'other'}
function parseCost(tokens,extra){
  const c={};let m;
  const re=/《([^》]*)》/g;
  while(m=re.exec(tokens)){
    const t=m[1];
    if(/^ターン(\d+)回$/.test(t))c.once='T'+RegExp.$1;
    else if(/^ゲーム(\d+)回$/.test(t))c.once='G'+RegExp.$1;
    else if(t==='ダウン')c.down=1;
    else if(t==='コインアイコン')c.coin=(c.coin||0)+1;
    else if(t==='自分ターン'||t==='相手ターン')c.turn=t;
    else{const e=/^(.)×(\d+)$/.exec(t);if(e&&COL.includes(e[1])){c.ener=c.ener||{};c.ener[e[1]]=(c.ener[e[1]]||0)+num(e[2])}else if(COL.includes(t)){c.ener=c.ener||{};c.ener[t]=(c.ener[t]||0)+1}else c.other=(c.other||'')+t}
  }
  if(extra&&extra.trim())c.text=extra.trim();   // 「手札を1枚捨てる」等の追加コスト
  return c;
}

// 対象句 → セレクタ
function parseTarget(str){
  let t=str.trim(),m;const r={who:null,zone:'field',type:null,f:[],n:1,upTo:false,all:false};
  if(t.startsWith('対戦相手の')){r.who='opp';t=t.slice(5)}else if(t.startsWith('あなたの')){r.who='me';t=t.slice(4)}
  if(m=/^(トラッシュ|エナゾーン|手札)から/.exec(t)){r.zone={'トラッシュ':'trash','エナゾーン':'ener','手札':'hand'}[m[1]];t=t.slice(m[0].length)}
  for(;;){
    if(m=/^パワー(\d+)(以下|以上)の/.exec(t))r.f.push({pw:[m[2]==='以下'?'<=':'>=',num(m[1])]});
    else if(m=/^レベル(\d+)(以下|以上)?の/.exec(t))r.f.push({lv:[m[2]==='以下'?'<=':m[2]==='以上'?'>=':'=',num(m[1])]});
    else if(m=/^(アップ|ダウン|凍結)状態の/.exec(t))r.f.push({st:m[1]});
    else if(m=/^＜([^＞]+)＞の/.exec(t))r.f.push({cls:m[1]});
    else if(m=new RegExp('^(['+COL+'])の').exec(t))r.f.push({col:m[1]});
    else if(m=/^他の/.exec(t))r.f.push({other:1});
    else if(m=/^\[ガード\]を持つ/.exec(t))r.f.push({guard:1});
    else break;
    t=t.slice(m[0].length);
  }
  if(m=/^すべての(ルリグかシグニ|シグニ|ルリグ|カード)$/.exec(t)){r.type=m[1];r.all=true;return r}
  if(m=/^(ルリグかシグニ|シグニ|ルリグ|カード|スペル|アーツ|ピース)を?(\d+)(体|枚)(まで)?$/.exec(t)){r.type=m[1];r.n=num(m[2]);r.upTo=!!m[4];return r}
  return null;
}

// 動作句(対象を指す「それ」)
const ACT=[
  [/^(?:バニッシュする)$/,'banish'],[/^手札に戻す$/,'bounce'],[/^ダウンし凍結する$/,'downfreeze'],[/^ダウンする$/,'down'],
  [/^アップする$/,'up'],[/^トラッシュに置く$/,'trash'],[/^エナゾーンに置く$/,'toener'],[/^デッキの一番下に置く$/,'deckbottom'],
  [/^手札に加える$/,'tohand'],[/^場に出す$/,'play'],[/^凍結する$/,'freeze']
];
function parseAction(rest){
  rest=rest.trim();let m;
  if(m=/^(?:それ|そのカード|そのシグニ)(?:ら)?を(.+)$/.exec(rest)){for(const[re,op]of ACT)if(re.test(m[1]))return{op};}
  if(m=/^ターン終了時まで、それ(?:ら)?のパワーを([+-]?\d+)する$/.exec(rest))return{op:'power',v:num(m[1])};
  if(/^ターン終了時まで、それは「【常】：アタックできない。?」を得る$/.test(rest))return{op:'noattack'};
  if(m=/^ターン終了時まで、それ(?:ら)?は「(.+)」を得る$/.exec(rest))return{op:'grant',text:m[1]};
  if(/^ターン終了時まで、それ(?:ら)?は能力を失う$/.test(rest))return{op:'nulltarget'};
  if(m=/^ターン終了時まで、それは【(アサシン|ランサー|Sランサー|ダブルクラッシュ|シュート)[^】]*】を得る$/.exec(rest))return{op:'grantkw',kw:m[1]};
  return null;
}

// 1文 → ステップ(配列も可)。未対応は manual
function parseSentence(s0){
  let s=s0.trim(),m,cond=null;
  if(m=/^そうした場合、/.exec(s)){cond='then';s=s.slice(m[0].length)}
  let r=sentenceCore(s,s0),ifText=null;
  if((Array.isArray(r)?r[0]:r).op==='manual'&&(m=/^(.{1,90}?場合)、(.+)$/.exec(s))){
    const r2=sentenceCore(m[2],s0);
    if((Array.isArray(r2)?r2[0]:r2).op!=='manual'){r=r2;ifText=m[1]}
  }
  const first=Array.isArray(r)?r[0]:r;first.cond=cond;if(ifText)first.ifText=ifText;
  return r;
}
function sentenceCore(s,s0){
  s=s.replace(/\s*[(（][^)）]*[)）]$/,'').trim();
  let m;
  if(m=/^(.+?)(?:を)?対象とし、(.+)$/.exec(s)){
    const tg=parseTarget(m[1]);
    if(tg){const a=parseAction(m[2]);if(a)return Object.assign({target:tg},a)}
  }
  { const a=parseAction(s);if(a)return Object.assign({ref:'prev'},a); }
  if(m=/^(.+?)(?:を)?対象とする$/.exec(s)){const tg=parseTarget(m[1]);if(tg)return{op:'settarget',target:tg}}
  if(m=/^(.+?)(?:を)?対象とし、手札を(\d+)枚捨ててもよい$/.exec(s)){const tg=parseTarget(m[1]);if(tg)return[{op:'settarget',target:tg},{op:'optcost',discard:num(m[2])}]}
  if(m=/^(.+?)(?:を)?対象とし、((?:《[^》]*》)+)を支払ってもよい$/.exec(s)){const tg=parseTarget(m[1]);if(tg)return[{op:'settarget',target:tg},{op:'optcost',ener:parseCost(m[2],'').ener||{}}]}
  if(m=/^手札を(\d+)枚捨ててもよい$/.exec(s))return{op:'optcost',discard:num(m[1])};
  if(m=/^手札から(カード|シグニ|＜[^＞]+＞のシグニ)を(\d+)枚捨ててもよい$/.exec(s))return{op:'optcost',discard:num(m[2]),f:m[1]==='カード'?{}:m[1]==='シグニ'?{type:'シグニ'}:{type:'シグニ',cls:m[1].slice(1,m[1].indexOf('＞'))}};
  if(m=/^((?:《[^》]*》)+)を支払ってもよい$/.exec(s))return{op:'optcost',ener:parseCost(m[1],'').ener||{}};
  if(/^あなたのデッキの一番上を公開する$/.test(s))return{op:'revealtop'};
  if(m=/^対戦相手のデッキの上からカードを(\d+)枚トラッシュに置く$/.exec(s))return{op:'mill',n:num(m[1]),who:'opp'};
  if(m=/^(?:あなたは)?カードを(\d+)枚引く$/.exec(s))return{op:'draw',n:num(m[1])};
  if(m=/^カードを(\d+)枚引き、手札を(\d+)枚捨てる$/.exec(s))return{op:'drawdiscard',n:num(m[1]),d:num(m[2])};
  if(m=/^カードを(\d+)枚引き【エナチャージ(\d+)】をする$/.exec(s))return[{op:'draw',n:num(m[1])},{op:'enecharge',n:num(m[2])}];
  if(m=/^カードを(\d+)枚引くか【エナチャージ(\d+)】をする$/.exec(s))return{op:'choose',options:[{raw:'カードを'+m[1]+'枚引く',steps:[{op:'draw',n:num(m[1])}]},{raw:'【エナチャージ'+m[2]+'】',steps:[{op:'enecharge',n:num(m[2])}]}]};
  if(m=/^【エナチャージ(\d+)】(?:をする)?$/.exec(s))return{op:'enecharge',n:num(m[1])};
  if(m=/^手札を(\d+)枚捨てる$/.exec(s))return{op:'discard',n:num(m[1]),who:'me'};
  if(m=/^対戦相手は手札を(\d+)枚捨てる$/.exec(s))return{op:'discard',n:num(m[1]),who:'opp'};
  if(m=/^対戦相手の手札を(\d+)枚見ないで選び、捨てさせる$/.exec(s))return{op:'discard',n:num(m[1]),who:'opp',blind:1};
  if(m=/^あなたのデッキの上からカードを(\d+)枚トラッシュに置く$/.exec(s))return{op:'mill',n:num(m[1])};
  if(m=/^このターン、次にあなたが(?:(シグニ|ルリグ)によって)?ダメージを受ける場合、代わりにダメージを受けない$/.exec(s))return{op:'shield',from:m[1]||'any'};
  if(/^(?:それ|そのシグニ)の【出】能力は発動しない$/.test(s))return{op:'noetb',ref:'prev'};
  if(/^ターン終了時まで、対戦相手のすべてのシグニは能力を失う$/.test(s))return{op:'nullall'};
  if(m=/^あなたのルリグゾーンに【リミットアッパー】(\d+)つを置く$/.exec(s))return{op:'limitup'};
  if(/^このゲームの間、あなたのエナゾーンにあるカードは【マルチエナ】を得る$/.test(s))return{op:'multiener'};
  if(/^【[^】]+】$/.test(s))return{op:'kw',kw:s};
  if(/^このシグニは覚醒する$/.test(s))return{op:'awaken',ref:'self'};
  if(m=/^ターン終了時まで、このルリグは「(.+)」を得る$/.exec(s))return{op:'grant',text:m[1],ref:'self'};
  if(m=/^ターン終了時まで、このシグニは「(.+)」を得る$/.exec(s))return{op:'grant',text:m[1],ref:'self'};
  if(m=/^(?:ターン終了時まで、)?このシグニは【(アサシン|ランサー|Sランサー|ダブルクラッシュ|シュート)[^】]*】を得る$/.exec(s))return{op:'grantkw',kw:m[1],ref:'self'};
  if(m=/^次の対戦相手のターン終了時まで、このシグニのパワーを([+-]\d+)する$/.exec(s))return{op:'power',v:num(m[1]),ref:'self'};
  if(m=/^ターン終了時まで、このシグニのパワーを([+-]\d+)する$/.exec(s))return{op:'power',v:num(m[1]),ref:'self'};
  return{op:'manual',text:s0};
}

// 本文(効果部) → ステップ列。選択肢(①②)は modal、デッキ上を見る→その中から は look に統合
function lookFilter(t){
  let m;
  if(t==='カード')return{};if(t==='シグニ')return{type:'シグニ'};if(t==='スペル')return{type:'スペル'};
  if(m=/^＜([^＞]+)＞のシグニ$/.exec(t))return{type:'シグニ',cls:m[1]};
  if(m=/^＜([^＞]+)＞のカード$/.exec(t))return{cls:m[1]};
  if(m=/^レベル(\d+)(以下)?の(シグニ|カード)$/.exec(t))return{type:m[3]==='シグニ'?'シグニ':undefined,lv:[m[2]?'<=':'=',num(m[1])]};
  if(m=/^あなたの(?:場にいる|センター)ルリグと共通する色を持つ(カード|シグニ)$/.exec(t))return{type:m[1]==='シグニ'?'シグニ':undefined,col:'common'};
  return null;
}
const LOOKTO={'手札に加えるか場に出し':'hand_or_field','手札に加え':'hand','場に出し':'field','エナゾーンに置き':'ener','トラッシュに置き':'trash','デッキの一番上に戻し':'top'};
const LOOKREST={'好きな順番でデッキの一番下に置く':'bottom','エナゾーンに置く':'ener','トラッシュに置く':'trash','デッキに加えてシャッフルする':'shuffle','好きな順番でデッキの一番上に戻す':'top'};
// 「その中から…」→ picks[]・rest。解釈できない句があれば null
function parseLookPicks(sent){
  const m=/^その中から(.+)$/.exec(sent);if(!m)return null;
  const picks=[];let rest='';
  for(const c of m[1].split('、')){
    let r;
    if(r=/^残りを(.+)$/.exec(c)){if(!(r[1] in LOOKREST))return null;rest=LOOKREST[r[1]];continue}
    r=/^(.+?)(?:を)?(?:(\d+)枚(まで)?|好きな枚数)を?(公開し)?(手札に加えるか場に出し|手札に加え|場に出し|エナゾーンに置き|トラッシュに置き|デッキの一番上に戻し)$/.exec(c);
    if(!r)r=/^(好きな枚数の)(.+?)を?(公開し)?(手札に加え|エナゾーンに置き|トラッシュに置き)$/.exec(c);
    if(!r)return null;
    let f,pick,upTo,rev,to;
    if(r[1]==='好きな枚数の'){f=lookFilter(r[2]);pick=99;upTo=true;rev=!!r[3];to=r[4]}
    else{f=lookFilter(r[1]);pick=r[2]?num(r[2]):99;upTo=r[2]?!!r[3]:true;rev=!!r[4];to=r[5]}
    if(!f)return null;
    picks.push({f,pick,upTo,reveal:rev,to:LOOKTO[to]});
  }
  return picks.length?{picks,rest}:null;
}
function parseBody(body){
  const m=/^(どちらか1つを選ぶ|以下の(\d)つから(\d)つ(?:まで)?を?選ぶ)。?\s*(①.*)$/.exec(body);
  if(m){
    const opts=m[4].split(/(?=[①-⑤])/).map(o=>o.replace(/^[①-⑤]/,'')).map(o=>({raw:o,steps:parseBody(o)}));
    return[{op:'modal',pick:m[3]?num(m[3]):1,options:opts}];
  }
  const ss=splitSentences(body).filter(x=>!/^[(（].*[)）]$/.test(x)&&!/^[』」)）]+$/.test(x)),out=[];
  for(let i=0;i<ss.length;i++){
    const lm=/^あなたのデッキの上からカードを(\d+)枚見る$/.exec(ss[i]);
    if(lm&&ss[i+1]){
      const pp=parseLookPicks(ss[i+1]);
      if(pp){out.push({op:'look',n:num(lm[1]),picks:pp.picks,rest:pp.rest});i++;continue}
    }
    const r=parseSentence(ss[i]);Array.isArray(r)?out.push(...r):out.push(r);
  }
  return out;
}

function parseCard(text){
  return splitAbilities(text).map(a=>{
    const steps=['LB','出','自','起','効果','常'].includes(a.kind)?parseBody(a.body):[];
    return Object.assign({},a,{steps});
  });
}
// 自動化の度合い: 文単位
function stats(abilities){
  let ok=0,all=0;
  const walk=st=>st.forEach(x=>{if(x.op==='modal'||x.op==='choose')x.options.forEach(o=>walk(o.steps));else{all++;if(x.op!=='manual')ok++}});
  abilities.forEach(a=>walk(a.steps));
  return{ok,all};
}
const API={splitSentences,splitAbilities,parseTarget,parseSentence,parseBody,parseCard,stats};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.ABIL=API;
})(typeof window!=='undefined'?window:globalThis);
