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
const MAX_RESULTS = 60;

function renderCards(cards) {
  const list = document.getElementById("card-list");
  list.innerHTML = "";

  const shown = cards.slice(0, MAX_RESULTS);

  shown.forEach(card => {
    const img = document.createElement("img");
    img.src = card.image;
    img.className = "card-img";
    img.loading = "lazy";

    img.onclick = () => addToDeck(card);

    list.appendChild(img);
  });

  if (cards.length > MAX_RESULTS) {
    const notice = document.createElement("p");
    notice.className = "search-notice";
    notice.textContent = `${cards.length}件ヒット（先頭${MAX_RESULTS}件を表示中。キーワードを追加して絞り込んでください）`;
    list.appendChild(notice);
  }
}

// 初期表示は空。検索するまでカードを描画しない
renderCards([]);

// =========================
// 検索処理（デバウンス付き）
// =========================
let searchTimer = null;

document.getElementById("search-box").oninput = (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.toLowerCase();

  searchTimer = setTimeout(() => {
    if (q === "") {
      renderCards([]);
      return;
    }
    const filtered = allCards.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.text && c.text.toLowerCase().includes(q))
    );
    renderCards(filtered);
  }, 250);
};

// =========================
// デッキ追加処理
// =========================
let lrigDeck = [];
let mainBurst = [];
let mainNoBurst = [];

// ルリグデッキに入るカード種別
// ルリグ本体・アシストルリグ（"ルリグ"を含む）に加え、アーツ・ピース（亜種含む）も対象
const LRIG_DECK_TYPES = ["ルリグ", "アーツ", "ピース"];

function isLrigDeckCard(card) {
  return LRIG_DECK_TYPES.some(t => card.type.includes(t));
}

function addToDeck(card) {
  const img = document.createElement("img");
  img.src = card.image;
  img.className = "card-img";

  img.onclick = () => removeCard(card, img);

  if (isLrigDeckCard(card)) {
    lrigDeck.push(card);
    document.getElementById("lrig-deck").appendChild(img);
  } else if (card.burst) {
    mainBurst.push(card);
    document.getElementById("main-burst").appendChild(img);
  } else {
    mainNoBurst.push(card);
    document.getElementById("main-noburst").appendChild(img);
  }

  saveCurrentDeckToStorage();
}

// =========================
// カード削除
// =========================
function removeCard(card, img) {
  img.remove();

  lrigDeck = lrigDeck.filter(c => c !== card);
  mainBurst = mainBurst.filter(c => c !== card);
  mainNoBurst = mainNoBurst.filter(c => c !== card);

  saveCurrentDeckToStorage();
}

// =========================
// デッキ表示を配列から再描画（呼び出し時に使用）
// =========================
function renderDeckArea(elementId, cards) {
  const container = document.getElementById(elementId);
  container.innerHTML = "";
  cards.forEach(card => {
    const img = document.createElement("img");
    img.src = card.image;
    img.className = "card-img";
    img.onclick = () => removeCard(card, img);
    container.appendChild(img);
  });
}

// =========================
// テキスト出力（クリップボードコピー）
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

// =========================
// 複数デッキ保存・呼び出し
// =========================
function getSavedDecks() {
  return JSON.parse(localStorage.getItem("savedDecks") || "{}");
}

function setSavedDecks(decks) {
  localStorage.setItem("savedDecks", JSON.stringify(decks));
}

function renderDeckList() {
  const decks = getSavedDecks();
  const listEl = document.getElementById("deck-list");
  listEl.innerHTML = "";

  const names = Object.keys(decks);
  if (names.length === 0) {
    const li = document.createElement("li");
    li.textContent = "（保存されたデッキはありません）";
    listEl.appendChild(li);
    return;
  }

  names.forEach(name => {
    const li = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = name;

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "読み込む";
    loadBtn.onclick = () => loadDeck(name);

    const delBtn = document.createElement("button");
    delBtn.textContent = "削除";
    delBtn.onclick = () => {
      if (confirm(`「${name}」を削除しますか？`)) {
        const d = getSavedDecks();
        delete d[name];
        setSavedDecks(d);
        renderDeckList();
      }
    };

    li.appendChild(label);
    li.appendChild(loadBtn);
    li.appendChild(delBtn);
    listEl.appendChild(li);
  });
}

