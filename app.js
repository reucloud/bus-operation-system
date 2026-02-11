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
    return res.redirect("/destinationSetting");
  }
  if (forceView === "desktop") {
    return res.render("operationTime");
  }

  // 通常のUser-Agent判定
  const ua = req.headers["user-agent"] || "";
  const isTablet = /iPad|Android.*Tablet/i.test(ua);

  if (isTablet) {
    // iPad用画面
    res.redirect("/destinationSetting");
  } else {
    // デスクトップ（モニター）用画面
    res.render("operationTime");
  }
});

app.get("/destinationSetting", (req, res) => {
  const sql = `
    SELECT DISTINCT
  r.id AS routeId,
  r.route_number AS routeNumber, 
  r.route_name AS routeName
FROM routes r 
JOIN route_stops rs ON r.id = rs.route_id 
WHERE rs.last_stop = 1;
  `;

  connection.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching routes:", err);
      return res.status(500).send("Internal Server Error");
    }

    // デバッグ用：取得したデータをコンソールに表示
    console.log("Routes data:", results);
    console.log("Number of routes:", results.length);

    // 駅データをビューに渡す
    res.render("destinationSetting", {
      routes: results,
      stations: [],
      countStations: 0,
    });
  });
});

// 系統設定画面（タブレット画面）へのルート
app.get("/api/destinations/:routeId", (req, res) => {
  const routeId = req.params.routeId;

  console.log("Fetching destinations for route ID:", routeId);

  const sql = `
    SELECT 
      s.id AS stopId,
      s.name_jp AS destination
    FROM route_stops rs
    JOIN stops s ON rs.stop_id = s.id
    WHERE rs.route_id = ? AND rs.last_stop = 1
  `;

  connection.query(sql, [routeId], (err, results) => {
    if (err) {
      console.error("Error fetching destinations:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    console.log("Destinations found:", results);
    res.json(results);
  });
});

app.get("/api/stations", (req, res) => {
  const routeId = req.query.routeId;
  const destinationId = req.query.destination;

  console.log("routeId:", routeId);
  console.log("destinationId:", destinationId);

  const destinationSql = `
    SELECT 
      s.id AS stopId,
      s.name_jp AS destination
    FROM route_stops rs
    JOIN stops s ON rs.stop_id = s.id
    WHERE rs.route_id = ? AND rs.last_stop = 1
  `;

  const stationsSql = `
    SELECT
  s.name_jp AS stationName
FROM route_stops rs
JOIN stops s ON rs.stop_id = s.id
WHERE rs.route_id = ?
AND (
  -- 名古屋駅行きなら全駅出す
  (
    SELECT stop_order
    FROM route_stops
    WHERE route_id = ?
      AND stop_id = ?
  ) = (
    SELECT MIN(stop_order)
    FROM route_stops
    WHERE route_id = ?
  )
  OR
  -- それ以外（東海橋など）は途中まで
  rs.stop_order <= (
    SELECT stop_order
    FROM route_stops
    WHERE route_id = ?
      AND stop_id = ?
  )
)
ORDER BY
  CASE
    -- 名古屋駅行きなら逆順
    WHEN (
      SELECT stop_order
      FROM route_stops
      WHERE route_id = ?
        AND stop_id = ?
    ) = (
      SELECT MIN(stop_order)
      FROM route_stops
      WHERE route_id = ?
    )
    THEN rs.stop_order * -1
    ELSE rs.stop_order
  END;
  `;

  connection.query(
    stationsSql,
    [
      routeId,
      routeId,
      destinationId,
      routeId,
      routeId,
      destinationId,
      routeId,
      destinationId,
      routeId,
    ],
    (err, stations) => {
      console.log("stations:", stations); // ←これも入れて
      if (err) {
        console.error("Error fetching stations:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      connection.query(destinationSql, [routeId], (err, destinations) => {
        if (err) {
          console.error("Error fetching destinations:", err);
          return res.status(500).json({ error: "Internal Server Error" });
        }

        res.json({
          stations: stations,
          countStations: stations.length,
          destinations: destinations,
        });
      });
    },
  );
});

// 全駅表示画面（デスクトップ画面）へのルート
app.get("/navigation", (req, res) => {
  res.render("navigation");
});

// 時刻管理画面（画面）へのルート
app.get("/operationTime", (req, res) => {
  res.render("operationTime");
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
