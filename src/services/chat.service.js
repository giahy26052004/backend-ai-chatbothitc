// File: services/chat.service.js

require("dotenv").config();
const axios = require("axios");
const Intent = require("../models/intent.model");

async function sendMessage(userMessage, intentName) {
  // 1. Lấy intent từ DB
  const intent = await Intent.findOne({ name: intentName });
  if (!intent) {
    const err = new Error(`Intent "${intentName}" không tồn tại.`);
    err.status = 400;
    throw err;
  }

  // 2. Build system prompt
  const systemContent = intent.description
    ? `${intent.description}\n\n${intent.promptTemplate}`
    : intent.promptTemplate;

  // 3. Debug logs: chỉ in system vs user message, không nhầm lẫn
  console.log("↪ System prompt:", systemContent);
  console.log("↪ User message:", userMessage);

  // 4. Chuẩn bị payload cho OpenRouter
  const messages = [
    { role: "system", content: systemContent },
    { role: "user", content: userMessage },
  ];

  try {
    // 5. Gọi API
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          Referer: "http://localhost:4000",
          "X-Title": "Enrollment Bot",
        },
      }
    );

    // 6. Xử lý reply
    const botReplyRaw = response.data.choices[0].message.content;
    const botReply = botReplyRaw ? botReplyRaw.trim() : "";

    return { reply: botReply };
  } catch (error) {
    // 7. Xử lý lỗi
    if (error.response?.status === 429) {
      console.error(
        "Bạn đã vượt quá quota hoặc bị giới hạn rate limit. Vui lòng kiểm tra tài khoản."
      );
    } else {
      console.error("Lỗi khi gọi API OpenRouter:", error.message);
    }
    throw error;
  }
}

module.exports = { sendMessage };
