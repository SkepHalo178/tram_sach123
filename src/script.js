const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
//const PORT = process.env.PORT || 3001;
const SECRET_KEY = process.env.JWT_SECRET || "tram_gui_secret_key";
const CONSIGNMENT_DAYS = 30;
const DEFAULT_SELLER_ID = 1;

const ADMIN_USERNAMES = ["admin@tramgui.com"];

const DB_CATEGORIES = ["Giáo trình", "Ngoại ngữ", "Kỹ năng", "Sách Truyện"];
const DB_GRADES = ["A", "B", "C"];
const DB_STATUSES = ["Đang bán", "Đã bán", "Đang giữ hàng"];

const CATEGORY_TO_DB = {
  "Giáo trình": "Giáo trình",
  "Sách ngoại ngữ": "Ngoại ngữ",
  "Sách kỹ năng": "Kỹ năng",
  "Sách ôn thi": "Sách Truyện"
};

const CATEGORY_FROM_DB = {
  "Giáo trình": "Giáo trình",
  "Ngoại ngữ": "Sách ngoại ngữ",
  "Kỹ năng": "Sách kỹ năng",
  "Sách Truyện": "Sách ôn thi"
};

const CONDITION_TO_GRADE = {
  "Loại A - Còn mới": "A",
  "Loại A": "A",
  "Loại B - Đã sử dụng": "B",
  "Loại B": "B",
  "Loại C - Cũ nhưng còn dùng tốt": "C",
  "Loại C": "C",
  A: "A",
  B: "B",
  C: "C"
};

const GRADE_TO_LABEL = {
  A: "Loại A - Còn mới",
  B: "Loại B - Đã sử dụng",
  C: "Loại C - Cũ nhưng còn dùng tốt"
};

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 4000,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "qtda",
  ssl: {
    minVersion: "TLSv1.2",
    rejectUnauthorized: false,
    ca: fs.readFileSync(path.join(__dirname, "..", "cert", "isrgrootx1.pem"))
  },
  waitForConnections: true,
  connectionLimit: 10
});

const publicDir = path.join(__dirname, "..", "public");

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

app.use(express.static(publicDir));

function getUserRole(username) {
  return ADMIN_USERNAMES.includes(username) ? "admin" : "user";
}

function mapBookRow(row) {
  const postedAt = row.posted_at ? new Date(row.posted_at) : new Date();
  const daysElapsed = Math.floor((Date.now() - postedAt.getTime()) / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, CONSIGNMENT_DAYS - daysElapsed);

  let status = row.status;
  if (status === "Đang giữ hàng") {
    status = "Chờ admin duyệt";
  }

  return {
    id: row.book_id,
    name: row.title,
    category: CATEGORY_FROM_DB[row.category] || row.category,
    condition: GRADE_TO_LABEL[row.condition_grade] || row.condition_grade,
    price: row.price,
    status,
    ownerId: row.seller_id,
    ownerName: row.seller_name || "Chưa có",
    daysLeft
  };
}

function validateRegisterInput({ name, email, password }) {
  if (!name || !String(name).trim()) {
    return "Họ tên không được để trống";
  }

  if (!email || !String(email).trim()) {
    return "Email không được để trống";
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(String(email).trim())) {
    return "Email không hợp lệ";
  }

  if (!password || String(password).length < 6) {
    return "Mật khẩu phải có ít nhất 6 ký tự";
  }

  return null;
}

