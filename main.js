// =========================
// モーダル開閉共通処理
// 開いている間は背景を完全に固定し、スクロールが後ろのページに
// 漏れて引っかかるのを防ぐ
// =========================
let bodyScrollLockY = 0;
let modalOpenCount = 0;

function openModal(id) {
  if (modalOpenCount === 0) {
    bodyScrollLockY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${bodyScrollLockY}px`;
    document.body.style.width = "100%";
  }
  modalOpenCount++;
  document.getElementById(id).style.display = "block";
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
  modalOpenCount = Math.max(0, modalOpenCount - 1);
  if (modalOpenCount === 0) {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, bodyScrollLockY);
  }
}

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

 openModal("settings-modal");
};

document.getElementById("close-settings").onclick = () => {
  closeModal("settings-modal");
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

// =========================
// ブラウザ標準の画像長押しメニュー（保存・共有・拡大など）を無効化
// 長押しは自前のポップアップで処理するため、画像に対する標準動作を止める
// =========================
(function disableNativeImageLongPress() {
  const style = document.createElement("style");
  style.textContent = `
    .card-img, #card-preview-img, #quantity-card-img {
      -webkit-touch-callout: none; /* iOS: 長押しメニュー */
      -webkit-user-select: none;
      user-select: none;
      -webkit-user-drag: none;
    }
  `;
  document.head.appendChild(style);

  // Android Chrome 等の長押しメニュー・PCの右クリックメニュー
  document.addEventListener("contextmenu", (e) => {
    if (e.target && e.target.tagName === "IMG" && e.target.id !== "deck-image-preview") {
      e.preventDefault();
    }
  });

  // 画像のドラッグ開始（長押し→ドラッグ扱いになって pointercancel が飛ぶのを防ぐ）
  document.addEventListener("dragstart", (e) => {
    if (e.target && e.target.tagName === "IMG") e.preventDefault();
  });
})();

function renderCards(cards, searched) {
  const list = document.getElementById("card-list");
  list.innerHTML = "";

  const shown = cards.slice(0, MAX_RESULTS);

  shown.forEach(card => {
    // 画像＋「デッキ内の枚数」バッジを1組にして並べる
    const wrap = document.createElement("div");
    wrap.className = "card-wrap";
    wrap._card = card;

    const img = document.createElement("img");
    img.src = card.image;
    img.className = "card-img";
    img.loading = "lazy";

    attachSearchCardEvents(img, card);

    const badge = document.createElement("span");
    badge.className = "card-badge";
    badge.style.display = "none";

    wrap.appendChild(img);
    wrap.appendChild(badge);
    list.appendChild(wrap);
  });
  updateSearchBadges();

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
  openModal("card-preview-modal");
}

document.getElementById("close-card-preview").onclick = () => {
  closeModal("card-preview-modal");
};

// 初期表示は空。検索するまでカードを描画しない
renderCards([]);

// =========================
// 収録弾ドロップダウン
// カードID（例: WX26-P2-001）の末尾の連番を除いた部分を「収録弾コード」として扱う。
// 表示名を付けたい弾は SET_NAMES に追記する（無い弾はコードのみ表示）
// =========================
// 並びは新しい弾が上（ドロップダウンの表示順にも使う）
const SET_NAMES = {
  "WX26-P2": "CONFLICT SELECTOR",
  "WX26-P1": "Lostorage SELECTOR",
  "WX26-CP1": "プリンセッション・オーケストラ SELECTOR",
  "WX25-P3": "LUMINOUS SELECTOR",
  "WX25-P2": "RESONANCE SELECTOR",
  "WX25-P1": "PRIMAL SELECTOR",
  "WX25-CP1": "ブルーアーカイブ SELECTOR",
  "WX25-CD1": "デッキ ブルーアーカイブ",
  "WX24-P4": "FORTH SELECTOR",
  "WX24-P3": "REVERSAL SELECTOR",
  "WX24-P2": "loth SELECTOR",
  "WX24-P1": "RECOLLECT SELECTOR",
  "WX24-D5": "デッキ BLACK ALT DESIRE",
  "WX24-D4": "デッキ GREEN ALT WANNA",
  "WX24-D3": "デッキ BLUE ALT APPLI",
  "WX24-D2": "デッキ RED ALT AMBITION",
  "WX24-D1": "デッキ WHITE ALT HOPE",
  "WXDi-P16": "LEGENDARY DIVA",
  "WXDi-P15": "DIVISIONS DIVA",
  "WXDi-CP02": "ブルーアーカイブ DIVA",
  "WXDi-P14": "フェゾーネ DIVA with 電音部",
  "WXDi-P13": "CONCORD DIVA",
  "WXDi-P12": "DISSONANCE DIVA",
  "WXDi-CP01": "にじさんじ DIVA",
  "WXDi-D09": "デッキ SUPER DIVA DECK DOUBLE HEROINES -ピルルク＆ヒラナ-",
  "WXDi-P11": "REUNION DIVA",
  "WXDi-P10": "PRISMATIC DIVA",
  "WXDi-P09": "CONFLATED DIVA",
  "WXDi-P08": "SPREAD DIVA",
  "WXDi-P07": "WELCOME BACK DIVA ～Lostorage～",
  "WXDi-P06": "WELCOME BACK DIVA ～selector～",
  "WXDi-D08": "デッキ DIVA DEBUT DECK WHITE HOPE",
  "WXDi-P05": "CURIOSITY DIVA",
  "WXDi-P04": "VERTEX DIVA",
  "WXDi-D07": "デッキ TOP DIVA DECK D・X・M",
  "WXDi-P03": "STANDUP DIVA",
  "WXDi-P02": "CHANGING DIVA",
  "WXDi-P01": "GLOWING DIVA",
  "WXDi-D06": "デッキ DIVA DEBUT DECK DIAGRAM",
  "WXDi-D05": "デッキ DIVA DEBUT DECK うちゅうのはじまり",
  "WXDi-D04": "デッキ DIVA DEBUT DECK Card Jockey",
  "WXDi-D03": "デッキ DIVA DEBUT DECK No Limit",
  "WXDi-P00": "INTERLUDE DIVA",
  "WXDi-D02": "デッキ DIVA DEBUT DECK にじさんじ ver.さんばか",
  "WXDi-D01": "デッキ ANCIENT SURPRISE",
  "PR": "PRカード",
  "SP": "SPカード"
};

function getSetCode(card) {
  const code = String(card.id).replace(/-[^-]*$/, "");
  // SPDi01 / SPDi43 / SP38 など、SP始まりのプロモ系は「SP」にまとめる
  return /^SP/.test(code) ? "SP" : code;
}

(function setupSetFilter() {
  const panel = document.getElementById("advanced-search-panel");
  if (!panel || document.getElementById("filter-set")) return;

  // card_info.js に実在する収録弾だけを、SET_NAMES の並び（新しい弾が先）で表示する。
  // SET_NAMES に無い弾は、card_info.js の初出順で末尾に並べる
  const present = [];
  const seen = new Set();
  allCards.forEach(c => {
    const code = getSetCode(c);
    if (!seen.has(code)) {
      seen.add(code);
      present.push(code);
    }
  });
  const known = Object.keys(SET_NAMES).filter(code => seen.has(code));
  const unknown = present.filter(code => !(code in SET_NAMES));
  const codes = [...known, ...unknown];

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "margin:6px 0;";

  const label = document.createElement("label");
  label.textContent = "収録弾：";

  const select = document.createElement("select");
  select.id = "filter-set";

  const all = document.createElement("option");
  all.value = "";
  all.textContent = "すべて";
  select.appendChild(all);

  codes.forEach(code => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = SET_NAMES[code] ? `${code} ${SET_NAMES[code]}` : code;
    select.appendChild(opt);
  });

  select.onchange = runSearch;
  label.appendChild(select);
  wrapper.appendChild(label);

  // 「クリア」ボタンの直前（パネル直下の要素の前）に差し込む
  let anchor = document.getElementById("clear-advanced-search");
  while (anchor && anchor.parentNode !== panel) anchor = anchor.parentNode;
  panel.insertBefore(wrapper, anchor || null);
})();

// 詳細検索の条件を取得
function getAdvancedFilters() {
  const setEl = document.getElementById("filter-set");
  return {
    set: setEl ? setEl.value : "",
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
  return !!(f.set || f.name || f.type || f.level || f.color || f.cls || f.timing || f.burst || f.text);
}

// カードが詳細検索条件（AND）に合致するか
function matchesAdvancedFilters(card, f) {
  if (f.set && getSetCode(card) !== f.set) return false;
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
  const setEl = document.getElementById("filter-set");
  if (setEl) setEl.value = "";
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

// 元に戻す／やり直す用の履歴（デッキの状態のスナップショット）
const UNDO_LIMIT = 50;
let undoStack = [];
let redoStack = [];
let lastDeckSnapshot = null;
let restoringDeck = false;

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
  recordDeckHistory();
  updateSearchBadges();
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

// =========================
// 長押し時の「枚数選択」ポップアップ
// 全部で何枚入れるか（0〜4枚）をドロップダウンで選び、OKでその枚数に揃える
// ポップアップのHTMLはJSから生成するので、index.html / CSS の変更は不要
// =========================
const MAX_COPIES = 4;
let quantityModalEl = null;
let quantityTargetCard = null;
let quantityOpenedAt = 0;

function buildQuantityModal() {
  const overlay = document.createElement("div");
  overlay.id = "quantity-modal";
  overlay.style.cssText =
    "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;";

  const box = document.createElement("div");
  box.style.cssText =
    "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);" +
    "background:#fff;color:#222;border-radius:12px;padding:16px;" +
    "width:min(86vw,300px);box-sizing:border-box;text-align:center;" +
    "box-shadow:0 4px 20px rgba(0,0,0,0.4);";

  const img = document.createElement("img");
  img.id = "quantity-card-img";
  img.style.cssText = "width:110px;max-width:40%;border-radius:6px;margin-bottom:8px;";

  const title = document.createElement("div");
  title.id = "quantity-title";
  title.style.cssText = "font-weight:bold;margin-bottom:12px;word-break:break-all;";

  const label = document.createElement("label");
  label.style.cssText = "display:block;margin-bottom:14px;";
  label.appendChild(document.createTextNode("デッキに入れる枚数："));

  const select = document.createElement("select");
  select.id = "quantity-select";
  select.style.cssText = "font-size:16px;padding:6px 10px;";
  for (let i = 0; i <= MAX_COPIES; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = i === 0 ? "0枚（デッキから外す）" : `${i}枚`;
    select.appendChild(opt);
  }
  label.appendChild(select);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:10px;justify-content:center;";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "キャンセル";
  cancelBtn.onclick = closeQuantityModal;

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "OK";
  okBtn.onclick = () => {
    const total = parseInt(select.value, 10);
    const card = quantityTargetCard;
    closeQuantityModal();
    if (card) setMainCopies(card, total);
  };

  [cancelBtn, okBtn].forEach(b => {
    b.style.cssText = "flex:1;font-size:15px;padding:8px 0;";
  });

  btnRow.append(cancelBtn, okBtn);
  box.append(img, title, label, btnRow);
  overlay.appendChild(box);

  // 背景タップで閉じる（長押しした指を離した瞬間の誤クローズを防ぐため、開いた直後は無視）
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && Date.now() - quantityOpenedAt > 400) {
      closeQuantityModal();
    }
  });

  document.body.appendChild(overlay);
  return overlay;
}

function closeQuantityModal() {
  if (!quantityModalEl || quantityModalEl.style.display === "none") return;
  closeModal("quantity-modal");
  quantityTargetCard = null;
}

// 長押し時に呼ばれる（旧：prompt で枚数入力）
function promptAddMore(card) {
  if (!quantityModalEl) quantityModalEl = buildQuantityModal();

  const currentTotal = countByName(mainBurst, card.name) + countByName(mainNoBurst, card.name);

  quantityTargetCard = card;
  quantityOpenedAt = Date.now();
  document.getElementById("quantity-card-img").src = card.image;
  document.getElementById("quantity-title").textContent = card.name;
  document.getElementById("quantity-select").value = String(Math.min(currentTotal, MAX_COPIES));

  openModal("quantity-modal");
}

// 同名カードの合計枚数が total 枚になるよう、追加または削除する
function setMainCopies(card, total) {
  const currentTotal = countByName(mainBurst, card.name) + countByName(mainNoBurst, card.name);

  if (total > currentTotal) {
    const target = card.burst ? mainBurst : mainNoBurst;
    for (let i = currentTotal; i < total; i++) {
      target.push(card);
    }
  } else if (total < currentTotal) {
    // 末尾の同名カードから順に取り除く
    let toRemove = currentTotal - total;
    for (const arr of [mainNoBurst, mainBurst]) {
      for (let i = arr.length - 1; i >= 0 && toRemove > 0; i--) {
        if (arr[i].name === card.name) {
          arr.splice(i, 1);
          toRemove--;
        }
      }
    }
  } else {
    return; // 変更なし
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
  openModal("text-output-modal");

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
};

document.getElementById("close-text-output").onclick = () => {
  closeModal("text-output-modal");
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

// =========================
// デッキ構築チェック（保存時のみ）
// 組んでいる最中は警告を出さない。保存しようとしたときに問題があれば確認を出し、
// 「このまま保存」するかどうかを選べる（保存自体は止めない）。
// 枚数の不足は警告せず、保存済みデッキの一覧に「構築途中」と表示する。
// =========================
const MAIN_DECK_SIZE = 40;      // メインデッキの枚数
const BURST_DECK_SIZE = 20;     // ライフバースト有・無それぞれの枚数
const SERVANT_REQUIRED = 4;     // 「サーバント #」の必須枚数
const LRIG_NON_PIECE_SIZE = 10; // ルリグデッキ（ピースを除く）の枚数
const LRIG_TOTAL_MAX = 12;      // ルリグデッキ全体の上限（Excel出力の枠が12枚分）

function isPieceCard(card) {
  return String(card.type || "").includes("ピース");
}

// card_info.js の BAN 列に数字が入っているカードは「その枚数まで」の制限カード
// （例: "2" → 2枚まで）。制限がなければ null
function getBanLimit(card) {
  const n = parseInt(card.ban, 10);
  return /^\d+$/.test(String(card.ban || "").trim()) ? n : null;
}

// 1枚のカードをデッキに入れられる上限
function getCopyLimit(card) {
  if (isLrigDeckCard(card)) return 1;
  const ban = getBanLimit(card);
  return ban !== null ? Math.min(ban, MAX_COPIES) : MAX_COPIES;
}

// 保存データ（または現在のデッキ）から枚数の状況をまとめる
function summarizeDeck(deck) {
  const lrig = deck.lrigDeck || [];
  const burst = deck.mainBurst || [];
  const noBurst = deck.mainNoBurst || [];
  const main = [...burst, ...noBurst];

  return {
    mainTotal: main.length,
    burstCount: burst.length,
    noBurstCount: noBurst.length,
    servantCount: main.filter(c => c.name === SERVANT_CARD_NAME).length,
    lrigTotal: lrig.length,
    lrigNonPiece: lrig.filter(c => !isPieceCard(c)).length
  };
}

// 保存前に確認するべき問題の一覧（空なら問題なし）
function collectSaveWarnings(deck) {
  const d = summarizeDeck(deck);
  const warnings = [];

  if (d.servantCount < SERVANT_REQUIRED) {
    warnings.push(`「${SERVANT_CARD_NAME}」が${d.servantCount}枚です（${SERVANT_REQUIRED}枚入れるのが基本です）`);
  }
  if (d.mainTotal > MAIN_DECK_SIZE) {
    warnings.push(`メインデッキが${d.mainTotal}枚です（${MAIN_DECK_SIZE}枚を超えています）`);
  }
  if (d.burstCount > BURST_DECK_SIZE) {
    warnings.push(`ライフバースト有が${d.burstCount}枚です（${BURST_DECK_SIZE}枚を超えています）`);
  }
  if (d.noBurstCount > BURST_DECK_SIZE) {
    warnings.push(`ライフバースト無が${d.noBurstCount}枚です（${BURST_DECK_SIZE}枚を超えています）`);
  }
  // 40枚そろっているのにLB有が20枚でないときだけ警告（途中の段階では出さない）
  if (d.mainTotal === MAIN_DECK_SIZE && d.burstCount < BURST_DECK_SIZE) {
    warnings.push(`メインデッキは${MAIN_DECK_SIZE}枚ですが、ライフバースト有が${d.burstCount}枚です（${BURST_DECK_SIZE}枚が基本です）`);
  }
  // 制限カード（BAN列に枚数が入っているカード）の超過
  const banCounts = new Map();
  [...(deck.mainBurst || []), ...(deck.mainNoBurst || [])].forEach(c => {
    if (getBanLimit(c) === null) return;
    banCounts.set(c.name, (banCounts.get(c.name) || { card: c, count: 0 }));
    banCounts.get(c.name).count++;
  });
  banCounts.forEach(({ card, count }) => {
    const limit = getBanLimit(card);
    if (count > limit) {
      warnings.push(`制限カード「${card.name}」が${count}枚です（${limit}枚までです）`);
    }
  });

  if (d.lrigNonPiece > LRIG_NON_PIECE_SIZE) {
    warnings.push(`ルリグデッキ（ピースを除く）が${d.lrigNonPiece}枚です（${LRIG_NON_PIECE_SIZE}枚を超えています）`);
  }
  if (d.lrigTotal > LRIG_TOTAL_MAX) {
    warnings.push(`ルリグデッキが全体で${d.lrigTotal}枚です（${LRIG_TOTAL_MAX}枚を超えています）`);
  }

  return warnings;
}

// 問題があれば確認ダイアログを出す。保存してよければ true
function confirmDeckBeforeSave(deck) {
  const warnings = collectSaveWarnings(deck);
  if (warnings.length === 0) return true;
  return confirm(`保存前の確認\n\n${warnings.map(w => `・${w}`).join("\n")}\n\nこのまま保存しますか？`);
}

// 保存済みデッキの一覧に出す状態表示（構築途中かどうか）
function deckStatusChips(deck) {
  const d = summarizeDeck(deck);
  const chips = [];

  if (d.mainTotal !== MAIN_DECK_SIZE) {
    chips.push({ ok: false, text: `⚠ 構築途中：メイン${d.mainTotal}/${MAIN_DECK_SIZE}枚` });
  }
  if (d.lrigNonPiece < LRIG_NON_PIECE_SIZE) {
    chips.push({ ok: false, text: `⚠ 構築途中：ルリグ${d.lrigNonPiece}/${LRIG_NON_PIECE_SIZE}枚（ピース除く）` });
  }
  if (chips.length === 0) {
    chips.push({ ok: true, text: "✓ 枚数OK" });
  }
  return chips;
}

let deckTagFilter = "";

// カンマ・読点・空白で区切ってタグの配列にする（重複は除く）
function parseTags(str) {
  const tags = String(str || "")
    .split(/[,、，\s]+/)
    .map(t => t.trim())
    .filter(Boolean);
  return [...new Set(tags)];
}

function renderDeckList() {
  const decks = getSavedDecks();
  const listEl = document.getElementById("deck-list");
  listEl.innerHTML = "";

  // タグ絞り込みの選択肢を作り直す
  const allTags = [...new Set(Object.values(decks).flatMap(d => d.tags || []))];
  if (deckTagFilter && !allTags.includes(deckTagFilter)) deckTagFilter = "";

  const filterEl = document.getElementById("deck-tag-filter");
  if (filterEl) {
    filterEl.innerHTML = "";
    filterEl.appendChild(new Option("すべてのタグ", ""));
    allTags.forEach(t => filterEl.appendChild(new Option(t, t)));
    filterEl.value = deckTagFilter;
    filterEl.style.display = allTags.length > 0 ? "" : "none";
  }

  const allNames = Object.keys(decks);
  if (allNames.length === 0) {
    const li = document.createElement("li");
    li.textContent = "（保存されたデッキはありません）";
    listEl.appendChild(li);
    return;
  }

  const names = allNames.filter(n => !deckTagFilter || (decks[n].tags || []).includes(deckTagFilter));
  if (names.length === 0) {
    const li = document.createElement("li");
    li.textContent = "（このタグのデッキはありません）";
    listEl.appendChild(li);
    return;
  }

  names.forEach(name => {
    const li = document.createElement("li");
    const deck = decks[name];

    const label = document.createElement("span");
    label.textContent = name;
    li.appendChild(label);

    // 構築状況（メイン40枚・ルリグデッキの枚数）
    const statusRow = document.createElement("div");
    statusRow.className = "deck-meta";
    deckStatusChips(deck).forEach(chip => {
      const el = document.createElement("small");
      el.className = `deck-status ${chip.ok ? "ok" : "warn"}`;
      el.textContent = chip.text;
      statusRow.appendChild(el);
    });
    li.appendChild(statusRow);

    // タグ・メモの表示
    const tags = deck.tags || [];
    if (tags.length > 0 || deck.memo) {
      const meta = document.createElement("div");
      meta.className = "deck-meta";

      tags.forEach(tag => {
        const chip = document.createElement("small");
        chip.className = "deck-tag";
        chip.textContent = tag;
        chip.onclick = () => {
          deckTagFilter = tag;
          renderDeckList();
        };
        meta.appendChild(chip);
      });

      if (deck.memo) {
        const memo = document.createElement("div");
        memo.className = "deck-memo";
        memo.textContent = deck.memo;
        meta.appendChild(memo);
      }
      li.appendChild(meta);
    }

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "読み込む";
    loadBtn.onclick = () => loadDeck(name);

    const overwriteBtn = document.createElement("button");
    overwriteBtn.textContent = "上書き";
    overwriteBtn.onclick = () => {
      if (!confirm(`「${name}」に上書き保存します。よろしいですか？`)) return;
      if (!confirmDeckBeforeSave({ lrigDeck, mainBurst, mainNoBurst })) return;

      const d = getSavedDecks();
      // メモ・タグは残したまま、デッキの中身だけ更新する
      d[name] = {
        ...d[name],
        lrigDeck,
        mainBurst,
        mainNoBurst,
        savedAt: new Date().toISOString()
      };
      setSavedDecks(d);
      alert(`「${name}」を上書き保存しました`);
      renderDeckList();
    };

    const metaBtn = document.createElement("button");
    metaBtn.textContent = "メモ・タグ";
    metaBtn.onclick = () => openDeckMeta(name);

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

    li.appendChild(loadBtn);
    li.appendChild(overwriteBtn);
    li.appendChild(metaBtn);
    li.appendChild(delBtn);
    listEl.appendChild(li);
  });
}

document.getElementById("deck-tag-filter").onchange = (e) => {
  deckTagFilter = e.target.value;
  renderDeckList();
};

// =========================
// メモ・タグの編集
// =========================
let editingMetaName = null;

function openDeckMeta(name) {
  const deck = getSavedDecks()[name];
  if (!deck) return;

  editingMetaName = name;
  document.getElementById("deck-meta-title").textContent = `「${name}」のメモ・タグ`;
  document.getElementById("deck-meta-tags").value = (deck.tags || []).join(", ");
  document.getElementById("deck-meta-memo").value = deck.memo || "";
  openModal("deck-meta-modal");
}

document.getElementById("deck-meta-save").onclick = () => {
  const decks = getSavedDecks();
  const deck = decks[editingMetaName];
  if (!deck) {
    closeModal("deck-meta-modal");
    return;
  }

  deck.tags = parseTags(document.getElementById("deck-meta-tags").value);
  deck.memo = document.getElementById("deck-meta-memo").value.trim();
  setSavedDecks(decks);

  closeModal("deck-meta-modal");
  renderDeckList();
};

document.getElementById("deck-meta-close").onclick = () => {
  closeModal("deck-meta-modal");
};

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

  closeModal("deck-manager-modal");
  alert(`「${name}」を読み込みました`);
}

document.getElementById("save-btn").onclick = () => {
  renderDeckList();
  openModal("deck-manager-modal");
};

document.getElementById("deck-save-confirm").onclick = () => {
  const name = document.getElementById("deck-save-name").value.trim();
  if (!name) {
    alert("デッキ名を入力してください");
    return;
  }

  if (!confirmDeckBeforeSave({ lrigDeck, mainBurst, mainNoBurst })) return;

  const tagsInput = document.getElementById("deck-save-tags").value;
  const memoInput = document.getElementById("deck-save-memo").value.trim();

  const decks = getSavedDecks();
  const previous = decks[name] || {};
  decks[name] = {
    lrigDeck,
    mainBurst,
    mainNoBurst,
    // 同名で保存し直すとき、入力欄が空なら以前のタグ・メモを引き継ぐ
    tags: tagsInput.trim() ? parseTags(tagsInput) : (previous.tags || []),
    memo: memoInput || previous.memo || "",
    savedAt: new Date().toISOString()
  };
  setSavedDecks(decks);

  document.getElementById("deck-save-name").value = "";
  document.getElementById("deck-save-tags").value = "";
  document.getElementById("deck-save-memo").value = "";
  renderDeckList();
  alert(`「${name}」として保存しました`);
};

document.getElementById("close-deck-manager").onclick = () => {
  closeModal("deck-manager-modal");
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
  openModal("export-modal");
};

document.getElementById("close-export-modal").onclick = () => {
  closeModal("export-modal");
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
  const defaultName = `deck_${localStorage.getItem("playerName") || "unnamed"}`;
  const inputName = prompt("出力するファイル名を入力してください（拡張子は不要です）", defaultName);
  if (inputName === null) return; // キャンセル時は何もしない

  // ファイル名に使えない記号を安全な文字に置き換える
  const safeName = (inputName.trim() || defaultName).replace(/[\\/:*?"<>|]/g, "_");

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
    a.download = `${safeName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    closeModal("export-modal");
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
lastDeckSnapshot = snapshotDeck(); // 起動時の状態を「元に戻す」の起点にする
updateUndoButtons();

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
  openModal("stats-modal");
};

document.getElementById("close-stats").onclick = () => {
  closeModal("stats-modal");
};


// =========================
// 検索結果カードの「デッキ内の枚数」バッジ
// 同名カードの合計枚数を表示する（メイン4枚／ルリグデッキ1枚が上限）
// =========================
function deckCountForCard(card) {
  if (isLrigDeckCard(card)) {
    return countByName(lrigDeck, card.name);
  }
  return countByName(mainBurst, card.name) + countByName(mainNoBurst, card.name);
}

function updateSearchBadges() {
  document.querySelectorAll("#card-list .card-wrap").forEach(wrap => {
    const card = wrap._card;
    const badge = wrap.querySelector(".card-badge");
    if (!card || !badge) return;

    const count = deckCountForCard(card);
    const max = getCopyLimit(card);

    badge.style.display = count > 0 ? "" : "none";
    badge.textContent = `×${count}`;
    badge.classList.toggle("full", count >= max);
  });
}

// =========================
// 元に戻す（Undo）／やり直す（Redo）
// refreshDeckDisplay() のたびに前回との差を見て履歴に積むので、
// 追加・削除・枚数指定・空にする・読み込みなど、すべての操作が対象になる
// =========================
function snapshotDeck() {
  return {
    lrigDeck: [...lrigDeck],
    mainBurst: [...mainBurst],
    mainNoBurst: [...mainNoBurst]
  };
}

function sameCardList(a, b) {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

function sameDeckState(a, b) {
  return sameCardList(a.lrigDeck, b.lrigDeck) &&
    sameCardList(a.mainBurst, b.mainBurst) &&
    sameCardList(a.mainNoBurst, b.mainNoBurst);
}

function recordDeckHistory() {
  const current = snapshotDeck();

  if (!restoringDeck && lastDeckSnapshot && !sameDeckState(current, lastDeckSnapshot)) {
    undoStack.push(lastDeckSnapshot);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = []; // 新しい操作をしたら、やり直しの履歴は破棄
  }

  lastDeckSnapshot = current;
  updateUndoButtons();
}

function restoreDeckSnapshot(snapshot) {
  restoringDeck = true;
  lrigDeck = [...snapshot.lrigDeck];
  mainBurst = [...snapshot.mainBurst];
  mainNoBurst = [...snapshot.mainNoBurst];
  refreshDeckDisplay();
  restoringDeck = false;
}

function undoDeck() {
  if (undoStack.length === 0) return;
  redoStack.push(snapshotDeck());
  restoreDeckSnapshot(undoStack.pop());
}

function redoDeck() {
  if (redoStack.length === 0) return;
  undoStack.push(snapshotDeck());
  restoreDeckSnapshot(redoStack.pop());
}

function updateUndoButtons() {
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

document.getElementById("undo-btn").onclick = undoDeck;
document.getElementById("redo-btn").onclick = redoDeck;

// PC用ショートカット（Ctrl/Cmd+Z で元に戻す、Ctrl/Cmd+Y または Shift+Z でやり直す）
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) {
    e.preventDefault();
    undoDeck();
  } else if (key === "y" || (key === "z" && e.shiftKey)) {
    e.preventDefault();
    redoDeck();
  }
});

