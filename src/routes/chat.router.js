// File: routes/chat.route.js

require("dotenv").config(); // Load biến môi trường từ .env
const express = require("express");
const asyncHandler = require("express-async-handler");
const axios = require("axios");
const Intent = require("../models/intent.model");
const { sendMessage } = require("../services/chat.service");

const router = express.Router();

/**
 * Gửi câu hỏi lên OpenRouter API để phân tích và trả về tên intent dạng snake_case không dấu
 * @param {string} message - Câu user gửi lên để phân tích intent
 * @returns {string} Tên intent (snake_case, không dấu)
 */
async function detectIntentName(message) {
  // Tạo prompt để yêu cầu API trả về tên intent duy nhất, không dấu, snake_case
  const prompt = `Phân tích câu sau và trả về tên intent duy nhất, không dấu, không khoảng trắng, dạng snake_case: "${message}"`;

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat:free",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          Referer: "http://localhost:4000", // Thay URL của bạn nếu khác
          "X-Title": "Enrollment Bot", // Tên app để dễ quản lý log
        },
      }
    );

    // Lấy content trả về và chuẩn hóa thành snake_case
    const content = response.data.choices?.[0]?.message?.content || "";
    return content
      .trim()
      .toLowerCase()
      .normalize("NFD") // tách ký tự có dấu thành ký tự và dấu riêng
      .replace(/[\u0300-\u036f]/g, "") // loại bỏ dấu
      .replace(/\s+/g, "_"); // thay khoảng trắng thành dấu _
  } catch (error) {
    // Log lỗi chi tiết
    console.error(
      "Error detecting intent:",
      error.response?.data || error.message
    );
    return "unknown_intent"; // Trả về intent mặc định khi lỗi
  }
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { sessionId, message } = req.body;

    if (!message) {
      return res.status(400).json({ message: "message là bắt buộc." });
    }

    try {
      // Phân tích intent từ message
      const intentName = await detectIntentName(message);

      // Tìm intent trong DB, nếu chưa có thì tạo mới
      let intent = await Intent.findOne({ name: intentName });

      if (!intent) {
        intent = await Intent.create({
          name: intentName,
          promptTemplate:
            "không trả thêm thôg tin của trường khác Bạn là chuyên viên tư vấn tuyển sinh của Trường Cao đẳng Công Thương TP. Hồ Chí Minh, trả lời thân thiện, nhiệt tình và lịch sự. Hỗ trợ học viên hiểu rõ về các ngành học, quy trình đăng ký, học phí, và các chính sách học bổng của trường.",
          isLearning: true,
        });
      }

      // Gửi message, sessionId và intentName vào service chat để nhận reply
      const { sessionId: newSessionId, reply } = await sendMessage(
        sessionId,
        message,
        intent.name
      );

      // Trả về kết quả cho client
      res.json({ sessionId: newSessionId, reply, intent: intent.name });
    } catch (error) {
      console.error("Error in chat endpoint:", error);
      res.status(500).json({ message: "Internal server error" });
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
