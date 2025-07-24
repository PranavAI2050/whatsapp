const express = require("express");
const multer = require("multer");
const fs = require("fs");
const cors = require("cors");
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
const upload = multer({ dest: "uploads/" }); // Temp folder for uploaded images

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const PORT = 5000;
const GEMINI_KEY = process.env.GEMINI_KEY;

// Validate API key at startup
if (!GEMINI_KEY) {
  console.error("❌ GEMINI_KEY not set in environment variables.");
  process.exit(1);
}

// === API Route ===
app.post("/extract-info", upload.single("image"), async (req, res) => {
  try {
    const imagePath = req.file?.path;
    const mimeType = req.file?.mimetype;

    // Basic validation
    if (!imagePath || !mimeType.startsWith("image/")) {
      return res.status(400).json({ error: "Invalid or missing image file" });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_KEY);

//     const PROMPT = `
// You are a document parser. Analyze this driving license image and extract the following fields only:

// Return the result as **valid JSON** with these exact keys:

// {
//   "full_name": "...",
//   "license_number": "...",
//   "date_of_birth": "...",
//   "nationality": "...",
//   "license_expiry_date": "...",
//   "license_issue_date": "...",
//   "place_of_issue": "..."
// }

// ⚠️ If any value is missing or unreadable due to blur, occlusion, or noise, return: "failed to get" as the value for that field.

// Don't include any explanation. Only return the JSON object.
// `;

const PROMPT = `
You are a document parser. Analyze this driving license image and extract the following fields only.

Return the result as a raw JSON object with these exact keys and values:

{
  "full_name": "...",
  "license_number": "...",
  "date_of_birth": "...",
  "nationality": "...",
  "license_expiry_date": "...",
  "license_issue_date": "...",
  "place_of_issue": "..."
}

If any value is missing or unreadable due to blur, occlusion, or noise, return "failed to get" for that field.

Do not include any explanation, formatting, or Markdown. Just return plain JSON.
`;


    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    const imageBase64 = fs.readFileSync(imagePath).toString("base64");

    const result = await model.generateContent([
      { text: PROMPT },
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    // Clean up uploaded temp file
    fs.unlinkSync(imagePath);

    res.json({ result: text });
  } catch (error) {
    console.error("❌ Error:", error.stack || error.message);
    res.status(500).json({ error: "Failed to process image" });
  }
});



app.post('/send-booking-message', async (req, res) => {
  const { phoneNumber, customerName, carName } = req.body;

  if (!phoneNumber || !customerName || !carName) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const url = `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`;

  const headers = {
    'Authorization': `Bearer ${process.env.ACCESS_TOKEN_WHATSAPP}`,
    'Content-Type': 'application/json'
  };

  const payload = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'template',
    template: {
      name: 'book_drive',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName },
            { type: 'text', text: carName }
          ]
        }
      ]
    }
  };

  try {
    const response = await axios.post(url, payload, { headers });
    res.status(200).json({
      message: 'Message sent successfully!',
      wa_response: response.data
    });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to send message.',
      error: error.response?.data || error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});