// =========================
// デッキ画像の書き出し（PNG）
// カード画像を canvas に描いて1枚の画像にする。
// 画像サーバー側が他サイトからの読み込み（CORS）を許可していない場合は、
// そのカードだけ「カード名のタイル」で代替する。
// 画像を確実に載せたい場合は、CARD_IMAGE_PROXY に画像中継サーバーのURLを設定する
// （例: "https://xxxx.workers.dev/?url=" ← 末尾に元画像のURLがエンコードされて付く）
// =========================
const CARD_IMAGE_PROXY = "";

const IMG_COLS = 10;
const IMG_TILE_W = 150;
const IMG_TILE_H = 210;
const IMG_GAP = 10;
const IMG_MARGIN = 30;
const IMG_FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';

const CARD_TILE_FILL = {
  "白": "#f5f5f0",
  "青": "#bbdefb",
  "赤": "#ffcdd2",
  "黒": "#9e9e9e",
  "緑": "#c8e6c9",
  "無": "#e0e0e0"
};

let deckImageBlob = null;
let deckImageUrl = null;
let deckImageFileName = "wixoss_deck.png";

// 同じカード(ID)をまとめて「カード＋枚数」の配列にする（並び順は維持）
function groupDeckCards(cards) {
  const map = new Map();
  cards.forEach(c => {
    if (!map.has(c.id)) map.set(c.id, { card: c, count: 0 });
    map.get(c.id).count++;
  });
  return [...map.values()];
}

