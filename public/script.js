const API = "";
const SESSION_DURATION_MS = 60 * 60 * 1000;

const PUBLIC_PAGES = ["login.html", "register.html"];
const currentPage = window.location.pathname.split("/").pop() || "index.html";

function getSession() {
  const token = localStorage.getItem("token");
  const expiresAt = Number(localStorage.getItem("sessionExpiresAt"));
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (!token || !expiresAt || Date.now() > expiresAt) {
    clearSession();
    return null;
  }

  return { token, user, expiresAt };
}

function saveSession(token, user) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("sessionExpiresAt", String(Date.now() + SESSION_DURATION_MS));
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("sessionExpiresAt");
}

function isPublicPage() {
  return PUBLIC_PAGES.includes(currentPage);
}

function redirectAfterLogin(user) {
  if (user.role === "admin") {
    window.location.replace("admin.html");
  } else {
    window.location.replace("index.html");
  }
}

function updateNav() {
  const session = getSession();
  const nav = document.querySelector(".site-header nav");

  if (!nav || !session) {
    return;
  }

  const loginLink = nav.querySelector('a[href="login.html"]');
  if (loginLink) {
    loginLink.remove();
  }

  if (!nav.querySelector("#logoutBtn")) {
    const logoutLink = document.createElement("a");
    logoutLink.href = "#";
    logoutLink.id = "logoutBtn";
    logoutLink.textContent = "Đăng xuất";
    logoutLink.addEventListener("click", function(e) {
      e.preventDefault();
      clearSession();
      window.location.replace("login.html");
    });
    nav.appendChild(logoutLink);
  }

  const adminLink = nav.querySelector('a[href="admin.html"]');
  if (adminLink && session.user.role !== "admin") {
    adminLink.remove();
  }
}

function enforceAuth() {
  const session = getSession();

  if (isPublicPage()) {
    if (session) {
      redirectAfterLogin(session.user);
    }
    return null;
  }

  if (!session) {
    window.location.replace("login.html");
    return null;
  }

  if (currentPage === "admin.html" && session.user.role !== "admin") {
    window.location.replace("index.html");
    return null;
  }

  updateNav();
  return session;
}

const session = enforceAuth();
const token = session?.token;
const user = session?.user;

async function loadBooks() {
  const bookList = document.getElementById("bookList");

  if (!bookList) return;

  const res = await fetch(`${API}/api/books`);
  const books = await res.json();

  bookList.innerHTML = "";

  if (books.length === 0) {
    bookList.innerHTML = "<p>Chưa có sách nào trong hệ thống.</p>";
    return;
  }

  books.forEach(book => {
    const card = document.createElement("div");
    card.className = "book-card";

    card.innerHTML = `
      <h3>${book.name}</h3>
      <p><strong>Loại:</strong> ${book.category}</p>
      <p><strong>Tình trạng:</strong> ${book.condition}</p>
      <p><strong>Người gửi:</strong> ${book.ownerName || "Chưa có"}</p>
      <p class="price">${book.price.toLocaleString("vi-VN")} VND</p>
      <p><strong>Trạng thái:</strong> ${book.status}</p>
      <p><strong>Còn:</strong> ${book.daysLeft} ngày</p>
    `;

    bookList.appendChild(card);
  });
}

async function loadAdminBooks() {
  const adminBookList = document.getElementById("adminBookList");
  const adminInfo = document.getElementById("adminInfo");

  if (!adminBookList || !session) return;

  if (adminInfo) {
    adminInfo.innerHTML = `Xin chào Admin: ${user.name}`;
  }

  const res = await fetch(`${API}/api/books`);
  const books = await res.json();

  adminBookList.innerHTML = "";

  if (books.length === 0) {
    adminBookList.innerHTML = "<p>Chưa có sách nào cần quản lý.</p>";
    return;
  }

  books.forEach(book => {
    const card = document.createElement("div");
    card.className = "book-card";

    card.innerHTML = `
      <h3>${book.name}</h3>
      <p><strong>Loại:</strong> ${book.category}</p>
      <p><strong>Tình trạng:</strong> ${book.condition}</p>
      <p><strong>Người gửi:</strong> ${book.ownerName || "Chưa có"}</p>
      <p class="price">${book.price.toLocaleString("vi-VN")} VND</p>
      <p><strong>Trạng thái:</strong> ${book.status}</p>
      <button onclick="approveBook(${book.id})">Duyệt sách</button>
      <button class="delete-btn" onclick="deleteBook(${book.id})">Xóa</button>
    `;

    adminBookList.appendChild(card);
  });
}

const bookForm = document.getElementById("bookForm");

if (bookForm) {
  bookForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    const activeSession = getSession();
    if (!activeSession) {
      window.location.replace("login.html");
      return;
    }

    const book = {
      name: document.getElementById("name").value,
      category: document.getElementById("category").value,
      condition: document.getElementById("condition").value,
      price: document.getElementById("price").value
    };

    const res = await fetch(`${API}/api/books`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${activeSession.token}`
      },
      body: JSON.stringify(book)
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.message || "Không thể gửi sách. Vui lòng đăng nhập lại.");
      if (res.status === 401 || res.status === 403) {
        clearSession();
        window.location.replace("login.html");
      }
      return;
    }

    alert("Đã gửi sách chờ admin duyệt.");
    bookForm.reset();
    window.location.href = "book.html";
  });
}

const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    const loginData = {
      email: document.getElementById("email").value,
      password: document.getElementById("password").value
    };

    const res = await fetch(`${API}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(loginData)
    });

    const data = await res.json();

    if (!res.ok) {
      document.getElementById("loginMessage").innerText = data.message;
      return;
    }

    saveSession(data.token, data.user);
    redirectAfterLogin(data.user);
  });
}

const registerForm = document.getElementById("registerForm");

if (registerForm) {
  registerForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    const registerData = {
      name: document.getElementById("registerName").value,
      email: document.getElementById("registerEmail").value,
      password: document.getElementById("registerPassword").value
    };

    const res = await fetch(`${API}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(registerData)
    });

    const data = await res.json();
    const messageEl = document.getElementById("registerMessage");
    messageEl.innerText = data.message;

    if (res.ok) {
      registerForm.reset();
      setTimeout(() => {
        window.location.href = "login.html";
      }, 1500);
    }
  });
}

async function approveBook(id) {
  const activeSession = getSession();
  if (!activeSession) {
    window.location.replace("login.html");
    return;
  }

  await fetch(`${API}/api/books/${id}/approve`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${activeSession.token}`
    }
  });

  loadAdminBooks();
}

async function deleteBook(id) {
  const activeSession = getSession();
  if (!activeSession) {
    window.location.replace("login.html");
    return;
  }

  await fetch(`${API}/api/books/${id}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${activeSession.token}`
    }
  });

  loadAdminBooks();
}

if (session) {
  loadBooks();
  loadAdminBooks();
}
