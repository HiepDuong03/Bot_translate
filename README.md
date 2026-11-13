# 🌐 Discord Bot Dịch Song Song Hàn ⇄ Việt (Gemini AI + Multi-Key Failover)

Bot Discord tự động nhận diện ngôn ngữ và dịch song song **Tiếng Hàn ⇄ Tiếng Việt** ngay tại kênh chat (tương tự BabelBot), sử dụng **Google Gemini Flash** cho văn phong tự nhiên, hiểu kính ngữ (`존댓말`) và từ lóng (`ㅋㅋ`, `ㅇㅇ`, `ㄱㅅ`).

Tích hợp cơ chế **Xoay vòng nhiều API Key (Multi-Key Pool)**: khi 1 key chạm giới hạn lượt dùng (`429`), bot tự động chuyển ngay sang key dự phòng kế tiếp.

---

## 🚀 Hướng dẫn cài đặt trong 3 bước

### Bước 1: Tạo Bot trên Discord Developer Portal
1. Truy cập [Discord Developer Portal](https://discord.com/developers/applications) $\rightarrow$ **New Application**.
2. Vào tab **Bot**:
   * Bấm **Reset Token** và copy lại (điền vào `DISCORD_TOKEN`).
   * Bật **Message Content Intent** (rất quan trọng để bot đọc được tin nhắn cần dịch).
3. Vào tab **OAuth2** $\rightarrow$ **URL Generator**:
   * Chọn scopes: `bot`, `applications.commands`.
   * Chọn permissions: `View Channels`, `Send Messages`, `Read Message History`.
   * Mở link bên dưới để mời Bot vào Server của bạn.
4. Lấy **Application ID** ở tab *General Information* (điền vào `CLIENT_ID`).

### Bước 2: Tạo 4–5 Gemini API Key miễn phí
1. Truy cập [Google AI Studio](https://aistudio.google.com/).
2. Bấm **Create API Key**.
3. **Mẹo tăng gấp 5 lần lượt dùng miễn phí**: Hãy tạo mỗi API Key từ một **Google Cloud Project** hoặc **tài khoản Google khác nhau**, sau đó nối lại bằng dấu phẩy trong file `.env`:
   ```ini
   GEMINI_API_KEYS=AIzaSyKey1,AIzaSyKey2,AIzaSyKey3,AIzaSyKey4,AIzaSyKey5
   ```

### Bước 3: Cấu hình `.env` & Chạy Bot
Mở file `.env` tại `d:\2027\DiscordTranslateBot\.env` và điền các thông tin trên, sau đó chạy:

```powershell
cd d:\2027\DiscordTranslateBot
npm start
```

---

## ☁️ Deploy chạy 24/24 trên Render + UptimeRobot
Bot đã tích hợp sẵn **HTTP Health Check Server** (lắng nghe cổng `PORT` của Render) để chạy liên tục như bot quản lý:

1. Trên [Render](https://render.com/) $\rightarrow$ **New +** $\rightarrow$ **Web Service** $\rightarrow$ kết nối repo `Bot_translate`.
2. Cấu hình:
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
   * **Instance Type**: `Free`
3. Vào tab **Environment** trên Render và thêm các biến:
   * `DISCORD_TOKEN`: Token bot Discord
   * `CLIENT_ID`: Application ID của bot
   * `GEMINI_API_KEYS`: Dán 3–5 API Key cách nhau bằng dấu phẩy
   * `GEMINI_MODEL`: `gemini-3.8-flash`
4. **Giữ bot thức 24/24**: Copy URL Web Service của Render (dạng `https://bot-translate-xxxx.onrender.com`) rồi tạo một Monitor HTTP(s) trên [UptimeRobot](https://uptimerobot.com/) ping mỗi **5 phút** để Render Free không bị ngủ đông.

---

## 💬 Các lệnh trên Discord
* `/translate-on`: Bật tự động dịch song song tại kênh hiện tại.
* `/translate-off`: Tắt dịch tự động tại kênh hiện tại.
* `/key-status`: Xem tình trạng hoạt động & số lượt dịch thành công/lỗi của từng Gemini API Key.

## 🧪 Kiểm thử
```powershell
npm test
```
