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
async function classifyIntent(message, intentNames, maxRetries = 3) {
  const listStr = intentNames.join(", ");
  const prompt = `
Bạn là hệ thống phân loại intent.  
Cho trước câu hỏi người dùng và danh sách intent có sẵn, chỉ trả về đúng tên intent từ danh sách nếu có, hoặc "none" nếu không khớp.  
Danh sách intents: [${listStr}]  
Câu hỏi: "${message}"  
=> Chỉ trả về một trong các giá trị: tên_intent | none
  `;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "deepseek/deepseek-prover-v2:free",
          messages: [{ role: "user", content: prompt }],
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      const choice = res.data.choices?.[0]?.message?.content
        .trim()
        .toLowerCase();
      return intentNames.includes(choice) ? choice : "none";
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(
          `classifyIntent: Bị giới hạn rate, thử lại lần ${
            attempt + 1
          }/${maxRetries}`
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        console.error("classifyIntent error:", error.message);
        break;
      }
    }
  }

  return "none";
}

/**
 * Fallback: generate tên intent mới
 * @param {string} message
 * @returns {Promise<string>}
 */
async function detectIntentName(message, maxRetries = 3) {
  const prompt = `Phân tích câu sau và trả về tên intent duy nhất, không dấu, không khoảng trắng, dạng snake_case: "${message}"`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "deepseek/deepseek-prover-v2:free",
          messages: [{ role: "user", content: prompt }],
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            Referer: "http://localhost:4000",
            "X-Title": "Enrollment Bot",
          },
          timeout: 10000,
        }
      );

      const content = response.data.choices?.[0]?.message?.content || "";
      return content
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_");
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(
          `detectIntentName: Bị giới hạn rate, thử lại lần ${
            attempt + 1
          }/${maxRetries}`
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        console.error("detectIntentName error:", error.message);
        break;
      }
    }
  }

  return "unknown_intent";
}

// Main chat endpoint
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { sessionId, message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: "message là bắt buộc." });
    }

    // 1. load danh sách intents hiện có
    const intentNames = (await Intent.find({}, "name")).map((i) => i.name);

    // 2. thử classify vào danh sách hiện có
    let intentName = await classifyIntent(message, intentNames);

    // 3. nếu không khớp thì detect tên mới
    if (intentName === "none") {
      intentName = await detectIntentName(message);
    }

    // 4. tìm hoặc tạo intent trong DB
    let intent = await Intent.findOne({ name: intentName });
    if (!intent) {
      intent = await Intent.create({
        name: intentName,
        promptTemplate: DEFAULT_PROMPT,
        aliases: [],
        isLearning: true,
      });
    }

    // 5. gọi service chat để gửi message và lưu session
    const { sessionId: newSessionId, reply } = await sendMessage(
      sessionId,
      message,
      intent.name
    );

    // 6. trả về client
    res.json({
      sessionId: newSessionId,
      reply,
      intent: intent.name,
    });
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
