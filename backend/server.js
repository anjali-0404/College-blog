const express = require("express");
const mysql = require("mysql");   // ✅ changed from mysql2 → mysql
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MySQL Database Connection
const db = mysql.createConnection({
  host: "localhost",
  user: "trian",   // 🔹 change to your MySQL password
  database: "college_blog"
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed: " + err.stack);
    return;
  }
  console.log("✅ Connected to MySQL as ID " + db.threadId);
});

// JWT Secret
const JWT_SECRET = "your_jwt_secret_key";

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }
    req.user = user;
    next();
  });
};

// ==================== ROUTES ====================

// User Registration
app.post("/api/register", (req, res) => {
  const { firstName, lastName, email, password, role } = req.body;

  db.query("SELECT id FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });

    if (results.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (first_name, last_name, email, password, role) VALUES (?, ?, ?, ?, ?)",
      [firstName, lastName, email, hashedPassword, role],
      (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });

        const token = jwt.sign({ userId: result.insertId, email }, JWT_SECRET, { expiresIn: "24h" });

        res.status(201).json({
          message: "User created successfully",
          token,
          user: {
            id: result.insertId,
            firstName,
            lastName,
            email,
            role
          }
        });
      }
    );
  });
});

// User Login
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });

    if (results.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = results[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "24h" });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role
      }
    });
  });
});

// Get all blogs
app.get("/api/blogs", (req, res) => {
  const query = `
    SELECT blogs.*, users.first_name, users.last_name 
    FROM blogs 
    INNER JOIN users ON blogs.author_id = users.id 
    ORDER BY blogs.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(results);
  });
});

// Get single blog
app.get("/api/blogs/:id", (req, res) => {
  const blogId = req.params.id;

  const query = `
    SELECT blogs.*, users.first_name, users.last_name 
    FROM blogs 
    INNER JOIN users ON blogs.author_id = users.id 
    WHERE blogs.id = ?
  `;

  db.query(query, [blogId], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });

    if (results.length === 0) {
      return res.status(404).json({ error: "Blog not found" });
    }

    res.json(results[0]);
  });
});

// Create new blog
app.post("/api/blogs", authenticateToken, (req, res) => {
  const { title, content } = req.body;
  const authorId = req.user.userId;

  db.query(
    "INSERT INTO blogs (title, content, author_id) VALUES (?, ?, ?)",
    [title, content, authorId],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Database error" });

      res.status(201).json({
        message: "Blog created successfully",
        blogId: result.insertId
      });
    }
  );
});

// Get comments for a blog
app.get("/api/blogs/:id/comments", (req, res) => {
  const blogId = req.params.id;

  const query = `
    SELECT comments.*, users.first_name, users.last_name 
    FROM comments 
    INNER JOIN users ON comments.user_id = users.id 
    WHERE comments.blog_id = ? 
    ORDER BY comments.created_at ASC
  `;

  db.query(query, [blogId], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(results);
  });
});

// Add comment to a blog
app.post("/api/blogs/:id/comments", authenticateToken, (req, res) => {
  const blogId = req.params.id;
  const { content } = req.body;
  const userId = req.user.userId;

  db.query(
    "INSERT INTO comments (blog_id, user_id, content) VALUES (?, ?, ?)",
    [blogId, userId, content],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Database error" });

      res.status(201).json({
        message: "Comment added successfully",
        commentId: result.insertId
      });
    }
  );
});

// Like a blog
app.post("/api/blogs/:id/like", authenticateToken, (req, res) => {
  const blogId = req.params.id;
  const userId = req.user.userId;

  db.query("SELECT id FROM likes WHERE blog_id = ? AND user_id = ?", [blogId, userId], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });

    if (results.length > 0) {
      return res.status(400).json({ error: "You already liked this blog" });
    }

    db.query("INSERT INTO likes (blog_id, user_id) VALUES (?, ?)", [blogId, userId], (err) => {
      if (err) return res.status(500).json({ error: "Database error" });

      res.json({ message: "Blog liked successfully" });
    });
  });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