function validateBookInput({ name, category, condition, price }) {
  if (!name || !String(name).trim()) {
    return "Tên sách không được để trống";
  }

  const dbCategory = CATEGORY_TO_DB[category] || category;
  if (!DB_CATEGORIES.includes(dbCategory)) {
    return "Loại sách không hợp lệ";
  }

  const grade = CONDITION_TO_GRADE[condition];
  if (!grade || !DB_GRADES.includes(grade)) {
    return "Tình trạng sách phải là loại A, B hoặc C";
  }

  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return "Giá phải là số dương";
  }

  return null;
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }

  try {
    req.user = jwt.verify(token, SECRET_KEY);
    next();
  } catch {
    return res.status(403).json({ message: "Token không hợp lệ" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Chỉ admin được phép thao tác" });
  }

  next();
}

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const validationError = validateRegisterInput({ name, email, password });

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const username = String(email).trim().toLowerCase();

    const [existing] = await pool.query(
      "SELECT user_id FROM users WHERE username = ?",
      [username]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "Email đã tồn tại" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (username, password_hash, full_name) VALUES (?, ?, ?)",
      [username, passwordHash, String(name).trim()]
    );

    res.json({ message: "Đăng ký thành công" });
  } catch (err) {
    console.error("POST /api/register:", err.message);
    res.status(500).json({ message: "Lỗi hệ thống khi đăng ký" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Sai email hoặc mật khẩu" });
    }

    const username = String(email).trim().toLowerCase();

    const [rows] = await pool.query(
      "SELECT user_id, username, password_hash, full_name FROM users WHERE username = ?",
      [username]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: "Sai email hoặc mật khẩu" });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ message: "Sai email hoặc mật khẩu" });
    }

    const role = getUserRole(user.username);
    const token = jwt.sign(
      {
        id: user.user_id,
        name: user.full_name,
        email: user.username,
        role
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user.user_id,
        name: user.full_name,
        email: user.username,
        role
      }
    });
  } catch (err) {
    console.error("POST /api/login:", err.message);
    res.status(500).json({ message: "Lỗi hệ thống khi đăng nhập" });
  }
});

app.get("/api/books", async (req, res) => {
  try {
    const status = req.query.status;

    let sql = `
      SELECT b.*, u.full_name AS seller_name
      FROM books b
      LEFT JOIN users u ON b.seller_id = u.user_id
    `;
    const params = [];

    if (status && DB_STATUSES.includes(status)) {
      sql += " WHERE b.status = ?";
      params.push(status);
    }

    sql += " ORDER BY b.posted_at DESC";

    const [rows] = await pool.query(sql, params);
    res.json(rows.map(mapBookRow));
  } catch (err) {
    console.error("GET /api/books:", err.message);
    res.status(500).json({ message: "Không thể tải danh sách sách" });
  }
});

app.post("/api/books", auth, async (req, res) => {
  try {
    const { name, category, condition, price } = req.body;
    const validationError = validateBookInput({ name, category, condition, price });

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const dbCategory = CATEGORY_TO_DB[category] || category;
    const conditionGrade = CONDITION_TO_GRADE[condition];
    const sellerId = req.user?.id || DEFAULT_SELLER_ID;

    const [result] = await pool.query(
      `INSERT INTO books (title, category, condition_grade, price, seller_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        dbCategory,
        conditionGrade,
        Math.round(Number(price)),
        sellerId,
        "Đang giữ hàng"
      ]
    );

    const [rows] = await pool.query(
      `SELECT b.*, u.full_name AS seller_name
       FROM books b
       LEFT JOIN users u ON b.seller_id = u.user_id
       WHERE b.book_id = ?`,
      [result.insertId]
    );

    res.status(201).json(mapBookRow(rows[0]));
  } catch (err) {
    console.error("POST /api/books:", err.message);
    res.status(500).json({ message: "Không thể thêm sách" });
  }
});

app.put("/api/books/:id/approve", auth, adminOnly, async (req, res) => {
  try {
    const bookId = Number(req.params.id);

    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ message: "ID sách không hợp lệ" });
    }

    const [existing] = await pool.query(
      "SELECT book_id FROM books WHERE book_id = ?",
      [bookId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy sách" });
    }

    await pool.query(
      "UPDATE books SET status = ? WHERE book_id = ?",
      ["Đang bán", bookId]
    );

    const [rows] = await pool.query(
      `SELECT b.*, u.full_name AS seller_name
       FROM books b
       LEFT JOIN users u ON b.seller_id = u.user_id
       WHERE b.book_id = ?`,
      [bookId]
    );

    res.json(mapBookRow(rows[0]));
  } catch (err) {
    console.error("PUT /api/books/:id/approve:", err.message);
    res.status(500).json({ message: "Không thể duyệt sách" });
  }
});

app.delete("/api/books/:id", auth, adminOnly, async (req, res) => {
  try {
    const bookId = Number(req.params.id);

    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ message: "ID sách không hợp lệ" });
    }

    const [result] = await pool.query(
      "DELETE FROM books WHERE book_id = ?",
      [bookId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy sách" });
    }

    res.json({ message: "Đã xóa sách" });
  } catch (err) {
    console.error("DELETE /api/books/:id:", err.message);
    res.status(500).json({ message: "Không thể xóa sách" });
  }
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ message: "Lỗi hệ thống" });
});

/*app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});*/
module.exports = app;
