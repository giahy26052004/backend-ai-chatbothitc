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

  // 2. Nếu có description, trả luôn về description và dừng
  if (intent.description && intent.description.trim() !== "") {
    console.log("↪ Priority reply using intent.description");
    return { reply: intent.description };
  }

  // 3. Nếu không có description, build system prompt như bình thường
  const systemContent = intent.promptTemplate;

  console.log("↪ System prompt:", systemContent);
  console.log("↪ User message:", userMessage);

  // 4. Gọi OpenRouter
  const messages = [
    { role: "system", content: systemContent },
    { role: "user", content: userMessage },
  ];

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      { model: "openai/gpt-3.5-turbo", messages },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          Referer: "http://localhost:4000",
          "X-Title": "Enrollment Bot",
        },
      }
    );

    const botReply = response.data.choices[0].message.content.trim();
    return { reply: botReply };
  } catch (error) {
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
