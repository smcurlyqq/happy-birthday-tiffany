# Seoul Loop — 交接筆記

首爾四日旅行（2026/10/17 六 – 10/20 二）的共同計畫工具。五個人來自五個國家：
Amber 🇹🇼 · Akiha 🇯🇵 · Hye Yeon 🇰🇷 · Gigi 🇭🇰 · Nadia 🇮🇩

這份文件是給「接手繼續做的人」看的 —— 包含現在的狀態、所有 ID、已經做過的決定和踩過的坑。

---

## 現在有三個東西

| | 位置 | 狀態 |
|---|---|---|
| **網頁** | `korea/index.html` | ✅ 已合併到 `main`（PR #3，2026-09-11），公開網址已生效 |
| **Notion** | 見下方連結 | ✅ 五個資料庫都建好、資料已填；已開「任何有連結的人 → 可編輯」 |
| **LINE bot** | `bot/` | ✅ 已部署到 Cloudflare Worker，webhook 已接上 LINE；**尚未在真實群組實測** |

分支 `claude/korea-trip-planner-tou9gc` 已合併，之後直接在 `main` 上改。

---

## 一、網頁

`korea/index.html` — 單一檔案，無建置步驟，無外部相依（字型走 Google Fonts）。

**功能**：進入頁（選語言＋選你是誰）、倒數、出發前檢查清單、五國語言（zh/ja/ko/en/id 自動偵測）、喜好蒐集與即時統計、口袋名單投票、每日行程、多幣別記帳與最少轉帳結清、複製 LINE 摘要。

**資料層（`connect()` 自動判斷）**：
- 2026-09-11 深夜起：靜態託管時走 bot Worker 的 `/api`，背後就是 Notion 五個表，所以**大家在網頁上看到的是同一份**。每 15 秒輪詢、寫入後 1 秒再拉。匯率留在各自裝置。
- 當作 Claude Artifact 開啟 → 仍用 `claude.use("db")`。
- 兩個都不行才退回 `localStorage`。

Artifact 網址：<https://claude.ai/code/artifact/eaf9ed37-cc32-4be6-be16-f1ef6a601103>
（⚠️ 宣告了共享資料庫的 artifact 屬於組織內部，**不能公開分享**，所以朋友打不開。這就是 Notion 存在的原因。）

外觀 2026-09-11 晚上改成圓潤風（Inter + Noto Sans，暖奶油底、橘色重點、圓角卡片），Bodoni 雜誌風被 Amber 否決。顯示幣別一律泰銖（五個人都住泰國），記帳輸入一律韓元。成員卡顯示抵達首爾時間。Taste 表單：住宿型態多選、住宿預算每人每晚（THB）、旅行習慣多選、13 個住宿區域。所有日期時間都是首爾時區。

推到 `main` 之後，既有的 `.github/workflows/pages.yml` 會自動部署到：
```
https://smcurlyqq.github.io/happy-birthday/korea/
```
這個網址是公開的，可以直接貼 LINE 群。**已生效（2026-09-11）。**

要改的地方都在 `index.html` 的常數區：`DAYS`（四天日期）、`SEATS`（五個人與代表色）、`RATES0`（預設匯率）。

---

## 二、Notion

主頁：<https://www.notion.so/3d6b331a325081989f75d13d4fff3184>

| 資料庫 | Database ID |
|---|---|
| 1 · 成員與喜好 Crew & taste | `c730a79cc4694546942f11785f80cb66` |
| 2 · 口袋名單 Ideas | `883484141f0c4f3c85e713cbbc6a51cb` |
| 3 · 每日行程 Itinerary | `31a197b2431b43d29e66018af9e01086` |
| 4 · 記帳 Expenses | `e7220d9f26ef46008598a0e8583bcd0b` |
| 5 · 住宿候選 Stays | `d2986ee9b16b45c5b4db8938235fdfab` |

**已完成**：Notion 右上 Share → Anyone with the link → **Can edit**（2026-09-11）。

**匯率是寫死在公式裡的**（1 TWD = 45 KRW、1 JPY = 9.5、1 HKD = 185、1 IDR = 0.088、1 USD = 1440）。
出發前要更新的話，得去改公式，不是改欄位。網頁上的匯率則可以直接編輯。

2026-09-11 晚上整個 Notion 改成純英文：資料庫叫 Crew / Ideas / Itinerary / Expenses / Stays，欄位名與選項值都去掉中文，主頁說明文也是英文。bot 程式裡寫死的欄位名跟這個對應，改欄位名要一起改 `bot/src/notion.js`。Crew 的 `LINE ID` 欄位是給 bot 綁定用的。

---

## 三、LINE bot（v2，2026-09-11 晚上上線）

`bot/` — Cloudflare Worker。設計文件：`docs/superpowers/specs/2026-09-11-bot-v2-ai-collector-design.md`，使用說明：`bot/README.md`。

**行為**：
- 有連結的訊息 → 規則判斷（網域 > og 標題 > 使用者打的字），住宿進 Stays，其他進 Ideas。不用 AI。
- 沒有連結的訊息 → 全部丟給 Claude Haiku 4.5（結構化輸出），判成 expense / idea / itinerary / vote / bind / help / ignore。ignore 或信心 < 0.7 就完全不回。
- 每張卡片有「I'm in」按鈕 = 投票；打錯類別按一下改。
- 所有回覆純英文；指令字五語都認（我是／私は／저는／saya／I am；說明／ヘルプ／도움말／bantuan／help）。
- 記帳、投票需要先綁定（I am 名字），否則 bot 會請他先綁。

