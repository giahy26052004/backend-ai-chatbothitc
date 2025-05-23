const { Schema, model } = require("mongoose");

const MessageItem = new Schema(
  {
    role: {
      type: String,
      enum: ["system", "user", "assistant"],
      required: true,
    },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SessionSchema = new Schema({
  context: { type: [MessageItem], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

// Xoá session tự động sau 1h không cập nhật
SessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = model("Session", SessionSchema);
