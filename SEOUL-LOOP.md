# Seoul Loop — 交接筆記

首爾四日旅行（2026/10/17 六 – 10/20 二）的共同計畫工具。五個人來自五個國家：
Amber 🇹🇼 · Akiha 🇯🇵 · Hye Yeon 🇰🇷 · Gigi 🇭🇰 · Nadia 🇮🇩

這份文件是給「接手繼續做的人」看的 —— 包含現在的狀態、所有 ID、已經做過的決定和踩過的坑。

---

## 現在有三個東西

| | 位置 | 狀態 |
|---|---|---|
| **網頁** | `korea/index.html` | ✅ 寫完，已推分支；**尚未合併到 `main`，公開網址還沒生效** |
| **Notion** | 見下方連結 | ✅ 五個資料庫都建好、資料已填 |
| **LINE bot** | `bot/` | ⚠️ 程式寫完但**從未部署、從未實際跑過** |

分支：`claude/korea-trip-planner-tou9gc`

---

## 一、網頁

`korea/index.html` — 單一檔案，無建置步驟，無外部相依（字型走 Google Fonts）。

**功能**：進入頁（選語言＋選你是誰）、倒數、出發前檢查清單、五國語言（zh/ja/ko/en/id 自動偵測）、喜好蒐集與即時統計、口袋名單投票、每日行程、多幣別記帳與最少轉帳結清、複製 LINE 摘要。

**資料層有兩種模式**（`connect()` 自動判斷）：
- 當作 Claude Artifact 開啟 → 用 `claude.use("db")` 共享資料庫，多人即時同步
- 靜態託管（GitHub Pages）→ 退回 `localStorage`，只存在各自裝置

Artifact 網址：<https://claude.ai/code/artifact/eaf9ed37-cc32-4be6-be16-f1ef6a601103>
（⚠️ 宣告了共享資料庫的 artifact 屬於組織內部，**不能公開分享**，所以朋友打不開。這就是 Notion 存在的原因。）

**合併到 `main` 之後**，既有的 `.github/workflows/pages.yml` 會自動部署到：
```
https://smcurlyqq.github.io/happy-birthday/korea/
```
這個網址是公開的，可以直接貼 LINE 群。**這件事還沒做，需要開 PR 合併。**

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

**還沒做**：Notion 右上 Share → Anyone with the link → **Can edit**。沒開的話朋友只能看不能改。

**匯率是寫死在公式裡的**（1 TWD = 45 KRW、1 JPY = 9.5、1 HKD = 185、1 IDR = 0.088、1 USD = 1440）。
出發前要更新的話，得去改公式，不是改欄位。網頁上的匯率則可以直接編輯。

「成員與喜好」有一個 `LINE ID` 欄位，是給 bot 用的（見下）。

---

## 三、LINE bot

`bot/src/index.js` — Cloudflare Worker。行為：群組裡有人貼連結 → 判斷類別 → 寫進 Notion（住宿進 Stays，其他進 Ideas 並設好 `類型`）→ 回一張 Flex 卡片附「改分類」按鈕。沒有連結的訊息一律不理。

分類靠三層加權：網域（10 分）> 網頁 og 標題（3 分）＝ 使用者打的字（3 分）> og 描述（1 分）。
`區域` 也會從文字裡猜（弘大／明洞／江南／聖水／益善洞）。

指令：`我是 <名字>`（綁定 LINE userId 到成員表，之後記提案人）、`說明`。

### 部署狀態：未完成

`.github/workflows/deploy-bot.yml` 已經寫好，用 GitHub Actions 跑 wrangler，**不需要本機 Node 或終端機**。
但需要先在 repo 設定五個 secret：

<https://github.com/smcurlyqq/happy-birthday/settings/secrets/actions>

| Secret 名稱 | 從哪裡拿 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com/profile/api-tokens → Edit Cloudflare Workers 範本 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 首頁右側，或網址列那一串 |
| `LINE_CHANNEL_SECRET` | LINE Developers → Basic settings |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → Messaging API → Issue |
| `NOTION_TOKEN` | notion.so/profile/integrations 建整合後的 Internal Integration Secret |

設好之後 Actions → Deploy LINE bot → Run workflow。
成功後把 `https://seoul-loop-bot.<子網域>.workers.dev/webhook` 填回 LINE 的 Webhook URL。

### 已知進度（2026-09-11）

- ✅ LINE Provider 已建立
- ✅ Messaging API Channel 已建立
- ❓ 三個開關狀態未確認（見下方坑）
- ❌ Notion 整合未建立
- ❌ Cloudflare token 未取得
- ❌ 五個 secret 未設定
- ❌ 從未部署、**程式從未對真實 LINE 或 Notion 跑過一次**

最後一點要特別強調：bot 的程式通過語法檢查，但**沒有任何端對端測試**。第一次部署很可能會噴錯，
那是正常的，看 `npx wrangler tail` 或 Actions 的 log。

---

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
- **bot v1 不接 LLM 分類** — 網域規則＋五語關鍵字＋一鍵改分類已覆蓋多數情況；接 LLM 要多一把 key、多一筆費用、多一段延遲，準確度提升有限。不夠準再加。
- **視覺走雜誌編輯風** — Bodoni Moda + Archivo，暖報紙底、細線、無圓角無陰影，單一深紅重點色，五個人用低彩度丹青顏料當識別色。這是使用者從四個方向裡挑的，第一版的首爾地鐵配色被否決了。
- **進入頁同時選語言** — 不然日文和印尼文的朋友一進來看到瀏覽器亂猜的語言。
- **記帳留在網頁不做進 bot** — 使用者要的是「只要蒐集」。

---

## 下一步（建議順序）

1. **開 PR 把分支合併到 `main`** → 公開網址生效 → 貼進 LINE 群。這步最有價值而且只差一個 PR。
2. Notion 開「Anyone with the link → Can edit」→ 也貼進群。
3. 提醒 🇮🇩 Nadia：**韓國對印尼不免簽**，觀光簽要及早送件。距離出發只剩約五週。
4. bot 有空再弄，沒有也不影響旅行。
