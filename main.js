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
// Excel出力（チーム戦／個人戦 共通ロジック）
// =========================
async function exportToExcel(templatePath, cellMap) {
  try {
    const res = await fetch(templatePath);
    if (!res.ok) throw new Error("テンプレートファイルが見つかりません: " + templatePath);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellStyles: true });
    const ws = wb.Sheets[wb.SheetNames[0]];

    const setCell = (addr, value) => {
      const t = typeof value === "number" ? "n" : "s";
      if (ws[addr]) {
        ws[addr].v = value;
        ws[addr].t = t;
      } else {
        ws[addr] = { t, v: value };
      }
    };

    setCell(cellMap.nickname, localStorage.getItem("playerName") || "");
    setCell(cellMap.centerLrig, localStorage.getItem("centerLrig") || "");

    lrigDeck.slice(0, 6).forEach((c, i) => {
      const row = cellMap.lrigRows[i];
      setCell(`${cellMap.lrigLeftNoCol}${row}`, c.id);
      setCell(`${cellMap.lrigLeftNameCol}${row}`, c.name);
    });
    lrigDeck.slice(6, 12).forEach((c, i) => {
      const row = cellMap.lrigRows[i];
      setCell(`${cellMap.lrigRightNoCol}${row}`, c.id);
      setCell(`${cellMap.lrigRightNameCol}${row}`, c.name);
    });

    const mainAll = [...mainBurst, ...mainNoBurst];

    mainAll.forEach((c, i) => {
      const isBurstless = mainNoBurst.includes(c);

      if (i < 10) {
        const row = cellMap.section2Rows[i];
        setCell(`${cellMap.s2LeftNoCol}${row}`, c.id);
        setCell(`${cellMap.s2LeftNameCol}${row}`, c.name);
        if (isBurstless) setCell(`${cellMap.s2LeftCheckCol}${row}`, "レ");
      } else if (i < 20) {
        const row = cellMap.section2Rows[i - 10];
        setCell(`${cellMap.s2RightNoCol}${row}`, c.id);
        setCell(`${cellMap.s2RightNameCol}${row}`, c.name);
        if (isBurstless) setCell(`${cellMap.s2RightCheckCol}${row}`, "レ");
      } else if (i < 30) {
        const row = cellMap.section3Rows[i - 20];
        setCell(`${cellMap.s3LeftNoCol}${row}`, c.id);
        setCell(`${cellMap.s3LeftNameCol}${row}`, c.name);
      } else if (i < 40) {
        const row = cellMap.section3Rows[i - 30];
        setCell(`${cellMap.s3RightNoCol}${row}`, c.id);
        setCell(`${cellMap.s3RightNameCol}${row}`, c.name);
      }
    });

    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deck_${localStorage.getItem("playerName") || "unnamed"}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
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
};した");
};
