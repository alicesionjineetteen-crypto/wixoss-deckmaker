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
// 要素が万一欠けていてもボタン自体は必ず反応するよう、存在チェックしてから使う
// =========================
document.getElementById("open-settings").onclick = () => {
  const nameInput = document.getElementById("nickname-input");
  const lrigInput = document.getElementById("lrig-input");
  const selectorInput = document.getElementById("selector-id-input");

  if (nameInput) nameInput.value = localStorage.getItem("playerName") || "";
  if (lrigInput) lrigInput.value = localStorage.getItem("centerLrig") || "";
  if (selectorInput) selectorInput.value = localStorage.getItem("selectorId") || "";

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
  const selectorIdInput = document.getElementById("selector-id-input");
  const selectorId = selectorIdInput ? selectorIdInput.value : "";

  localStorage.setItem("playerName", name);
  localStorage.setItem("centerLrig", lrig);
  localStorage.setItem("selectorId", selectorId);

  document.getElementById("nickname").innerText = name;
  document.getElementById("center-lrig").innerText = lrig;

  alert("設定を保存しました");
};

// =========================
// 検索・詳細検索
// =========================
const MAX_RESULTS = 60;
const LONG_PRESS_MS = 200;
const MOVE_THRESHOLD = 8; // px

function renderCards(cards, searched) {
  const list = document.getElementById("card-list");
  list.innerHTML = "";

  const shown = cards.slice(0, MAX_RESULTS);

  shown.forEach(card => {
    const img = document.createElement("img");
    img.src = card.image;
    img.className = "card-img";
    img.loading = "lazy";

    attachSearchCardEvents(img, card);

    list.appendChild(img);
  });

  if (cards.length > MAX_RESULTS) {
    const notice = document.createElement("p");
    notice.className = "search-notice";
    notice.textContent = `${cards.length}件ヒット（先頭${MAX_RESULTS}件を表示中。キーワードを追加して絞り込んでください）`;
    list.appendChild(notice);
  } else if (searched && cards.length === 0) {
    const notice = document.createElement("p");
    notice.className = "search-notice";
    notice.textContent = "検索結果は0件です。";
    list.appendChild(notice);
  }
}

// 検索結果カードのタップ（デッキに追加）／長押し（拡大表示）
function attachSearchCardEvents(img, card) {
  let timer = null;
  let longPressed = false;
  let moved = false;
  let startX = 0;
  let startY = 0;

  const startPress = (e) => {
    longPressed = false;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      longPressed = true;
      showCardPreview(card);
    }, LONG_PRESS_MS);
  };

  const checkMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      moved = true;
      clearTimeout(timer);
    }
  };

  const cancelPress = () => {
    clearTimeout(timer);
    moved = true;
  };

  const endPress = () => {
    clearTimeout(timer);
    if (!longPressed && !moved) {
      addToDeck(card);
    }
  };

  img.addEventListener("pointerdown", startPress);
  img.addEventListener("pointermove", checkMove);
  img.addEventListener("pointerup", endPress);
  img.addEventListener("pointercancel", cancelPress);
  img.addEventListener("pointerleave", cancelPress);
}

function showCardPreview(card) {
  document.getElementById("card-preview-img").src = card.image;
  document.getElementById("card-preview-modal").style.display = "block";
}

document.getElementById("close-card-preview").onclick = () => {
  document.getElementById("card-preview-modal").style.display = "none";
};

// 初期表示は空。検索するまでカードを描画しない
renderCards([]);

// 詳細検索の条件を取得
function getAdvancedFilters() {
  return {
    name: document.getElementById("filter-name").value.trim().toLowerCase(),
    type: document.getElementById("filter-type").value,
    level: document.getElementById("filter-level").value,
    color: document.getElementById("filter-color").value,
    cls: document.getElementById("filter-class").value.trim().toLowerCase(),
    timing: document.getElementById("filter-timing").value,
    burst: document.getElementById("filter-burst").value,
    text: document.getElementById("filter-text").value.trim().toLowerCase()
  };
}

