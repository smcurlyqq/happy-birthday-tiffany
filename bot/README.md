# Seoul Loop — LINE 收集機器人

把連結貼進 LINE 群，它就自動收進 Notion。住宿去「住宿候選」，其他去「口袋名單」並選好類型。猜錯按一下卡片上的按鈕就改掉。

其他訊息一律不理，所以群裡不會被洗版。

```
Gigi：  這間看起來不錯 https://www.airbnb.com/rooms/12345
bot：   🏠 已收進「住宿候選 Stays」
        Sunny Hanok Stay
        airbnb.com
        在 Notion 打開 →
        不對的話改成： [美食] [咖啡] [景點] [購物] [夜生活]
```

---

## 一、申請 LINE 機器人（只有你能做，約 5 分鐘）

### 1. 建 Provider 和 Channel
1. 開 <https://developers.line.biz/console/> → 用你的 LINE 帳號登入
2. **Create a new provider** → 隨便取個名字（例如 `Seoul Loop`）
3. 在 provider 裡 **Create a Messaging API channel**
   - Channel name：`Seoul Loop`（這會是群裡顯示的名字）
   - Category / Subcategory：隨便選
4. 建好之後在 **Basic settings** 分頁找到 **Channel secret** → 記下來
5. 到 **Messaging API** 分頁 → 最下面 **Channel access token (long-lived)** → **Issue** → 記下來

### 2. 開三個開關
還在 **Messaging API** 分頁：
- ✅ **Allow bot to join group chats** → 開啟

點該頁的 **Edit** 連到 LINE Official Account Manager，在「回應設定」：
- 聊天模式 → **Bot**　⚠️ 留在「聊天」的話 webhook 完全不會觸發
- Webhook → **開啟**
- 自動回應訊息 → **關閉**（不然每句話都被罐頭訊息洗版）

---

## 二、Notion 授權

1. 開 <https://www.notion.so/profile/integrations> → **New integration**
   - Name：`Seoul Loop bot`
   - Associated workspace：選你的
   - Capabilities：勾 **Read content**、**Update content**、**Insert content**
2. 建好後複製 **Internal Integration Secret**（`ntn_` 或 `secret_` 開頭）
3. **這步一定要做**：回到 Notion 打開「首爾 Seoul Loop」那一頁 → 右上 **⋯** → **Connections** → **Connect to** → 選 `Seoul Loop bot`
   底下的五個資料庫會一起繼承權限。沒做這步的話 bot 會一直拿到 404。

---

## 三、部署

```bash
cd bot
npm install

# 三個祕密，一個一個貼進去（不會存進 git）
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put NOTION_TOKEN

npx wrangler deploy
```

部署完會印出網址，像 `https://seoul-loop-bot.<你的帳號>.workers.dev`。

回 LINE Developers → **Messaging API** 分頁 → **Webhook URL** 填：

```
https://seoul-loop-bot.<你的帳號>.workers.dev/webhook
```

按 **Verify**，顯示 Success 就通了。

## 四、拉進群組

1. 在 **Messaging API** 分頁掃 QR code，把官方帳號加成好友
2. 到你們的 LINE 群 → 邀請 → 選這個官方帳號
3. 它會自己跳出使用說明

群組成員**不需要**加它好友也能用。

---

## 指令

| 打什麼 | 會發生什麼 |
|---|---|
| 任何含連結的訊息 | 自動分類收進 Notion |
| `我是 Amber` | 綁定一次，之後你貼的連結會記上提案人 |
| `說明` | 再看一次使用說明 |

`我是` 後面的名字要跟 Notion 成員表裡的一致（Amber / Akiha / Hye Yeon / Gigi / Nadia）。

---

## 它怎麼判斷類別

依序：

1. **網域** — airbnb / booking / agoda / trip.com → 住宿；tabelog / mangoplate → 美食；klook → 景點（權重最高）
2. **網頁標題與描述** — 五種語言的關鍵字（民宿／ホテル／숙소／hotel／penginapan…）
3. **你順手打的那句話** — 權重跟標題一樣高，所以「這間民宿不錯」比連結本身還準

**IG、小紅書、抖音會擋機器人抓資料**，很可能只拿得到網址。這就是為什麼每張卡片都有改分類的按鈕 —— 猜錯一鍵改掉，比追求猜到 100% 準實際得多。同一個連結貼第二次會被擋下，不會重複收。

順帶一提：`區域` 也會自動猜（弘大／明洞／江南／聖水／益善洞），從標題或你打的字裡面抓。

## 排錯

```bash
npx wrangler tail      # 即時看 log
```

| 症狀 | 原因 |
|---|---|
| bot 完全沒反應 | 聊天模式沒改成 Bot，或 Webhook 沒開 |
| Verify 失敗 | 網址結尾少了 `/webhook` |
| log 出現 notion 404 | 忘了把整合 Connect 到 Notion 那一頁 |
| log 出現 notion 401 | NOTION_TOKEN 貼錯 |
| 收進去但標題是一串網址 | 那個網站擋爬蟲（IG 最常見），手動改標題就好 |
