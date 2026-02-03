import express from "express";
import session from "express-session";
import mysql from "mysql2";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import open from "open";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// パースと静的ファイル
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// MySQL 接続 (mysql2 を使用)
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
});

connection.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    return;
  }
  console.log("Connected to the MySQL database.");
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: true,
  }),
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// 簡単なルート（デバイス判定）
app.get("/", (req, res) => {
  // URLパラメータで強制指定できる (?view=desktop または ?view=tablet)
  const forceView = req.query.view;

  if (forceView === "tablet") {
    return res.render("index-tablet");
  }
  if (forceView === "desktop") {
    return res.render("index-desktop");
  }

  // 通常のUser-Agent判定
  const ua = req.headers["user-agent"] || "";
  const isTablet = /iPad|Android.*Tablet/i.test(ua);

  if (isTablet) {
    // iPad用画面
    res.render("index-tablet");
  } else {
    // デスクトップ（モニター）用画面
    res.render("index-desktop");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  const baseUrl = `http://localhost:${PORT}`;
  console.log(`Server listening on ${baseUrl}`);
  console.log("Opening 2 windows...");
  console.log(`Desktop view: ${baseUrl}?view=desktop`);
  console.log(`Tablet view: ${baseUrl}?view=tablet`);

  // デスクトップ画面を開く
  await open(`${baseUrl}?view=desktop`, { app: { name: "google chrome" } });

  // 少し待ってからiPad画面を開く
  setTimeout(() => {
    open(`${baseUrl}?view=tablet`, { app: { name: "google chrome" } });
  }, 1000);
});