function hasActiveAdvancedFilters(f) {
  return !!(f.name || f.type || f.level || f.color || f.cls || f.timing || f.burst || f.text);
}

// カードが詳細検索条件（AND）に合致するか
function matchesAdvancedFilters(card, f) {
  if (f.name && !card.name.toLowerCase().includes(f.name)) return false;
  if (f.type && !card.type.includes(f.type)) return false;
  if (f.level && card.level !== f.level) return false;
  if (f.color && !card.color.includes(f.color)) return false;
  if (f.cls && !(card.class && card.class.toLowerCase().includes(f.cls))) return false;
  if (f.timing && !(card.timing && card.timing.includes(f.timing))) return false;
  if (f.burst === "yes" && !card.burst) return false;
  if (f.burst === "no" && card.burst) return false;
  if (f.text && !(card.text && card.text.toLowerCase().includes(f.text))) return false;
  return true;
}

function runSearch() {
  const q = document.getElementById("search-box").value.toLowerCase();
  const filters = getAdvancedFilters();

  if (q === "" && !hasActiveAdvancedFilters(filters)) {
    renderCards([]);
    return;
  }

  const filtered = allCards.filter(c => {
    const matchesKeyword =
      q === "" ||
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.text && c.text.toLowerCase().includes(q));

    if (!matchesKeyword) return false;
    return matchesAdvancedFilters(c, filters);
  });

  renderCards(filtered, true);
}

// =========================
// 検索ボックス（デバウンス付き）
// =========================
let searchTimer = null;

document.getElementById("search-box").oninput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
};

// =========================
// 詳細検索パネルの開閉・条件変更
// =========================
document.getElementById("toggle-advanced-search").onclick = () => {
  const panel = document.getElementById("advanced-search-panel");
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "block";
  document.getElementById("toggle-advanced-search").textContent = isOpen ? "詳細検索 ▼" : "詳細検索 ▲";
};

document.getElementById("filter-type").onchange = runSearch;
document.getElementById("filter-level").onchange = runSearch;
document.getElementById("filter-color").onchange = runSearch;
document.getElementById("filter-timing").onchange = runSearch;
document.getElementById("filter-burst").onchange = runSearch;

let advancedTextTimer = null;
document.getElementById("filter-name").oninput = () => {
  clearTimeout(advancedTextTimer);
  advancedTextTimer = setTimeout(runSearch, 250);
};
document.getElementById("filter-class").oninput = () => {
  clearTimeout(advancedTextTimer);
  advancedTextTimer = setTimeout(runSearch, 250);
};
document.getElementById("filter-text").oninput = () => {
  clearTimeout(advancedTextTimer);
  advancedTextTimer = setTimeout(runSearch, 250);
};

document.getElementById("clear-advanced-search").onclick = () => {
  document.getElementById("filter-name").value = "";
  document.getElementById("filter-type").value = "";
  document.getElementById("filter-level").value = "";
  document.getElementById("filter-color").value = "";
  document.getElementById("filter-class").value = "";
  document.getElementById("filter-timing").value = "";
  document.getElementById("filter-burst").value = "";
  document.getElementById("filter-text").value = "";
  runSearch();
};

// =========================
// デッキ本体
// =========================
let lrigDeck = [];
let mainBurst = [];
let mainNoBurst = [];

// ルリグデッキに入るカード種別
const LRIG_DECK_TYPES = ["ルリグ", "アーツ", "ピース"];

function isLrigDeckCard(card) {
  return LRIG_DECK_TYPES.some(t => card.type.includes(t));
}

// 同名カードの枚数をカウント
function countByName(arr, name) {
  return arr.filter(c => c.name === name).length;
}