**群組白名單**：`wrangler.toml` 的 `ALLOWED_GROUP_IDS`。空的 = 設定模式，bot 進群會回群組 ID。填進去重新部署後，被拉進別的群會自動退出，也不會為別的群呼叫 Claude 或 Notion。一對一私訊一律不理。

**程式結構**：`src/index.js`（路由與各意圖處理）、`src/classify.js`（Claude）、`src/notion.js`（五個資料庫的讀寫，英文欄位名）、`src/line.js`（回覆、說明、卡片、退群）、`src/links.js`（連結路徑）。

### 部署狀態

- Worker：`https://seoul-loop-bot.smcurlyqq.workers.dev`（GET 會回「Seoul Loop bot is awake」）
- LINE channel：provider `mbqq` → channel `mbpp`（channel id 2011563838）。群組裡顯示的名字是 mbpp。
- Webhook URL 已填 `…/webhook`，Use webhook 已開；Allow bot to join group chats 開、Auto-reply 關。
- Notion 整合「Seoul Loop bot」已 Connect 到首爾主頁，五個資料庫繼承權限。
- 六個 GitHub secrets 都已設定（Cloudflare ×2、LINE ×2、Notion、Anthropic）。要重新部署：Actions → Deploy LINE bot → Run workflow（推 `main` 不會自動部署）。
- 分類測試：Actions → Test bot classifier → Run workflow，跑 25 則五語樣本。2026-09-11 結果 24/25，唯一沒對的是一句沒有具體時間的日文行程被判 ignore，符合「寧可安靜」的設計。
- ❌ **尚未在真實群組實測**。下一步：拉進群 → 它會回群組 ID → 填進 `ALLOWED_GROUP_IDS` → 重新部署 → 各種訊息各試一則。

**Anthropic**：console.anthropic.com 帳號 ambre，key 名稱 seoul-loop-bot，已儲值 5 美元。Haiku 4.5 每則訊息幾百 token，整趟旅行預估不到 1 美元。

網頁 `/api` 見 `bot/src/api.js` 與 `bot/README.md`；Notion 每個表多了 `Client ID` 欄位對應網頁的 id，別刪。

Cloudflare API token 建立時的坑：「Edit Cloudflare Workers」範本套完後，Account Resources 和 Zone Resources 兩格都是必填但預設空的，要分別選自己的帳號和 All zones，不然 Continue to summary 按不下去。

## 踩過／預期會踩的坑

1. **LINE 聊天模式沒改成 Bot** → webhook 完全不觸發，bot 像死掉一樣。
   在 LINE Official Account Manager → 回應設定。同一頁還要開 **Webhook**、關 **自動回應訊息**。
   Developers Console 那邊則要開 **Allow bot to join group chats**。
2. **Notion 整合沒 Connect 到頁面** → 所有 API 呼叫回 404。
   建完整合一定要回 Notion 頁面 ⋯ → Connections → Connect to。
3. **IG / 小紅書 / 抖音擋機器人抓資料** → 只拿得到網址，標題會是一串 URL。
   這是預期行為，所以卡片上的「改分類」按鈕是必要功能不是裝飾。
4. **Notion 不能把頁面搬到別的資料庫** → 跨資料庫改分類是「新建 + 封存舊的」，所以會換一個網址。
5. **headless Chrome 最小視窗寬度是 500px** → 用 430 截圖看到的切邊是假象，不是版面 bug。

---

## 做過的決定（不用重新想）

- **Notion 當共享資料層，不是網頁** — 因為宣告 db 的 Claude artifact 不能公開分享，五個不同國家的朋友沒有同一個組織帳號。
- **bot v1 不接 LLM**，v2（同日晚上）改接 Claude Haiku 4.5 — Amber 要收記帳、行程、投票、無連結推薦，沒有 AI 就得逼大家記指令符號；她選了 AI 判讀。有連結的訊息仍走規則，不花錢。
- **視覺走雜誌編輯風** — Bodoni Moda + Archivo，暖報紙底、細線、無圓角無陰影，單一深紅重點色，五個人用低彩度丹青顏料當識別色。這是使用者從四個方向裡挑的，第一版的首爾地鐵配色被否決了。
- **進入頁同時選語言** — 不然日文和印尼文的朋友一進來看到瀏覽器亂猜的語言。
- **記帳的「結清計算」留在網頁**，bot 只負責把每一筆寫進 Expenses。

---

## 下一步（建議順序）

1. 把 mbpp 加好友（LINE Developers → Messaging API 分頁的 QR code）→ 邀進群 → 它會回英文說明 + 群組 ID。
2. 把群組 ID 填進 `bot/wrangler.toml` 的 `ALLOWED_GROUP_IDS`，推上 main，Actions 重新部署。
3. 實測：一個 Airbnb 連結、一句記帳、一句推薦、一句行程、按一次 I'm in、一句閒聊（應該沒反應）。每個人打 I am 名字綁定。
4. 提醒 🇮🇩 Nadia：**韓國對印尼不免簽**，觀光簽要及早送件。距離出發只剩約五週。
5. 網頁與 Notion 連結貼進群。