function loadDeck(name) {
  const decks = getSavedDecks();
  const deck = decks[name];
  if (!deck) {
    alert("そのデッキが見つかりませんでした");
    return;
  }

  lrigDeck = deck.lrigDeck || [];
  mainBurst = deck.mainBurst || [];
  mainNoBurst = deck.mainNoBurst || [];

  renderDeckArea("lrig-deck", lrigDeck);
  renderDeckArea("main-burst", mainBurst);
  renderDeckArea("main-noburst", mainNoBurst);

  document.getElementById("deck-manager-modal").style.display = "none";
  alert(`「${name}」を読み込みました`);
}

document.getElementById("save-btn").onclick = () => {
  renderDeckList();
  document.getElementById("deck-manager-modal").style.display = "block";
};

document.getElementById("deck-save-confirm").onclick = () => {
  const name = document.getElementById("deck-save-name").value.trim();
  if (!name) {
    alert("デッキ名を入力してください");
    return;
  }

  const decks = getSavedDecks();
  decks[name] = {
    lrigDeck,
    mainBurst,
    mainNoBurst,
    savedAt: new Date().toISOString()
  };
  setSavedDecks(decks);

  document.getElementById("deck-save-name").value = "";
  renderDeckList();
  alert(`「${name}」として保存しました`);
};

document.getElementById("close-deck-manager").onclick = () => {
  document.getElementById("deck-manager-modal").style.display = "none";
};

// =========================
// Excel出力モーダル開閉
// =========================
document.getElementById("open-export-modal").onclick = () => {
  document.getElementById("export-modal").style.display = "block";
};

document.getElementById("close-export-modal").onclick = () => {
  document.getElementById("export-modal").style.display = "none";
};