// =========================
// 並び替え＋再描画（デッキが変化するたびに呼ぶ、唯一の更新経路）
// =========================
function sortDecks() {
  const byName = (a, b) => a.name.localeCompare(b.name, "ja");
  lrigDeck.sort(byName);
  mainBurst.sort(byName);
  mainNoBurst.sort(byName);
}

function refreshDeckDisplay() {
  sortDecks();
  renderDeckArea("lrig-deck", lrigDeck);
  renderDeckArea("main-burst", mainBurst);
  renderDeckArea("main-noburst", mainNoBurst);
  updateDeckCounts();
  saveCurrentDeckToStorage();
}

// =========================
// デッキ内カードのタップ（1枚削除）／長押し（枚数指定で追加）
// Pointer Eventsでタッチ・マウスを一本化（二重発火・誤スクロール削除対策）
// =========================
function attachDeckCardEvents(img, card, allowLongPress) {
  if (!allowLongPress) {
    img.onclick = () => removeCard(card);
    return;
  }

  let timer = null;
  let longPressed = false;
  let moved = false;
  let startX = 0;
  let startY = 0;

  const startPress = (e) => {
    longPressed = false;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      longPressed = true;
      promptAddMore(card);
    }, LONG_PRESS_MS);
  };

  const checkMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      moved = true;
      clearTimeout(timer);
    }
  };

  const cancelPress = () => {
    clearTimeout(timer);
    moved = true;
  };

  const endPress = () => {
    clearTimeout(timer);
    if (!longPressed && !moved) {
      removeCard(card);
    }
  };

  img.addEventListener("pointerdown", startPress);
  img.addEventListener("pointermove", checkMove);
  img.addEventListener("pointerup", endPress);
  img.addEventListener("pointercancel", cancelPress);
  img.addEventListener("pointerleave", cancelPress);
}

function promptAddMore(card) {
  const currentTotal = countByName(mainBurst, card.name) + countByName(mainNoBurst, card.name);
  const remaining = 4 - currentTotal;

  if (remaining <= 0) {
    alert(`「${card.name}」はすでに上限（4枚）まで入っています`);
    return;
  }

  const input = prompt(
    `「${card.name}」を追加する枚数を入力してください\n（現在${currentTotal}枚 / あと${remaining}枚まで追加可）`,
    "1"
  );
  if (input === null) return;

  const qty = parseInt(input, 10);
  if (!Number.isInteger(qty) || qty <= 0) {
    alert("正しい枚数を入力してください");
    return;
  }

  addQuantityToDeck(card, qty);
}

function addQuantityToDeck(card, qty) {
  const currentTotal = countByName(mainBurst, card.name) + countByName(mainNoBurst, card.name);
  const available = 4 - currentTotal;

  if (available <= 0) {
    alert(`「${card.name}」はすでに上限（4枚）まで入っています`);
    return;
  }

  const actualQty = Math.min(qty, available);
  if (actualQty < qty) {
    alert(`上限（4枚）の関係で${actualQty}枚だけ追加しました`);
  }

  for (let i = 0; i < actualQty; i++) {
    if (card.burst) {
      mainBurst.push(card);
    } else {
      mainNoBurst.push(card);
    }
  }

  refreshDeckDisplay();
}

function addToDeck(card) {
  // 上限チェック：ルリグデッキは同名1枚まで、メインデッキは同名4枚まで
  if (isLrigDeckCard(card)) {
    if (countByName(lrigDeck, card.name) >= 1) {
      alert(`「${card.name}」はルリグデッキに1枚までしか入れられません`);
      return;
    }
  } else {
    const total = countByName(mainBurst, card.name) + countByName(mainNoBurst, card.name);
    if (total >= 4) {
      alert(`「${card.name}」はメインデッキに4枚までしか入れられません`);
      return;
    }
  }

  if (isLrigDeckCard(card)) {
    lrigDeck.push(card);
  } else if (card.burst) {
    mainBurst.push(card);
  } else {
    mainNoBurst.push(card);
  }

  refreshDeckDisplay();
}

