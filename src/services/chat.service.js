// File: services/chat.service.js

require("dotenv").config();
const axios = require("axios");
const Intent = require("../models/intent.model");

async function sendMessage(userMessage, intentName) {
  // 1. Lấy intent
  const intent = await Intent.findOne({ name: intentName });
  if (!intent) {
    const err = new Error(`Intent "${intentName}" không tồn tại.`);
    err.status = 400;
    throw err;
  }

  // 2. Build system prompt: nếu có description thì đưa description vào để AI "chỉnh sửa"
  const basePrompt = intent.promptTemplate;
  const systemContent = intent.description
    ? `Dưới đây là thông tin gốc (description) của intent:\n\n"${intent.description}"\n\nHãy dùng nó làm cơ sở, kết hợp với nội dung sau để trả lời người dùng một cách tự nhiên, thêm ngữ khí thân thiện, rõ ràng và đầy đủ:\n\n${basePrompt}`
    : basePrompt;

  // 3. Debug logs
  console.log("↪ System prompt:", systemContent);
  console.log("↪ User message:", userMessage);

  // 4. Gọi OpenRouter API
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
      console.error("Bạn đã vượt quá quota hoặc bị giới hạn rate limit.");
    } else {
      console.error("Lỗi khi gọi API OpenRouter:", error.message);
    }
    throw error;
  }
}

module.exports = { sendMessage };