// =========================
// Excel出力（xlsxのZIP内XMLを直接書き換え、画像・印刷設定を保持）
// =========================
function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function setCellXml(xml, addr, value) {
  const escaped = escapeXml(value);
  const selfClosing = new RegExp(`<c r="${addr}"([^>]*)/>`);
  const withValue = new RegExp(`<c r="${addr}"([^>]*)>.*?</c>`);

  const buildReplacement = (attrs) => {
    const cleanAttrs = attrs.replace(/\s*t="[^"]*"/, "");
    return `<c r="${addr}"${cleanAttrs} t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
  };

  if (selfClosing.test(xml)) {
    return xml.replace(selfClosing, (m, attrs) => buildReplacement(attrs));
  } else if (withValue.test(xml)) {
    return xml.replace(withValue, (m, attrs) => buildReplacement(attrs));
  }
  console.warn(`セル ${addr} がテンプレート内に見つかりませんでした`);
  return xml;
}

async function exportToExcel(templatePath, cellMap) {
  try {
    const res = await fetch(templatePath);
    if (!res.ok) throw new Error("テンプレートファイルが見つかりません: " + templatePath);
    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const sheetPath = "xl/worksheets/sheet1.xml";
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) throw new Error("テンプレート内にsheet1.xmlが見つかりません");

    let xml = await sheetFile.async("string");

    xml = setCellXml(xml, cellMap.nickname, localStorage.getItem("playerName") || "");
    xml = setCellXml(xml, cellMap.centerLrig, localStorage.getItem("centerLrig") || "");

    lrigDeck.slice(0, 6).forEach((c, i) => {
      const row = cellMap.lrigRows[i];
      xml = setCellXml(xml, `${cellMap.lrigLeftNoCol}${row}`, c.id);
      xml = setCellXml(xml, `${cellMap.lrigLeftNameCol}${row}`, c.name);
    });
    lrigDeck.slice(6, 12).forEach((c, i) => {
      const row = cellMap.lrigRows[i];
      xml = setCellXml(xml, `${cellMap.lrigRightNoCol}${row}`, c.id);
      xml = setCellXml(xml, `${cellMap.lrigRightNameCol}${row}`, c.name);
    });

   // ライフバースト無は下段（21〜40枚目、専用欄）から優先的に埋める。
    // 21枚以上ある場合のみ、あふれた分を上段（有欄）にチェック付きで入れる。
    const noBurstForSection3 = mainNoBurst.slice(0, 20);
    const noBurstOverflow = mainNoBurst.slice(20);

    const section2Cards = [
      ...mainBurst.map(c => ({ card: c, checked: false })),
      ...noBurstOverflow.map(c => ({ card: c, checked: true }))
    ].slice(0, 20);

    section2Cards.forEach(({ card: c, checked }, i) => {
      if (i < 10) {
        const row = cellMap.section2Rows[i];
        xml = setCellXml(xml, `${cellMap.s2LeftNoCol}${row}`, c.id);
        xml = setCellXml(xml, `${cellMap.s2LeftNameCol}${row}`, c.name);
        if (checked) xml = setCellXml(xml, `${cellMap.s2LeftCheckCol}${row}`, "レ");
      } else {
        const row = cellMap.section2Rows[i - 10];
        xml = setCellXml(xml, `${cellMap.s2RightNoCol}${row}`, c.id);
        xml = setCellXml(xml, `${cellMap.s2RightNameCol}${row}`, c.name);
        if (checked) xml = setCellXml(xml, `${cellMap.s2RightCheckCol}${row}`, "レ");
      }
    });

    noBurstForSection3.forEach((c, i) => {
      if (i < 10) {
        const row = cellMap.section3Rows[i];
        xml = setCellXml(xml, `${cellMap.s3LeftNoCol}${row}`, c.id);
        xml = setCellXml(xml, `${cellMap.s3LeftNameCol}${row}`, c.name);
      } else {
        const row = cellMap.section3Rows[i - 10];
        xml = setCellXml(xml, `${cellMap.s3RightNoCol}${row}`, c.id);
        xml = setCellXml(xml, `${cellMap.s3RightNameCol}${row}`, c.name);
      }
    });

    zip.file(sheetPath, xml);

    const out = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(out);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deck_${localStorage.getItem("playerName") || "unnamed"}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    document.getElementById("export-modal").style.display = "none";
  } catch (err) {
    console.error(err);
    alert("Excel出力に失敗しました。コンソールを確認してください。");
  }
}

// チーム戦用セル配置
const teamCellMap = {
  nickname: "I9",
  centerLrig: "L4",
  lrigRows: [16, 17, 18, 19, 20, 21],
  lrigLeftNoCol: "C", lrigLeftNameCol: "D",
  lrigRightNoCol: "G", lrigRightNameCol: "H",
  section2Rows: [25, 26, 27, 28, 29, 30, 31, 32, 33, 34],
  s2LeftNoCol: "C", s2LeftCheckCol: "D", s2LeftNameCol: "E",
  s2RightNoCol: "G", s2RightCheckCol: "H", s2RightNameCol: "I",
  section3Rows: [38, 39, 40, 41, 42, 43, 44, 45, 46, 47],
  s3LeftNoCol: "C", s3LeftNameCol: "D",
  s3RightNoCol: "G", s3RightNameCol: "H"
};

// 個人戦用セル配置
const soloCellMap = {
  nickname: "H2",
  centerLrig: "H9",
  lrigRows: [14, 15, 16, 17, 18, 19],
  lrigLeftNoCol: "B", lrigLeftNameCol: "C",
  lrigRightNoCol: "F", lrigRightNameCol: "G",
  section2Rows: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
  s2LeftNoCol: "B", s2LeftCheckCol: "C", s2LeftNameCol: "D",
  s2RightNoCol: "F", s2RightCheckCol: "G", s2RightNameCol: "H",
  section3Rows: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
  s3LeftNoCol: "B", s3LeftNameCol: "C",
  s3RightNoCol: "F", s3RightNameCol: "G"
};

document.getElementById("export-excel-team-btn").onclick = () => {
  exportToExcel("wixoss_decklist_team.xlsx", teamCellMap);
};

document.getElementById("export-excel-solo-btn").onclick = () => {
  exportToExcel("wixoss_ceremony_decklist.xlsx", soloCellMap);
};
// =========================
// 現在編集中のデッキを自動保存・復元
// =========================
function saveCurrentDeckToStorage() {
  localStorage.setItem("currentDeck", JSON.stringify({ lrigDeck, mainBurst, mainNoBurst }));
}

function loadCurrentDeckFromStorage() {
  const saved = localStorage.getItem("currentDeck");
  if (!saved) return;

  try {
    const data = JSON.parse(saved);
    lrigDeck = data.lrigDeck || [];
    mainBurst = data.mainBurst || [];
    mainNoBurst = data.mainNoBurst || [];

    renderDeckArea("lrig-deck", lrigDeck);
    renderDeckArea("main-burst", mainBurst);
    renderDeckArea("main-noburst", mainNoBurst);
  } catch (e) {
    console.error("保存されたデッキの読み込みに失敗しました", e);
  }
}

// ページを開いた時に、前回編集中だったデッキを復元
loadCurrentDeckFromStorage();

// =========================
// デッキを空にする
// =========================
document.getElementById("clear-deck-btn").onclick = () => {
  if (!confirm("デッキ内のカードをすべて空にします。よろしいですか？")) return;

  lrigDeck = [];
  mainBurst = [];
  mainNoBurst = [];

  renderDeckArea("lrig-deck", lrigDeck);
  renderDeckArea("main-burst", mainBurst);
  renderDeckArea("main-noburst", mainNoBurst);

  saveCurrentDeckToStorage();
};