// =========================
// カード削除（同名カードのうち1枚だけを配列から取り除く）
// =========================
function removeOneMatch(arr, card) {
  const idx = arr.indexOf(card);
  if (idx !== -1) arr.splice(idx, 1);
}

function removeCard(card) {
  removeOneMatch(lrigDeck, card);
  removeOneMatch(mainBurst, card);
  removeOneMatch(mainNoBurst, card);

  refreshDeckDisplay();
}

// =========================
// デッキ表示を配列から再描画
// =========================
function renderDeckArea(elementId, cards) {
  const container = document.getElementById(elementId);
  container.innerHTML = "";
  const allowLongPress = elementId !== "lrig-deck";

  cards.forEach(card => {
    const img = document.createElement("img");
    img.src = card.image;
    img.className = "card-img";
    attachDeckCardEvents(img, card, allowLongPress);
    container.appendChild(img);
  });
}

// =========================
// 見出しの枚数表示を更新
// =========================
function updateDeckCounts() {
  document.getElementById("lrig-count-label").textContent = `<${lrigDeck.length}枚>`;
  document.getElementById("burst-count-label").textContent = `<${mainBurst.length}枚>`;
  document.getElementById("noburst-count-label").textContent = `<${mainNoBurst.length}枚>`;
}

// =========================
// 出力用セクション組み立て（Excel出力で利用）
// =========================
function buildDeckSections() {
  const lrigLeft = lrigDeck.slice(0, 6).map(c => ({ card: c, checked: false }));
  const lrigRight = lrigDeck.slice(6, 12).map(c => ({ card: c, checked: false }));

  // ライフバースト無は下段（21〜40枚目、専用欄）から優先的に埋める
  const noBurstForSection3 = mainNoBurst.slice(0, 20);
  const noBurstOverflow = mainNoBurst.slice(20);

  const section2Cards = [
    ...mainBurst.map(c => ({ card: c, checked: false })),
    ...noBurstOverflow.map(c => ({ card: c, checked: true }))
  ].slice(0, 20);

  const section2Left = section2Cards.slice(0, 10);
  const section2Right = section2Cards.slice(10, 20);

  const section3Left = noBurstForSection3.slice(0, 10).map(c => ({ card: c, checked: false }));
  const section3Right = noBurstForSection3.slice(10, 20).map(c => ({ card: c, checked: false }));

  return { lrigLeft, lrigRight, section2Left, section2Right, section3Left, section3Right };
}

// =========================
// テキスト出力（画面表示＋クリップボードコピー）
// =========================
function buildDeckText() {
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

  return text;
}

document.getElementById("export-btn").onclick = () => {
  const text = buildDeckText();

  const textarea = document.getElementById("text-output-area");
  textarea.value = text;
  document.getElementById("text-output-modal").style.display = "block";

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
};

document.getElementById("close-text-output").onclick = () => {
  document.getElementById("text-output-modal").style.display = "none";
};

document.getElementById("copy-text-output").onclick = () => {
  const textarea = document.getElementById("text-output-area");
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textarea.value)
      .then(() => alert("コピーしました"))
      .catch(() => alert("コピーに失敗しました。テキストを長押しして選択・コピーしてください"));
  } else {
    alert("テキストを長押しして選択・コピーしてください");
  }
};

// =========================
// 複数デッキ保存・呼び出し
// =========================
function getSavedDecks() {
  try {
    return JSON.parse(localStorage.getItem("savedDecks") || "{}");
  } catch (e) {
    console.error("保存済みデッキの読み込みに失敗しました", e);
    return {};
  }
}

