const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");

// Routes
const chatRouter = require("./routes/chat.router");
const intentsRouter = require("./routes/admin/intents.router");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Global middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));

// Endpoints
app.use("/api/chat", chatRouter);
app.use("/api/admin/intents", intentsRouter);

// Error handler (cuối cùng)
app.use(errorHandler);

module.exports = app;
