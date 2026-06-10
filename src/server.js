const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3001;
const SECRET_KEY = "tram_gui_secret_key";

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

let users = [
  {
    id: 1,
    name: "Admin",
    email: "admin@tramgui.com",
    password: bcrypt.hashSync("123456", 10),
    role: "admin"
  }
];

let books = [
  {
    id: 1,
    name: "Kinh tế vi mô",
    category: "Giáo trình",
    condition: "Loại A",
    price: 65000,
    status: "Đang bán",
    ownerName: "Hệ thống",
    daysLeft: 20
  },
  {
    id: 2,
    name: "English Grammar in Use",
    category: "Sách ngoại ngữ",
    condition: "Loại B",
    price: 80000,
    status: "Đang bán",
    ownerName: "Hệ thống",
    daysLeft: 18
  }
];

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }

  try {
    req.user = jwt.verify(token, SECRET_KEY);
    next();
  } catch {
    res.status(403).json({ message: "Token không hợp lệ" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Chỉ admin được phép thao tác" });
  }

  next();
}

app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;

  const existedUser = users.find(user => user.email === email);

  if (existedUser) {
    return res.status(400).json({ message: "Email đã tồn tại" });
  }

  const newUser = {
    id: Date.now(),
    name,
    email,
    password: await bcrypt.hash(password, 10),
    role: "user"
  };

  users.push(newUser);

  res.json({ message: "Đăng ký thành công" });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const user = users.find(user => user.email === email);

  if (!user) {
    return res.status(400).json({ message: "Sai email hoặc mật khẩu" });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(400).json({ message: "Sai email hoặc mật khẩu" });
  }

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    SECRET_KEY,
    { expiresIn: "1d" }
  );

  res.json({
    message: "Đăng nhập thành công",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

app.get("/api/books", (req, res) => {
  res.json(books);
});

app.post("/api/books", auth, (req, res) => {
  const newBook = {
    id: Date.now(),
    name: req.body.name,
    category: req.body.category,
    condition: req.body.condition,
    price: Number(req.body.price),
    status: "Chờ admin duyệt",
    ownerId: req.user.id,
    ownerName: req.user.name,
    daysLeft: 30
  };

  books.push(newBook);

  res.json(newBook);
});

app.put("/api/books/:id/approve", auth, adminOnly, (req, res) => {
  const book = books.find(book => book.id === Number(req.params.id));

  if (!book) {
    return res.status(404).json({ message: "Không tìm thấy sách" });
  }

  book.status = "Đang bán";

  res.json(book);
});

app.delete("/api/books/:id", auth, adminOnly, (req, res) => {
  books = books.filter(book => book.id !== Number(req.params.id));

  res.json({ message: "Đã xóa sách" });
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});