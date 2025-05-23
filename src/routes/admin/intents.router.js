const express = require("express");
const { body, validationResult } = require("express-validator");
const asyncHandler = require("express-async-handler");
const Intent = require("../../models/intent.model");

const router = express.Router();

// Tạo intent mới
router.post(
  "/",
  body("name").notEmpty(),
  body("promptTemplate").notEmpty(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { name, promptTemplate, description } = req.body;
    const existing = await Intent.findOne({ name });
    if (existing) {
      return res.status(409).json({ message: "Intent đã tồn tại." });
    }
    const intent = await Intent.create({ name, promptTemplate, description });
    res.status(201).json(intent);
  })
);

// Lấy list intents
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const list = await Intent.find().sort("createdAt");
    res.json(list);
  })
);

// Cập nhật intent
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const intent = await Intent.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!intent)
      return res.status(404).json({ message: "Không tìm thấy Intent." });
    res.json(intent);
  })
);

// Xóa intent
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await Intent.findByIdAndDelete(req.params.id);
    res.status(204).end();
  })
);

module.exports = router;
