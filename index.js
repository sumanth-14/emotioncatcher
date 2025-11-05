require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");

const app = express();
const PORT =3000;
const JWT_SECRET = "secretkey123456"


const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const USERS_FILE = path.join(__dirname, "data", "users.json");
const EMOTIONS_FILE = path.join(__dirname, "data", "emotions.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// read/write JSON files
function readJson(filePath) {

  const content = fs.readFileSync(filePath, "utf8");

  try {
    return JSON.parse(content);
  } catch (err) {
    console.error("Error parsing JSON for", filePath, err);
    return [];
  }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}



// JWT auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Missing token" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    req.user = user;
    next();
  });
}

// Role-based authorization
function authorizeRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

// Routes

// Login: returns token + user info
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const users = readJson(USERS_FILE);

  const user = users.find(
    u => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const payload = {
    id: user.id,
    username: user.username,
    role: user.role
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "2h" });

  res.json({ token, user: payload });
});

// Current user
app.get("/api/me", authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Get Emotion table (for both roles)
app.get("/api/emotions", authenticateToken, (req, res) => {
  const emotions = readJson(EMOTIONS_FILE);
  res.json(emotions);
});



// Analyze text (admin only)
app.post(
  "/api/emotions/analyze",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { text } = req.body;

      if (!text || text.trim().length === 0) {
        return res.status(400).json({ message: "Text is required." });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res
          .status(500)
          .json({ message: "OPENAI_API_KEY is not set on the server." });
      }

      const prompt = `
You are an assistant that summarizes a piece of text and detects its overall emotion.
Return a JSON object with two keys:
  "summary" - one short sentence summary of the text.
  "emotion" - one of: "positive", "negative", "neutral", or "mixed".

Text:
"""${text}"""
`;

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You answer using only valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3
      });

      const raw = completion.choices[0].message.content.trim();

      let result;
      try {
        result = JSON.parse(raw);
      } catch (err) {
        console.warn("OpenAI did not return pure JSON, using fallback.", raw);
        result = {
          summary: raw,
          emotion: "unknown"
        };
      }

      const emotions = readJson(EMOTIONS_FILE);
      const newEntry = {
        id: emotions.length > 0 ? emotions[emotions.length - 1].id + 1 : 1,
        text,
        summary: result.summary,
        emotion: result.emotion,
        createdBy: req.user.username,
        createdAt: new Date().toISOString()
      };

      emotions.push(newEntry);
      writeJson(EMOTIONS_FILE, emotions);

      res.json(newEntry);
    } catch (err) {
      console.error("Error in /api/emotions/analyze", err);
      res.status(500).json({ message: "Server error while analyzing text." });
    }
  }
);

// Fallback for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
