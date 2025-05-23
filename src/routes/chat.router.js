// File: routes/chat.route.js

require("dotenv").config(); // Load biến môi trường từ .env
const express = require("express");
const asyncHandler = require("express-async-handler");
const axios = require("axios");
const Intent = require("../models/intent.model");
const { sendMessage } = require("../services/chat.service");

const router = express.Router();

// Default prompt khi tạo intent mới
const DEFAULT_PROMPT = `không trả thêm thông tin của trường khác Bạn là chuyên viên tư vấn tuyển sinh của Trường Cao đẳng Công Thương TP. Hồ Chí Minh, trả lời thân thiện, nhiệt tình và lịch sự. Hỗ trợ học viên hiểu rõ về các ngành học, quy trình đăng ký, học phí, và các chính sách học bổng của trường.`;

/**
 * Zero-shot classify: chọn intent từ danh sách có sẵn
 * @param {string} message
 * @param {string[]} intentNames
 * @returns {Promise<string>} tên intent có sẵn hoặc 'none'
 */
async function classifyIntent(message, intentNames) {
  const listStr = intentNames.join(", ");
  const prompt = `
Bạn là hệ thống phân loại intent.  
Cho trước câu hỏi người dùng và danh sách intent có sẵn, chỉ trả về đúng tên intent từ danh sách nếu có, hoặc "none" nếu không khớp.  
Danh sách intents: [${listStr}]  
Câu hỏi: "${message}"  
=> Chỉ trả về một trong các giá trị: tên_intent (không dấu ngoặc kép, không khoảng trắng) hoặc none.
`;

  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const choiceRaw = res.data.choices?.[0]?.message?.content || "";
  const choice = choiceRaw.trim().toLowerCase();

  // debug log
  console.log("GPT raw response:", JSON.stringify(choiceRaw));
  console.log("Normalized intent:", choice);

  const intentNamesLower = intentNames.map((i) => i.toLowerCase());
  if (intentNamesLower.includes(choice)) {
    // matching index in original intentNames
    return intentNames[intentNamesLower.indexOf(choice)];
  }
  return "none";
}

/**
 * Fallback: generate tên intent mới nếu classifyIntent trả về none
 * @param {string} message
 * @returns {Promise<string>}
 */
async function detectIntentName(message) {
  const prompt = `Phân tích câu sau và trả về tên intent duy nhất, không dấu, không khoảng trắng, dạng snake_case: "${message}"`;

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
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

    const content = response.data.choices?.[0]?.message?.content || "";
    return content
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // bỏ dấu
      .replace(/[^\w\s]/g, "") // bỏ ký tự đặc biệt
      .replace(/\s+/g, "_"); // space -> underscore
  } catch (error) {
    console.error(
      "Error detecting intent:",
      error.response?.data || error.message
    );
    return "unknown_intent";
  }
}

// Main chat endpoint
router.post(
  "/",
  asyncHandler(async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ message: "message là bắt buộc." });
      }

      // 1. Lấy danh sách name của tất cả intents trong DB
      const intentDocs = await Intent.find({}, "name");
      const intentNames = intentDocs.map((i) => i.name);

      // 2. Thử classify vào danh sách hiện có
      let intentName = await classifyIntent(message, intentNames);

      // 3. Nếu classify không match -> fallback detect & generate mới
      if (intentName === "none") {
        intentName = await detectIntentName(message);
      }

      // 4. Tìm intent trên DB; nếu chưa có thì tạo mới
      let intent = await Intent.findOne({ name: intentName });
      if (!intent) {
        intent = await Intent.create({
          name: intentName,
          promptTemplate: DEFAULT_PROMPT,
          aliases: [],
          isLearning: true,
        });
        console.log(`✅ Created new intent: "${intentName}"`);
      } else {
        console.log(`♻️ Reusing existing intent: "${intentName}"`);
      }

      // 5. Gọi chat service
      const { reply } = await sendMessage(message, intentName);

      // 6. Trả về client
      return res.json({
        reply,
        intent: intentName,
      });
    } catch (error) {
      console.error("Error in /api/chat:", error);
      return res.status(500).json({ message: "Lỗi server nội bộ" });
    }
  })
);

// Route test nhanh detectIntentName
router.get(
  "/test-intent",
  asyncHandler(async (req, res) => {
    const testMessage =
      req.query.message || "Tôi muốn đăng ký ngành công nghệ thông tin";
    const intentName = await detectIntentName(testMessage);
    res.json({ message: testMessage, detectedIntent: intentName });
  })
);

module.exports = router;
