require("dotenv").config();

const express = require("express");
const axios = require("axios");
const app = express();
const port = process.env.PORT;

app.use(express.json());

const requestQueue = [];
let isProcessingQueue = false;

const RATE_LIMIT_INTERVAL = 1000; // 1초 (밀리초)
const MAX_REQUESTS_PER_INTERVAL = 2;

async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) {
    return;
  }
  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    const { discordWebhookUrl, payload, res } = requestQueue.shift();

    try {
      console.log(`Sending webhook to ${discordWebhookUrl} with payload:`, payload); // 디버깅용
      const discordResponse = await axios.post(discordWebhookUrl, payload);
      console.log("Discord API response:", discordResponse.status, discordResponse.data);
      res.status(200).send({ success: true, message: "Message sent to Discord." });
    } catch (error) {
      console.error("Error sending message to Discord:", error.response ? error.response.data : error.message);
      if (error.response && error.response.status === 429) {
        const retryAfter = error.response.headers["retry-after"] || 1000;
        console.warn(`Discord Rate Limited. Retrying after ${retryAfter}ms.`);
        requestQueue.unshift({ discordWebhookUrl, payload, res });
        await new Promise((resolve) => setTimeout(resolve, parseInt(retryAfter) + 100));
      } else {
        res.status(500).send({ success: false, message: "Failed to send message to Discord.", error: error.message });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_INTERVAL / MAX_REQUESTS_PER_INTERVAL));
  }

  isProcessingQueue = false;
}

app.post("/api/webhooks/:id/:token", (req, res) => {
  const { id, token } = req.params;
  const payload = req.body;

  if (!id || !token) {
    return res.status(400).send({ success: false, message: "Discord webhook ID and token must be provided in the URL path." });
  }

  if (!payload || Object.keys(payload).length === 0) {
    return res.status(400).send({ success: false, message: "Request body cannot be empty." });
  }

  const discordWebhookUrl = `https://discord.com/api/webhooks/${id}/${token}`;

  requestQueue.push({ discordWebhookUrl, payload, res });
  processQueue();
});

// 서버 시작
app.listen(port, () => {
  console.log(`Discord Webhook Proxy listening at http://localhost:${port}`);
  console.log(`Expected webhook format: http://localhost:${port}/api/webhooks/:id/:token`);
});
