// =========================
// カードデータ読み込み
// =========================

// cardData をオブジェクト形式に変換
function convertCard(raw) {
  return {
    id: raw[0],
    image: raw[1],
    name: raw[2],
    rare: raw[3],
    type: raw[4],
    class: raw[5],
    color: raw[6],
    level: raw[7],
    cost: raw[8],
    limit: raw[9],
    power: raw[10],
    coin: raw[11],
    timing: raw[12],
   burst: raw[13] !== "" && raw[13] !== "0",   // LB が空・"0" 以外ならライフバースト
    team: raw[14],
    story: raw[15],
    text: raw[16],           // 日本語テキスト
    ban: raw[18]
  };
}

let allCards = cardData.map(convertCard);

// =========================
// プレイヤー情報読み込み
// =========================
document.getElementById("nickname").innerText =
  localStorage.getItem("playerName") || "未設定";

document.getElementById("center-lrig").innerText =
  localStorage.getItem("centerLrig") || "未設定";

// =========================
// 設定モーダル開閉
// =========================
document.getElementById("open-settings").onclick = () => {
  document.getElementById("settings-modal").style.display = "block";
};

document.getElementById("close-settings").onclick = () => {
  document.getElementById("settings-modal").style.display = "none";
};

// =========================
// 設定保存
// =========================
document.getElementById("save-settings").onclick = () => {
  const name = document.getElementById("nickname-input").value;
  const lrig = document.getElementById("lrig-input").value;

  localStorage.setItem("playerName", name);
  localStorage.setItem("centerLrig", lrig);

  document.getElementById("nickname").innerText = name;
  document.getElementById("center-lrig").innerText = lrig;

  alert("設定を保存しました");
};

// =========================
// 検索結果表示
// =========================
function renderCards(cards) {
  const list = document.getElementById("card-list");
  list.innerHTML = "";

  cards.forEach(card => {
    const img = document.createElement("img");
    img.src = card.image;
    img.className = "card-img";

    img.onclick = () => addToDeck(card);

    list.appendChild(img);
  });
}

// 初期表示
renderCards(allCards);

// =========================
// 検索処理
// =========================
document.getElementById("search-box").oninput = (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = allCards.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.id.toLowerCase().includes(q) ||
    (c.text && c.text.toLowerCase().includes(q))
  );
  renderCards(filtered);
};

// =========================
// デッキ追加処理
// =========================
let lrigDeck = [];
let mainBurst = [];
let mainNoBurst = [];

function addToDeck(card) {
  const img = document.createElement("img");
  img.src = card.image;
  img.className = "card-img";

  img.onclick = () => removeCard(card, img);

  if (card.type.includes("ルリグ") || card.type.includes("LRIG")) {
    lrigDeck.push(card);
    document.getElementById("lrig-deck").appendChild(img);
  } else if (card.burst) {
    mainBurst.push(card);
    document.getElementById("main-burst").appendChild(img);
  } else {
    mainNoBurst.push(card);
    document.getElementById("main-noburst").appendChild(img);
  }
}

// =========================
// カード削除
// =========================
function removeCard(card, img) {
  img.remove();

  lrigDeck = lrigDeck.filter(c => c !== card);
  mainBurst = mainBurst.filter(c => c !== card);
  mainNoBurst = mainNoBurst.filter(c => c !== card);
}

// =========================
// 保存
// =========================
document.getElementById("save-btn").onclick = () => {
  const deck = {
    player: localStorage.getItem("playerName"),
    centerLrig: localStorage.getItem("centerLrig"),
    lrigDeck,
    mainBurst,
    mainNoBurst
  };
  localStorage.setItem("savedDeck", JSON.stringify(deck));
  alert("保存しました");
};

// =========================
// 出力
// =========================
document.getElementById("export-btn").onclick = () => {
  let text = "";

  text += "◆ルリグデッキ\n";
  lrigDeck.forEach((c, i) => {
    text += `${i + 1} ${c.id} ${c.name}\n`;
  });

  text += "\n◆メインデッキ（ライフバースト有）\n";
  mainBurst.forEach((c, i) => {
    text += `${i + 1} ${c.id} ${c.name}\n`;
  });

  text += "\n◆メインデッキ（ライフバースト無）\n";
  mainNoBurst.forEach((c, i) => {
    text += `${i + 1} ${c.id} ${c.name}\n`;
  });

  console.log(text);
  navigator.clipboard.writeText(text);
  alert("デッキリストをクリップボードにコピーしました");
};