function setSavedDecks(decks) {
  try {
    localStorage.setItem("savedDecks", JSON.stringify(decks));
  } catch (e) {
    console.error("保存済みデッキの書き込みに失敗しました", e);
    alert("デッキの保存に失敗しました。端末の空き容量、またはブラウザのストレージ設定をご確認ください。");
  }
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

    const overwriteBtn = document.createElement("button");
    overwriteBtn.textContent = "上書き";
    overwriteBtn.onclick = () => {
      if (confirm(`「${name}」に上書き保存します。よろしいですか？`)) {
        const d = getSavedDecks();
        d[name] = {
          lrigDeck,
          mainBurst,
          mainNoBurst,
          savedAt: new Date().toISOString()
        };
        setSavedDecks(d);
        alert(`「${name}」を上書き保存しました`);
        renderDeckList();
      }
    };

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
    li.appendChild(overwriteBtn);
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

  refreshDeckDisplay();

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
// 保存データのエクスポート・インポート
// =========================
document.getElementById("export-deck-data-btn").onclick = () => {
  const defaultName = `wixoss_deck_backup_${new Date().toISOString().slice(0, 10)}`;
  const inputName = prompt("エクスポートするファイル名を入力してください（拡張子は不要です）", defaultName);
  if (inputName === null) return; // キャンセル時は何もしない

  // ファイル名に使えない記号を安全な文字に置き換える
  const safeName = (inputName.trim() || defaultName).replace(/[\\/:*?"<>|]/g, "_");

  const data = {
    savedDecks: getSavedDecks(),
    currentDeck: { lrigDeck, mainBurst, mainNoBurst },
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};;

document.getElementById("import-deck-data-input").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      if (data.savedDecks) {
        setSavedDecks(data.savedDecks);
      }

      if (data.currentDeck) {
        lrigDeck = data.currentDeck.lrigDeck || [];
        mainBurst = data.currentDeck.mainBurst || [];
        mainNoBurst = data.currentDeck.mainNoBurst || [];
        refreshDeckDisplay();
      }

      renderDeckList();
      alert("インポートしました");
    } catch (err) {
      console.error(err);
      alert("インポートに失敗しました。ファイルの形式をご確認ください");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
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

// 指定セルに「共通フォント・中央揃え・縮小して全体を表示」を適用する
async function applyUniformCellStyle(zip, sheetXml, addresses, referenceFontId) {
  const stylesPath = "xl/styles.xml";
  const stylesFile = zip.file(stylesPath);
  if (!stylesFile) return sheetXml;

  let stylesXml = await stylesFile.async("string");

  const cellXfsMatch = stylesXml.match(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/);
  if (!cellXfsMatch) return sheetXml;

  const xfList = cellXfsMatch[1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [];
  const styleCache = {};

  function getUniformIndex(origIndex) {
    if (styleCache[origIndex] !== undefined) return styleCache[origIndex];
    const orig = xfList[origIndex];
    if (!orig) return origIndex;

    let newXf = orig.replace(/fontId="\d+"/, `fontId="${referenceFontId}"`);
    if (!/fontId="/.test(newXf)) {
      newXf = newXf.replace("<xf ", `<xf fontId="${referenceFontId}" `);
    }
    if (!/applyFont="1"/.test(newXf)) {
      newXf = newXf.replace(/\/?>/, (m) => (m === "/>" ? ' applyFont="1"/>' : ' applyFont="1">'));
    }

    if (newXf.includes("<alignment")) {
      newXf = newXf.replace(/\s*wrapText="1"/g, "");
      newXf = newXf.replace(/<alignment[^>]*\/>/, '<alignment horizontal="center" vertical="center" shrinkToFit="1"/>');
    } else if (newXf.endsWith("/>")) {
      newXf = newXf.slice(0, -2) + ' applyAlignment="1"><alignment horizontal="center" vertical="center" shrinkToFit="1"/></xf>';
    } else {
      newXf = newXf.replace("</xf>", '<alignment horizontal="center" vertical="center" shrinkToFit="1"/></xf>');
    }

    xfList.push(newXf);
    const newIndex = xfList.length - 1;
    styleCache[origIndex] = newIndex;
    return newIndex;
  }

  addresses.forEach(addr => {
    const m = sheetXml.match(new RegExp(`<c r="${addr}"[^>]*\\bs="(\\d+)"`));
    if (!m) return;
    const origIndex = parseInt(m[1], 10);
    const newIndex = getUniformIndex(origIndex);
    sheetXml = sheetXml.replace(
      new RegExp(`(<c r="${addr}"[^>]*\\bs=")\\d+(")`),
      `$1${newIndex}$2`
    );
  });

  const newCellXfs = `<cellXfs count="${xfList.length}">${xfList.join("")}</cellXfs>`;
  stylesXml = stylesXml.replace(cellXfsMatch[0], newCellXfs);
  zip.file(stylesPath, stylesXml);

  return sheetXml;
}

// 指定範囲のセルがまだマージされていなければマージする（テンプレート側の結合漏れ対策）
function ensureMerged(sheetXml, ref) {
  const m = sheetXml.match(/<mergeCells count="(\d+)">([\s\S]*?)<\/mergeCells>/);
  if (!m) return sheetXml;
  if (m[2].includes(`ref="${ref}"`)) return sheetXml;

  const newCount = parseInt(m[1], 10) + 1;
  const newBlock = `<mergeCells count="${newCount}">${m[2]}<mergeCell ref="${ref}"/></mergeCells>`;
  return sheetXml.replace(m[0], newBlock);
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
    const shrinkAddresses = [];

    if (cellMap.mergeFix) {
      xml = ensureMerged(xml, cellMap.mergeFix);
    }

    xml = setCellXml(xml, cellMap.nickname, localStorage.getItem("playerName") || "");
    xml = setCellXml(xml, cellMap.centerLrig, localStorage.getItem("centerLrig") || "");
    xml = setCellXml(xml, cellMap.selectorId, localStorage.getItem("selectorId") || "");

    const { lrigLeft, lrigRight, section2Left, section2Right, section3Left, section3Right } = buildDeckSections();

    lrigLeft.forEach(({ card: c }, i) => {
      const row = cellMap.lrigRows[i];
      const noAddr = `${cellMap.lrigLeftNoCol}${row}`;
      const nameAddr = `${cellMap.lrigLeftNameCol}${row}`;
      xml = setCellXml(xml, noAddr, c.id);
      xml = setCellXml(xml, nameAddr, c.name);
      shrinkAddresses.push(noAddr, nameAddr);
    });
    lrigRight.forEach(({ card: c }, i) => {
      const row = cellMap.lrigRows[i];
      const noAddr = `${cellMap.lrigRightNoCol}${row}`;
      const nameAddr = `${cellMap.lrigRightNameCol}${row}`;
      xml = setCellXml(xml, noAddr, c.id);
      xml = setCellXml(xml, nameAddr, c.name);
      shrinkAddresses.push(noAddr, nameAddr);
    });

    section2Left.forEach(({ card: c, checked }, i) => {
      const row = cellMap.section2Rows[i];
      const noAddr = `${cellMap.s2LeftNoCol}${row}`;
      const nameAddr = `${cellMap.s2LeftNameCol}${row}`;
      xml = setCellXml(xml, noAddr, c.id);
      xml = setCellXml(xml, nameAddr, c.name);
      if (checked) xml = setCellXml(xml, `${cellMap.s2LeftCheckCol}${row}`, "レ");
      shrinkAddresses.push(noAddr, nameAddr);
    });
    section2Right.forEach(({ card: c, checked }, i) => {
      const row = cellMap.section2Rows[i];
      const noAddr = `${cellMap.s2RightNoCol}${row}`;
      const nameAddr = `${cellMap.s2RightNameCol}${row}`;
      xml = setCellXml(xml, noAddr, c.id);
      xml = setCellXml(xml, nameAddr, c.name);
      if (checked) xml = setCellXml(xml, `${cellMap.s2RightCheckCol}${row}`, "レ");
      shrinkAddresses.push(noAddr, nameAddr);
    });

    section3Left.forEach(({ card: c }, i) => {
      const row = cellMap.section3Rows[i];
      const noAddr = `${cellMap.s3LeftNoCol}${row}`;
      const nameAddr = `${cellMap.s3LeftNameCol}${row}`;
      xml = setCellXml(xml, noAddr, c.id);
      xml = setCellXml(xml, nameAddr, c.name);
      shrinkAddresses.push(noAddr, nameAddr);
    });
    section3Right.forEach(({ card: c }, i) => {
      const row = cellMap.section3Rows[i];
      const noAddr = `${cellMap.s3RightNoCol}${row}`;
      const nameAddr = `${cellMap.s3RightNameCol}${row}`;
      xml = setCellXml(xml, noAddr, c.id);
      xml = setCellXml(xml, nameAddr, c.name);
      shrinkAddresses.push(noAddr, nameAddr);
    });

    // カードナンバー・名前欄のフォント・揃えを統一（見切れ・不揃い対策）
    xml = await applyUniformCellStyle(zip, xml, shrinkAddresses, cellMap.fontId);

    zip.file(sheetPath, xml);

    const out = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deck_${localStorage.getItem("playerName") || "unnamed"}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
  selectorId: "I11",
  fontId: 15,
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
  selectorId: "H4",
  mergeFix: "H4:I4",   // テンプレート側でセレクターID欄が結合されていないための補修
  fontId: 11,
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
  try {
    localStorage.setItem("currentDeck", JSON.stringify({ lrigDeck, mainBurst, mainNoBurst }));
  } catch (e) {
    console.error("デッキの自動保存に失敗しました", e);
  }
}

function loadCurrentDeckFromStorage() {
  let saved;
  try {
    saved = localStorage.getItem("currentDeck");
  } catch (e) {
    console.error("デッキの読み込みに失敗しました", e);
    return;
  }
  if (!saved) return;

  try {
    const data = JSON.parse(saved);
    lrigDeck = data.lrigDeck || [];
    mainBurst = data.mainBurst || [];
    mainNoBurst = data.mainNoBurst || [];

    sortDecks();
    renderDeckArea("lrig-deck", lrigDeck);
    renderDeckArea("main-burst", mainBurst);
    renderDeckArea("main-noburst", mainNoBurst);
  } catch (e) {
    console.error("保存されたデッキの読み込みに失敗しました", e);
  }
}

loadCurrentDeckFromStorage();
updateDeckCounts();

// =========================
// デッキを空にする
// =========================
document.getElementById("clear-deck-btn").onclick = () => {
  if (!confirm("デッキ内のカードをすべて空にします。よろしいですか？")) return;

  lrigDeck = [];
  mainBurst = [];
  mainNoBurst = [];

  refreshDeckDisplay();
};
// =========================
// デッキ内カード分布（円グラフ）
// =========================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 「サーバント #」はエナゾーンで全色を持つ特殊カードのため、
// 色の分布では「無」ではなく専用カテゴリ（金色）として扱う。
// レベルの分布からは除外し、その旨をメモとして表示する。
const SERVANT_CARD_NAME = "サーバント #";

function buildColorDistribution() {
  const cards = [...mainBurst, ...mainNoBurst];
  const buckets = {};
  let servantCount = 0;

  cards.forEach(c => {
    if (c.name === SERVANT_CARD_NAME) {
      servantCount++;
      return;
    }
    const key = c.color || "無";
    buckets[key] = (buckets[key] || 0) + 1;
  });

  const COLOR_HEX = {
    "白": "#f5f5f0",
    "青": "#2196f3",
    "赤": "#e53935",
    "黒": "#333333",
    "緑": "#43a047",
    "無": "#9e9e9e"
  };
  const MULTI_COLOR = "#8e6fce"; // 複数色の組み合わせ（例:白黒）用の中間色

  const data = Object.keys(buckets).map(key => ({
    label: key,
    value: buckets[key],
    color: COLOR_HEX[key] || MULTI_COLOR
  }));

  if (servantCount > 0) {
    // 金色でひと目で「特殊カテゴリ」と分かるようにする
    data.push({ label: SERVANT_CARD_NAME, value: servantCount, color: "#d4af37" });
  }

  return data;
}

function buildLevelDistribution() {
  const cards = [...mainBurst, ...mainNoBurst].filter(c => c.name !== SERVANT_CARD_NAME);
  const buckets = {};

  cards.forEach(c => {
    const key = c.level === "" ? "レベルなし" : c.level;
    buckets[key] = (buckets[key] || 0) + 1;
  });

  const LEVEL_PALETTE = {
    "0": "#b0bec5",
    "1": "#80cbc4",
    "2": "#ffb74d",
    "3": "#ba68c8",
    "4": "#f06292",
    "レベルなし": "#cfd8dc"
  };

  const order = ["0", "1", "2", "3", "4", "レベルなし"];
  return order
    .filter(k => buckets[k])
    .map(k => ({
      label: k === "レベルなし" ? k : `Lv${k}`,
      value: buckets[k],
      color: LEVEL_PALETTE[k]
    }));
}

function renderPieChart(data, title, note) {
  const size = 200;
  const radius = 80;
  const cx = size / 2;
  const cy = size / 2;

  const nonZero = data.filter(d => d.value > 0);
  const total = nonZero.reduce((s, d) => s + d.value, 0);

  let svgContent = "";

  if (total === 0) {
    svgContent = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#eee" stroke="#ccc"/>`;
  } else if (nonZero.length === 1) {
    svgContent = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${nonZero[0].color}" stroke="#999"/>`;
  } else {
    let startAngle = -Math.PI / 2;
    nonZero.forEach(d => {
      const angle = (d.value / total) * Math.PI * 2;
      const endAngle = startAngle + angle;
      const x1 = cx + radius * Math.cos(startAngle);
      const y1 = cy + radius * Math.sin(startAngle);
      const x2 = cx + radius * Math.cos(endAngle);
      const y2 = cy + radius * Math.sin(endAngle);
      const largeArc = angle > Math.PI ? 1 : 0;
      svgContent += `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${d.color}" stroke="#999" stroke-width="1"/>`;
      startAngle = endAngle;
    });
  }

  const legendHtml = nonZero
    .map(d => `<div class="stats-legend-item"><span class="stats-swatch" style="background:${d.color}"></span>${escapeHtml(d.label)}：${d.value}枚</div>`)
    .join("");

  return `
    <div class="stats-chart-block">
      <h4>${escapeHtml(title)}</h4>
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${svgContent}</svg>
      <div class="stats-legend">${legendHtml || "（該当カードなし）"}</div>
      ${note ? `<p class="stats-note">${escapeHtml(note)}</p>` : ""}
    </div>
  `;
}

function renderDeckStats() {
  const mainTotal = mainBurst.length + mainNoBurst.length;
  const servantCount = [...mainBurst, ...mainNoBurst].filter(c => c.name === SERVANT_CARD_NAME).length;

  const colorData = buildColorDistribution();
  const levelData = buildLevelDistribution();

  const container = document.getElementById("stats-container");
  container.innerHTML =
    `<p class="stats-summary">メインデッキ合計：${mainTotal}枚</p>` +
    renderPieChart(colorData, "色の分布", null) +
    renderPieChart(
      levelData,
      "レベルの分布",
      servantCount > 0 ? `「${SERVANT_CARD_NAME}」${servantCount}枚を除いて集計しています` : null
    );
}

document.getElementById("stats-btn").onclick = () => {
  renderDeckStats();
  document.getElementById("stats-modal").style.display = "block";
};

document.getElementById("close-stats").onclick = () => {
  document.getElementById("stats-modal").style.display = "none";
};
