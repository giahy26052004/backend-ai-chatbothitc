const { Schema, model } = require("mongoose");

const IntentSchema = new Schema({
  name: { type: String, required: true, unique: true },
  promptTemplate: { type: String, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = model("Intent", IntentSchema);