function loadCardImageForCanvas(card) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = CARD_IMAGE_PROXY
      ? CARD_IMAGE_PROXY + encodeURIComponent(card.image)
      : card.image;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapTextLines(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const ch of String(text)) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// 画像を取得できなかったカードの代替タイル
function drawTextTile(ctx, x, y, w, h, card) {
  const colorKey = Object.keys(CARD_TILE_FILL).find(k => (card.color || "").includes(k));
  roundRectPath(ctx, x, y, w, h, 8);
  ctx.fillStyle = CARD_TILE_FILL[colorKey] || "#eeeeee";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#888";
  ctx.stroke();

  ctx.fillStyle = "#222";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = `bold 18px ${IMG_FONT}`;
  const lines = wrapTextLines(ctx, card.name, w - 20).slice(0, 5);
  const lineH = 24;
  const startY = y + h / 2 - ((lines.length - 1) * lineH) / 2 + 6;
  lines.forEach((line, i) => ctx.fillText(line, x + w / 2, startY + i * lineH));

  ctx.font = `12px ${IMG_FONT}`;
  ctx.fillStyle = "#555";
  ctx.fillText(card.id, x + w / 2, y + 16); // 下側は枚数バッジと重なるので上に置く
}

async function renderDeckImage(title) {
  const sections = [
    { title: "ルリグデッキ", cards: lrigDeck },
    { title: "メインデッキ（ライフバースト有）", cards: mainBurst },
    { title: "メインデッキ（ライフバースト無）", cards: mainNoBurst }
  ]
    .filter(sec => sec.cards.length > 0)
    .map(sec => ({ ...sec, items: groupDeckCards(sec.cards) }));

  if (sections.length === 0) return null;

  // 画像を先にまとめて読み込む（取得できなかったものは null のまま代替表示）
  const uniqueCards = new Map();
  sections.forEach(sec => sec.items.forEach(it => uniqueCards.set(it.card.id, it.card)));

  const images = new Map();
  let failed = 0;
  await Promise.all([...uniqueCards.values()].map(async card => {
    const img = await loadCardImageForCanvas(card);
    if (img) images.set(card.id, img);
    else failed++;
  }));

  // レイアウト計算
  const W = IMG_TILE_W, H = IMG_TILE_H, GAP = IMG_GAP, M = IMG_MARGIN;
  const width = M * 2 + IMG_COLS * W + (IMG_COLS - 1) * GAP;
  const HEADER_H = 110;
  const SECTION_TITLE_H = 46;
  const SECTION_GAP = 16;

  let height = M + HEADER_H;
  sections.forEach(sec => {
    const rows = Math.ceil(sec.items.length / IMG_COLS);
    sec.rows = rows;
    height += SECTION_TITLE_H + rows * (H + GAP) - GAP + SECTION_GAP;
  });
  height += M - SECTION_GAP;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // ヘッダー
  const name = localStorage.getItem("playerName") || "";
  const lrig = localStorage.getItem("centerLrig") || "";
  const subParts = [];
  if (name && name !== "未設定") subParts.push(name);
  if (lrig && lrig !== "未設定") subParts.push(`使用ルリグ：${lrig}`);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#222";
  ctx.font = `bold 44px ${IMG_FONT}`;
  ctx.fillText(title || "WIXOSS デッキ", M, M + 44);

  ctx.font = `22px ${IMG_FONT}`;
  ctx.fillStyle = "#555";
  if (subParts.length > 0) ctx.fillText(subParts.join("　/　"), M, M + 82);

  const mainTotal = mainBurst.length + mainNoBurst.length;
  ctx.textAlign = "right";
  ctx.fillText(
    `メイン ${mainTotal}枚（LB有 ${mainBurst.length} / LB無 ${mainNoBurst.length}）`,
    width - M, M + 44
  );
  const d = new Date();
  ctx.fillText(
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`,
    width - M, M + 82
  );

  ctx.strokeStyle = "#2196f3";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(M, M + HEADER_H - 14);
  ctx.lineTo(width - M, M + HEADER_H - 14);
  ctx.stroke();

  // 各セクション
  let y = M + HEADER_H;
  sections.forEach(sec => {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#222";
    ctx.font = `bold 26px ${IMG_FONT}`;
    ctx.fillText(`◆ ${sec.title}　${sec.cards.length}枚`, M, y + 32);
    y += SECTION_TITLE_H;

    sec.items.forEach((it, i) => {
      const col = i % IMG_COLS;
      const row = Math.floor(i / IMG_COLS);
      const x = M + col * (W + GAP);
      const ty = y + row * (H + GAP);

      const img = images.get(it.card.id);
      if (img) {
        ctx.save();
        roundRectPath(ctx, x, ty, W, H, 8);
        ctx.clip();
        ctx.drawImage(img, x, ty, W, H);
        ctx.restore();
        roundRectPath(ctx, x, ty, W, H, 8);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#bbb";
        ctx.stroke();
      } else {
        drawTextTile(ctx, x, ty, W, H, it.card);
      }

      // 2枚以上のカードには枚数バッジ
      if (it.count > 1) {
        const bx = x + W - 30;
        const by = ty + H - 30;
        ctx.beginPath();
        ctx.arc(bx, by, 24, 0, Math.PI * 2);
        ctx.fillStyle = "#e53935";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = `bold 24px ${IMG_FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`×${it.count}`, bx, by + 1);
      }
    });

    y += sec.rows * (H + GAP) - GAP + SECTION_GAP;
  });

  return { canvas, failed, total: uniqueCards.size };
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
    } catch (e) {
      reject(e);
    }
  });
}

