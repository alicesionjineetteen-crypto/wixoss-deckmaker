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
    const max = isLrigDeckCard(card) ? 1 : MAX_COPIES;

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
