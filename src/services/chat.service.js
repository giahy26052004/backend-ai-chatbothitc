require("dotenv").config();
const axios = require("axios");
const Intent = require("../models/intent.model");
const Session = require("../models/session.model");

async function sendMessage(sessionId, userMessage, intentName) {
  let session = sessionId ? await Session.findById(sessionId) : null;
  if (!session) {
    session = await Session.create({ context: [] });
  }

  const intent = await Intent.findOne({ name: intentName });
  if (!intent) {
    const err = new Error(`Intent "${intentName}" không tồn tại.`);
    err.status = 400;
    throw err;
  }

  const systemContent = intent.description
    ? `${intent.description}\n\n${intent.promptTemplate}`
    : intent.promptTemplate;

  const systemMsg = { role: "system", content: systemContent };
  const history = session.context.map(({ role, content }) => ({
    role,
    content,
  }));

  const messages = [
    systemMsg,
    ...history,
    { role: "user", content: userMessage },
  ];

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat:free", // hoặc model bạn muốn dùng
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          Referer: "http://localhost:4000", // hoặc domain app bạn
          "X-Title": "Enrollment Bot",
        },
      }
    );

    const botReplyRaw = response.data.choices[0].message.content;
    const botReply = botReplyRaw ? botReplyRaw.trim() : "";

    // Loại bỏ những message context không hợp lệ trước khi push
    session.context = session.context.filter(
      (msg) => msg.content && msg.content.trim() !== ""
    );

    if (userMessage && userMessage.trim() !== "") {
      session.context.push({ role: "user", content: userMessage });
    }

    if (botReply && botReply.trim() !== "") {
      session.context.push({ role: "assistant", content: botReply });
    }

    if (session.context.length > 40) {
      session.context = session.context.slice(-40);
    }

    session.updatedAt = new Date();
    await session.save();

    return { sessionId: session._id.toString(), reply: botReply };
  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.error(
        "Bạn đã vượt quá quota hoặc bị giới hạn rate limit. Vui lòng kiểm tra tài khoản OpenRouter."
      );
    } else {
      console.error("Lỗi khi gọi API OpenRouter:", error.message);
    }
    throw error;
  }
}

module.exports = { sendMessage };