function resetDeckImageModal() {
  if (deckImageUrl) URL.revokeObjectURL(deckImageUrl);
  deckImageUrl = null;
  deckImageBlob = null;

  const preview = document.getElementById("deck-image-preview");
  preview.style.display = "none";
  preview.removeAttribute("src");
  document.getElementById("deck-image-actions").style.display = "none";
  document.getElementById("deck-image-status").textContent = "";
}

document.getElementById("export-image-btn").onclick = () => {
  closeModal("export-modal");
  resetDeckImageModal();
  document.getElementById("deck-image-title").value = localStorage.getItem("deckImageTitle") || "";
  openModal("deck-image-modal");
};

document.getElementById("deck-image-create").onclick = async () => {
  const btn = document.getElementById("deck-image-create");
  const status = document.getElementById("deck-image-status");
  const title = document.getElementById("deck-image-title").value.trim();

  if (lrigDeck.length + mainBurst.length + mainNoBurst.length === 0) {
    status.textContent = "デッキにカードが入っていません。";
    return;
  }

  localStorage.setItem("deckImageTitle", title);
  resetDeckImageModal();
  btn.disabled = true;
  status.textContent = "画像を作成中です…";

  try {
    const result = await renderDeckImage(title);
    const blob = await canvasToBlob(result.canvas);

    deckImageBlob = blob;
    deckImageUrl = URL.createObjectURL(blob);
    const safeTitle = (title || "wixoss_deck").replace(/[\\/:*?"<>|]/g, "_");
    deckImageFileName = `${safeTitle}.png`;

    const preview = document.getElementById("deck-image-preview");
    preview.src = deckImageUrl;
    preview.style.display = "block";
    document.getElementById("deck-image-actions").style.display = "block";

    // 共有に対応した端末（主にスマホ）だけ「共有」ボタンを出す
    const shareBtn = document.getElementById("deck-image-share");
    const file = new File([blob], deckImageFileName, { type: "image/png" });
    shareBtn.style.display =
      navigator.canShare && navigator.canShare({ files: [file] }) ? "" : "none";

    status.textContent = result.failed > 0
      ? `作成しました。${result.failed}種類のカードは画像を取得できなかったため、カード名の表示で代替しています。`
      : "作成しました。";
  } catch (err) {
    console.error(err);
    status.textContent = "画像の作成に失敗しました。コンソールを確認してください。";
  } finally {
    btn.disabled = false;
  }
};

document.getElementById("deck-image-save").onclick = () => {
  if (!deckImageUrl) return;
  const a = document.createElement("a");
  a.href = deckImageUrl;
  a.download = deckImageFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

document.getElementById("deck-image-share").onclick = async () => {
  if (!deckImageBlob) return;
  const file = new File([deckImageBlob], deckImageFileName, { type: "image/png" });
  try {
    await navigator.share({ files: [file], title: deckImageFileName.replace(/\.png$/, "") });
  } catch (err) {
    // 共有をキャンセルした場合も含め、何もしない
    if (err && err.name !== "AbortError") console.error(err);
  }
};

document.getElementById("close-deck-image").onclick = () => {
  closeModal("deck-image-modal");
  resetDeckImageModal();
};


// =========================
// 初手チェック
// デッキを40枚（メインデッキ）としてシャッフルし、
//   1. 初手5枚を引く
//   2. マリガン（手札から好きな枚数をデッキに戻して同じ枚数を引き直す）をするか選ぶ
//   3. ライフクロス7枚を展開する
// の順に進め、ライフクロスに「ダメージを止められるLB」が何枚埋まるかを
// 実際の展開と、確定した手札を前提にした確率（超幾何分布）で表示する。
// =========================
const OPENING_HAND_SIZE = 5;
const OPENING_LIFE_SIZE = 7;
const LB_OVERRIDE_KEY = "lbStopperOverrides";

// 「ダメージを止められるLB」の自動判定ルール（LBテキストの文言で判定）
//   ダメージ無効 : 「ダメージを受けない」「代わりに〜（デッキをトラッシュ等）」など
//   アタック無効 : 「アタックを無効にする」など
//   バニッシュ   : 対戦相手のシグニなどをバニッシュ
//   ダウン       : 対戦相手のシグニなどをダウン（「ダウンし凍結する」を含む）
//   アタック不可 : 「アタックできない」を与える
// ※ 凍結だけのものは数えない。判定が違うものは画面の「LB判定の確認・修正」で直せる。
const LB_STOPPER_RULES = [
  { tag: "ダメージ無効", test: t => /ダメージ/.test(t) && /(受けない|代わりに|与えられない|受けず)/.test(t) },
  { tag: "アタック無効", test: t => /アタック.{0,3}を?無効/.test(t) || /アタックフェイズ.{0,6}終了/.test(t) },
  { tag: "バニッシュ", test: t => /対戦相手.{0,60}バニッシュ/.test(t) },
  { tag: "ダウン", test: t => /対戦相手.{0,60}ダウン/.test(t) },
  { tag: "アタック不可", test: t => /アタック(する)?(こと)?(が)?できない/.test(t) }
];

// カードテキストからライフバースト部分だけを取り出す
function getLifeBurstText(card) {
  const plain = String(card.text || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ");
  const i = plain.indexOf("【ライフバースト】");
  return i < 0 ? "" : plain.slice(i).trim();
}

const lbAnalysisCache = new Map();

function analyzeLifeBurst(card) {
  if (lbAnalysisCache.has(card.id)) return lbAnalysisCache.get(card.id);
  const text = getLifeBurstText(card);
  const tags = LB_STOPPER_RULES.filter(rule => rule.test(text)).map(rule => rule.tag);
  const result = { text, tags, auto: tags.length > 0 };
  lbAnalysisCache.set(card.id, result);
  return result;
}

// 手動で直した判定（カード名 → true/false）
function loadLbOverrides() {
  try {
    const o = JSON.parse(localStorage.getItem(LB_OVERRIDE_KEY) || "{}");
    return o && typeof o === "object" ? o : {};
  } catch (e) {
    return {};
  }
}

function saveLbOverrides(overrides) {
  localStorage.setItem(LB_OVERRIDE_KEY, JSON.stringify(overrides));
}

function isStopperLB(card, overrides) {
  const o = (overrides || loadLbOverrides())[card.name];
  return typeof o === "boolean" ? o : analyzeLifeBurst(card).auto;
}

// ---- 確率計算 ----
function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

// N枚のうち当たりがK枚あるとき、n枚引いて当たりがk枚出る確率（k = 0..n）
function hypergeometricDist(N, K, n) {
  const total = combinations(N, n);
  const dist = [];
  for (let k = 0; k <= n; k++) {
    if (k > K || n - k > N - K) dist.push(0);
    else dist.push((combinations(K, k) * combinations(N - K, n - k)) / total);
  }
  return dist;
}

// ---- 展開の状態 ----
let openingState = null;

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildOpeningEntries() {
  const overrides = loadLbOverrides();
  return [
    ...mainBurst.map(card => ({ card, lb: true, stopper: isStopperLB(card, overrides) })),
    ...mainNoBurst.map(card => ({ card, lb: false, stopper: false }))
  ];
}

function startOpening() {
  const entries = buildOpeningEntries();
  if (entries.length < OPENING_HAND_SIZE + OPENING_LIFE_SIZE) {
    openingState = null;
    return;
  }
  const deck = shuffleArray(entries);
  openingState = {
    stage: "hand",
    hand: deck.splice(0, OPENING_HAND_SIZE),
    deck,
    life: [],
    selected: new Set(),
    mulliganCount: 0
  };
}

function dealOpeningLife() {
  const st = openingState;
  st.life = st.deck.splice(0, OPENING_LIFE_SIZE);
  st.stage = "life";
}

// 選んだ札をデッキに戻してシャッフルし、同じ枚数を引き直してからライフクロスを展開
function confirmOpeningHand() {
  const st = openingState;
  const returned = st.hand.filter(e => st.selected.has(e));

  if (returned.length > 0) {
    st.hand = st.hand.filter(e => !st.selected.has(e));
    st.deck = shuffleArray([...st.deck, ...returned]);
    st.hand.push(...st.deck.splice(0, returned.length));
  }
  st.mulliganCount = returned.length;
  st.selected.clear();
  dealOpeningLife();
  renderOpening();
}

// 手札は変えずに、ライフクロスだけ引き直す
function redealOpeningLife() {
  const st = openingState;
  st.deck = shuffleArray([...st.deck, ...st.life]);
  st.life = [];
  dealOpeningLife();
  renderOpening();
}

function allOpeningEntries() {
  const st = openingState;
  return [...st.hand, ...st.deck, ...st.life];
}

// ---- 表示 ----
function makeOpeningTile(entry, selectable, selected, onClick) {
  const tile = document.createElement("div");
  tile.className = `opening-tile ${entry.stopper ? "stopper" : entry.lb ? "lb" : "none"}`;
  if (selected) tile.classList.add("selected");

  const img = document.createElement("img");
  img.src = entry.card.image;
  img.alt = entry.card.name;
  img.title = entry.card.name;
  img.draggable = false;
  tile.appendChild(img);

  if (selectable) {
    tile.classList.add("clickable");
    tile.onclick = onClick;
  }
  return tile;
}

function makeOpeningLegend() {
  const legend = document.createElement("div");
  legend.className = "opening-legend";
  legend.innerHTML =
    '<span><i class="stopper"></i>止められるLB</span>' +
    '<span><i class="lb"></i>LB有（止められない）</span>' +
    '<span><i class="none"></i>LBなし</span>';
  return legend;
}

function makeOpeningHeading(text) {
  const h = document.createElement("h4");
  h.textContent = text;
  return h;
}

function makeOpeningButton(text, onClick, options = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = text;
  if (options.sub) btn.className = "sub";
  if (options.disabled) btn.disabled = true;
  btn.onclick = onClick;
  return btn;
}

function pct(p) {
  return `${(p * 100).toFixed(1)}%`;
}

// 確率の表（actual があればその行を強調）
function makeDistBlock(title, dist, N, K, n, actual) {
  const block = document.createElement("div");
  block.className = "opening-dist";

  const titleEl = document.createElement("div");
  titleEl.className = "opening-dist-title";
  titleEl.textContent = title;
  block.appendChild(titleEl);

  const maxP = Math.max(...dist);
  dist.forEach((p, k) => {
    if (p < 0.0005 && k !== actual) return; // 0.05%未満の行は省略
    const row = document.createElement("div");
    row.className = "opening-dist-row" + (k === actual ? " actual" : "");

    const kEl = document.createElement("span");
    kEl.className = "k";
    kEl.textContent = `${k}枚`;

    const bar = document.createElement("span");
    bar.className = "bar";
    const fill = document.createElement("i");
    fill.style.width = `${maxP > 0 ? (p / maxP) * 100 : 0}%`;
    bar.appendChild(fill);

    const pctEl = document.createElement("span");
    pctEl.className = "pct";
    pctEl.textContent = pct(p);

    row.append(kEl, bar, pctEl);
    block.appendChild(row);
  });

  const note = document.createElement("div");
  note.className = "opening-dist-note";
  note.textContent =
    `期待値 ${((n * K) / N).toFixed(2)}枚 ／ 1枚以上入る確率 ${pct(1 - dist[0])}` +
    `（${N}枚中${K}枚から${n}枚）`;
  block.appendChild(note);

  return block;
}

function renderOpening() {
  const stageEl = document.getElementById("opening-stage");
  const summaryEl = document.getElementById("opening-summary");
  stageEl.innerHTML = "";

  const st = openingState;
  if (!st) {
    summaryEl.textContent = "";
    const msg = document.createElement("p");
    msg.textContent =
      `メインデッキが${mainBurst.length + mainNoBurst.length}枚です。` +
      `初手${OPENING_HAND_SIZE}枚とライフクロス${OPENING_LIFE_SIZE}枚を引くため、` +
      `${OPENING_HAND_SIZE + OPENING_LIFE_SIZE}枚以上入れてください。`;
    stageEl.appendChild(msg);
    return;
  }

  const all = allOpeningEntries();
  const lbTotal = all.filter(e => e.lb).length;
  const stopperTotal = all.filter(e => e.stopper).length;
  summaryEl.textContent =
    `メインデッキ ${all.length}枚（LB有 ${lbTotal}枚、うち止められるLB ${stopperTotal}枚）` +
    (all.length !== MAIN_DECK_SIZE ? `　※${MAIN_DECK_SIZE}枚ではありません` : "");

  if (st.stage === "hand") {
    renderOpeningHandStage(stageEl, all);
  } else {
    renderOpeningLifeStage(stageEl);
  }
}

function renderOpeningHandStage(stageEl, all) {
  const st = openingState;

  stageEl.appendChild(makeOpeningHeading(`初手${OPENING_HAND_SIZE}枚`));
  const hint = document.createElement("div");
  hint.className = "opening-dist-note";
  hint.textContent = "マリガンする札をタップで選びます（選ばなければマリガンなし）。";
  stageEl.appendChild(hint);

  const row = document.createElement("div");
  row.className = "opening-row hand";
  st.hand.forEach(entry => {
    row.appendChild(makeOpeningTile(entry, true, st.selected.has(entry), () => {
      if (st.selected.has(entry)) st.selected.delete(entry);
      else st.selected.add(entry);
      renderOpening();
    }));
  });
  stageEl.appendChild(row);
  stageEl.appendChild(makeOpeningLegend());

  const N = all.length;
  const K = all.filter(e => e.stopper).length;
  const handStoppers = st.hand.filter(e => e.stopper).length;
  stageEl.appendChild(makeDistBlock(
    `初手${OPENING_HAND_SIZE}枚に止められるLBが来る枚数（マリガン前）`,
    hypergeometricDist(N, K, OPENING_HAND_SIZE), N, K, OPENING_HAND_SIZE, handStoppers
  ));

  const actions = document.createElement("div");
  actions.className = "opening-actions";
  const count = st.selected.size;
  actions.appendChild(makeOpeningButton(
    count > 0 ? `選んだ${count}枚をマリガンして、ライフクロスを展開` : "マリガンなしで、ライフクロスを展開",
    confirmOpeningHand
  ));
  actions.appendChild(makeOpeningButton("初手を引き直す（最初から）", () => {
    startOpening();
    renderOpening();
  }, { sub: true }));
  stageEl.appendChild(actions);
}

function renderOpeningLifeStage(stageEl) {
  const st = openingState;

  const mulliganText = st.mulliganCount > 0 ? `マリガン：${st.mulliganCount}枚` : "マリガン：なし";
  stageEl.appendChild(makeOpeningHeading(`手札（${mulliganText}）`));
  const handRow = document.createElement("div");
  handRow.className = "opening-row hand";
  st.hand.forEach(entry => handRow.appendChild(makeOpeningTile(entry, false, false)));
  stageEl.appendChild(handRow);

  stageEl.appendChild(makeOpeningHeading(`ライフクロス ${st.life.length}枚`));
  const lifeRow = document.createElement("div");
  lifeRow.className = "opening-row life";
  st.life.forEach(entry => lifeRow.appendChild(makeOpeningTile(entry, false, false)));
  stageEl.appendChild(lifeRow);
  stageEl.appendChild(makeOpeningLegend());

  const lifeLb = st.life.filter(e => e.lb).length;
  const lifeStoppers = st.life.filter(e => e.stopper).length;
  const result = document.createElement("div");
  result.className = "opening-result";
  result.textContent = `今回の展開：LB有 ${lifeLb}枚 ／ 止められるLB ${lifeStoppers}枚`;
  stageEl.appendChild(result);

  // 手札が確定した状態での、ライフクロスの確率（手札を除いた残りのカードから引く）
  const pool = [...st.deck, ...st.life];
  const N = pool.length;
  const n = st.life.length;
  const K = pool.filter(e => e.stopper).length;
  const KLb = pool.filter(e => e.lb).length;
  const handStoppers = st.hand.filter(e => e.stopper).length;

  const note = document.createElement("div");
  note.className = "opening-dist-note";
  note.textContent =
    `この手札を前提に、残り${N}枚からライフクロス${n}枚が決まるときの確率です` +
    `（手札に止められるLBが${handStoppers}枚あり、ライフクロスには入りません）。`;
  stageEl.appendChild(note);

  stageEl.appendChild(makeDistBlock(
    "ライフクロスに入る「止められるLB」の枚数", hypergeometricDist(N, K, n), N, K, n, lifeStoppers
  ));
  stageEl.appendChild(makeDistBlock(
    "ライフクロスに入る「LB有」の枚数", hypergeometricDist(N, KLb, n), N, KLb, n, lifeLb
  ));

  const actions = document.createElement("div");
  actions.className = "opening-actions";
  actions.appendChild(makeOpeningButton("ライフクロスを引き直す（手札はそのまま）", redealOpeningLife));
  actions.appendChild(makeOpeningButton("初手から引き直す", () => {
    startOpening();
    renderOpening();
  }, { sub: true }));
  stageEl.appendChild(actions);
}

// ---- LB判定の確認・修正 ----
function buildOpeningJudgeList() {
  const listEl = document.getElementById("opening-judge-list");
  listEl.innerHTML = "";

  const overrides = loadLbOverrides();
  const seen = new Set();

  mainBurst.forEach(card => {
    if (seen.has(card.name)) return;
    seen.add(card.name);

    const info = analyzeLifeBurst(card);

    const row = document.createElement("div");
    row.className = "judge-row";

    const thumb = document.createElement("img");
    thumb.className = "judge-thumb";
    thumb.src = card.image;
    thumb.alt = card.name;
    thumb.loading = "lazy";
    thumb.draggable = false;

    const body = document.createElement("div");
    body.className = "judge-body";

    const nameEl = document.createElement("div");
    nameEl.className = "judge-name";
    nameEl.appendChild(document.createTextNode(card.name));
    info.tags.forEach(tag => {
      const t = document.createElement("span");
      t.className = "judge-tag";
      t.textContent = tag;
      nameEl.appendChild(t);
    });
    const manual = document.createElement("span");
    manual.className = "judge-manual";
    manual.textContent = "（手動設定）";
    manual.style.display = typeof overrides[card.name] === "boolean" ? "" : "none";
    nameEl.appendChild(manual);

    const textEl = document.createElement("div");
    textEl.className = "judge-text";
    textEl.textContent = info.text || "（ライフバーストのテキストが見つかりません）";

    const label = document.createElement("label");
    label.className = "judge-check";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = isStopperLB(card, overrides);
    check.onchange = () => {
      const o = loadLbOverrides();
      if (check.checked === info.auto) delete o[card.name];
      else o[card.name] = check.checked;
      saveLbOverrides(o);
      manual.style.display = typeof o[card.name] === "boolean" ? "" : "none";

      // 展開中のカードにも反映して、確率を計算し直す
      if (openingState) {
        allOpeningEntries().forEach(e => {
          if (e.lb) e.stopper = isStopperLB(e.card, o);
        });
        renderOpening();
      }
    };
    label.append(check, document.createTextNode("止められるLBとして数える"));

    body.append(nameEl, textEl, label);
    row.append(thumb, body);
    listEl.appendChild(row);
  });

  if (seen.size === 0) {
    listEl.textContent = "メインデッキにLB有のカードがありません。";
  }
}

document.getElementById("open-opening-check").onclick = () => {
  startOpening();
  renderOpening();
  buildOpeningJudgeList();
  document.getElementById("opening-judge").open = false;
  openModal("opening-modal");
};

document.getElementById("close-opening").onclick = () => {
  closeModal("opening-modal");
  openingState = null;
};


// =========================
// デッキの共有（URL・デッキコード）
// デッキを「カードID＋枚数」だけの短いコードにして、URLに載せて共有する。
//   共有URL : （このページのURL）?d=<デッキコード>
//   デッキコード : {"v":1,"n":"デッキ名","l":[ルリグデッキ],"m":[メインデッキ]} をBase64URL化したもの
//   カードは「ID」または「ID*枚数」で表す（例: WX24-P2-052*2）
// 共有されたURLを開く（またはコードを貼り付ける）と内容を確認でき、
// 作成画面への読み込み・デッキの保存ができる。
// =========================
const SHARE_CODE_VERSION = 1;
const SHARE_MAX_CARDS = 200;

let cardsByIdCache = null;
function getCardsById() {
  if (!cardsByIdCache) cardsByIdCache = new Map(allCards.map(c => [c.id, c]));
  return cardsByIdCache;
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code) {
  let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// カードの配列を「ID」「ID*枚数」の配列にまとめる（並び順は維持）
function packCardIds(cards) {
  const counts = new Map();
  cards.forEach(c => counts.set(c.id, (counts.get(c.id) || 0) + 1));
  return [...counts].map(([id, n]) => (n > 1 ? `${id}*${n}` : id));
}

function encodeDeckCode(name) {
  const payload = {
    v: SHARE_CODE_VERSION,
    l: packCardIds(lrigDeck),
    m: packCardIds([...mainBurst, ...mainNoBurst])
  };
  if (name) payload.n = name;
  return toBase64Url(JSON.stringify(payload));
}

function buildShareUrl(code) {
  return `${location.href.split(/[?#]/)[0]}?d=${code}`;
}

// URLでもコードだけでも受け付ける。読み取れなければ Error を投げる
function decodeDeckCode(input) {
  const text = String(input || "").trim();
  if (!text) throw new Error("コードが空です");

  const m = text.match(/[?&]d=([A-Za-z0-9_-]+)/);
  const code = m ? m[1] : text.replace(/\s+/g, "");

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(code));
  } catch (e) {
    throw new Error("デッキコードを読み取れませんでした");
  }
  if (!payload || payload.v !== SHARE_CODE_VERSION || !Array.isArray(payload.l) || !Array.isArray(payload.m)) {
    throw new Error("対応していない形式のデッキコードです");
  }

  const byId = getCardsById();
  const missing = [];
  let total = 0;

  const expand = (list) => {
    const cards = [];
    list.forEach(token => {
      const [id, countStr] = String(token).split("*");
      const count = countStr === undefined ? 1 : parseInt(countStr, 10);
      if (!id || !Number.isInteger(count) || count < 1) return;
      total += count;
      if (total > SHARE_MAX_CARDS) throw new Error("カードの枚数が多すぎます");

      const card = byId.get(id);
      if (!card) {
        missing.push(id);
        return;
      }
      for (let i = 0; i < count; i++) cards.push(card);
    });
    return cards;
  };

  const lrigPart = expand(payload.l);
  const mainPart = expand(payload.m);

  // 保存形式に合わせて、ルリグデッキ／メイン(LB有)／メイン(LB無)に振り分ける
  const deck = { lrigDeck: [], mainBurst: [], mainNoBurst: [] };
  [...lrigPart, ...mainPart].forEach(card => {
    if (isLrigDeckCard(card)) deck.lrigDeck.push(card);
    else if (card.burst) deck.mainBurst.push(card);
    else deck.mainNoBurst.push(card);
  });

  deck.name = typeof payload.n === "string" ? payload.n.slice(0, 50) : "";
  deck.missing = missing;
  return deck;
}

// クリップボードにコピー（非対応なら選択してコピー）
async function copyShareText(text, textareaEl, buttonEl) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (e) {
    try {
      textareaEl.focus();
      textareaEl.select();
      copied = document.execCommand("copy");
    } catch (e2) {
      copied = false;
    }
  }
  const original = buttonEl.textContent;
  buttonEl.textContent = copied ? "コピーしました" : "コピーできませんでした";
  setTimeout(() => { buttonEl.textContent = original; }, 1500);
}

// ---- 共有モーダル（発行・コード貼り付け） ----
document.getElementById("open-share").onclick = () => {
  document.getElementById("share-result").style.display = "none";
  document.getElementById("share-import-status").textContent = "";
  document.getElementById("share-native").style.display = navigator.share ? "" : "none";
  openModal("deck-share-modal");
};

document.getElementById("share-issue").onclick = () => {
  if (lrigDeck.length + mainBurst.length + mainNoBurst.length === 0) {
    alert("デッキにカードが入っていません");
    return;
  }
  const name = document.getElementById("share-deck-name").value.trim().slice(0, 50);
  const code = encodeDeckCode(name);
  document.getElementById("share-url-area").value = buildShareUrl(code);
  document.getElementById("share-code-area").value = code;
  document.getElementById("share-result").style.display = "block";
};

document.getElementById("share-copy-url").onclick = () => {
  copyShareText(
    document.getElementById("share-url-area").value,
    document.getElementById("share-url-area"),
    document.getElementById("share-copy-url")
  );
};

document.getElementById("share-copy-code").onclick = () => {
  copyShareText(
    document.getElementById("share-code-area").value,
    document.getElementById("share-code-area"),
    document.getElementById("share-copy-code")
  );
};

document.getElementById("share-native").onclick = async () => {
  const url = document.getElementById("share-url-area").value;
  const name = document.getElementById("share-deck-name").value.trim();
  try {
    await navigator.share({ title: name || "WIXOSSデッキ", url });
  } catch (err) {
    if (err && err.name !== "AbortError") console.error(err);
  }
};

document.getElementById("share-import-btn").onclick = () => {
  const status = document.getElementById("share-import-status");
  try {
    const deck = decodeDeckCode(document.getElementById("share-import-area").value);
    status.textContent = "";
    closeModal("deck-share-modal");
    openSharedDeckPreview(deck);
  } catch (err) {
    status.textContent = err.message;
  }
};

document.getElementById("close-share").onclick = () => {
  closeModal("deck-share-modal");
};

// ---- 共有されたデッキの確認（読み込み・保存） ----
let sharedDeckPending = null;

function openSharedDeckPreview(deck) {
  sharedDeckPending = deck;

  const mainTotal = deck.mainBurst.length + deck.mainNoBurst.length;
  document.getElementById("shared-deck-summary").textContent =
    (deck.name ? `「${deck.name}」` : "（名前なし）") +
    `　ルリグデッキ ${deck.lrigDeck.length}枚 ／ メインデッキ ${mainTotal}枚` +
    `（LB有 ${deck.mainBurst.length} / LB無 ${deck.mainNoBurst.length}）`;

  const warning = document.getElementById("shared-deck-warning");
  warning.textContent = deck.missing.length > 0
    ? `このサイトのカードデータにないカードが${deck.missing.length}種類あり、読み込めませんでした（${deck.missing.slice(0, 5).join("、")}${deck.missing.length > 5 ? " など" : ""}）。`
    : "";

  // カードを画像＋枚数バッジで一覧表示
  const listEl = document.getElementById("shared-deck-list");
  listEl.innerHTML = "";
  [
    ["◆ ルリグデッキ", deck.lrigDeck],
    ["◆ メインデッキ（ライフバースト有）", deck.mainBurst],
    ["◆ メインデッキ（ライフバースト無）", deck.mainNoBurst]
  ].forEach(([title, cards]) => {
    if (cards.length === 0) return;

    const h = document.createElement("h4");
    h.textContent = `${title}　${cards.length}枚`;
    listEl.appendChild(h);

    const grid = document.createElement("div");
    grid.className = "shared-grid";
    const counts = new Map();
    cards.forEach(c => counts.set(c.id, { card: c, n: (counts.get(c.id)?.n || 0) + 1 }));
    counts.forEach(({ card, n }) => {
      const wrap = document.createElement("div");
      wrap.className = "card-wrap";

      const img = document.createElement("img");
      img.className = "card-img";
      img.src = card.image;
      img.alt = card.name;
      img.title = card.name;
      img.loading = "lazy";
      img.draggable = false;
      wrap.appendChild(img);

      if (n > 1) {
        const badge = document.createElement("span");
        badge.className = "card-badge";
        badge.textContent = `×${n}`;
        wrap.appendChild(badge);
      }
      grid.appendChild(wrap);
    });
    listEl.appendChild(grid);
  });

  document.getElementById("shared-deck-save-name").value = deck.name || "";
  openModal("shared-deck-modal");
}

document.getElementById("shared-deck-load").onclick = () => {
  const deck = sharedDeckPending;
  if (!deck) return;

  const hasCurrent = lrigDeck.length + mainBurst.length + mainNoBurst.length > 0;
  if (hasCurrent && !confirm("いま作成中のデッキは、この共有デッキに置き換わります（「元に戻す」で戻せます）。よろしいですか？")) {
    return;
  }

  lrigDeck = [...deck.lrigDeck];
  mainBurst = [...deck.mainBurst];
  mainNoBurst = [...deck.mainNoBurst];
  refreshDeckDisplay();

  closeModal("shared-deck-modal");
  sharedDeckPending = null;
};

document.getElementById("shared-deck-save").onclick = () => {
  const deck = sharedDeckPending;
  if (!deck) return;

  const name = document.getElementById("shared-deck-save-name").value.trim();
  if (!name) {
    alert("保存するときの名前を入力してください");
    return;
  }

  const decks = getSavedDecks();
  if (decks[name] && !confirm(`「${name}」はすでに保存されています。上書きしますか？`)) return;

  decks[name] = {
    lrigDeck: [...deck.lrigDeck],
    mainBurst: [...deck.mainBurst],
    mainNoBurst: [...deck.mainNoBurst],
    tags: [],
    memo: "",
    savedAt: new Date().toISOString()
  };
  setSavedDecks(decks);
  renderDeckList();
  alert(`「${name}」として保存しました`);
};

document.getElementById("shared-deck-close").onclick = () => {
  closeModal("shared-deck-modal");
  sharedDeckPending = null;
};

// 共有URL（?d=…）で開かれたら、内容の確認画面を出す
(function openSharedDeckFromUrl() {
  const m = location.search.match(/[?&]d=([A-Za-z0-9_-]+)/);
  if (!m) return;

  try {
    openSharedDeckPreview(decodeDeckCode(m[1]));
  } catch (err) {
    alert(`共有URLの内容を読み込めませんでした：${err.message}`);
  }
  // 再読み込みのたびに確認画面が出ないよう、URLからコードを取り除く
  try {
    history.replaceState(null, "", location.href.split(/[?#]/)[0]);
  } catch (e) {
    // 取り除けなくても動作に影響はない
  }
})();
