import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server = express();

server.use(express.static("./public"));

server.get("/search", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.use("/", express.static("./realSite"));

server.get("/api/search", async (req, res) => {
  let query = req.query.q;

  try {
    let response = await axios.get(
      `https://api.search.brave.com/res/v1/web/search`,
      {
        params: { q: query },
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": process.env.BRAVE_API,
        },
      }
    );

    const $ = cheerio.load(response.data);

    const results = response.data.web.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));

    res.json(results);
  } catch (err) {
    console.error("Error fetching DuckDuckGo search results:", err.message);
    res.status(500).json({ error: "Failed to fetch search results." });
  }
});

server.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing URL");

  try {
    const response = await axios.get(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      responseType: "arraybuffer",
    });

    delete response.headers["x-frame-options"];
    delete response.headers["content-security-policy"];

    const contentType = response.headers["content-type"] || "text/html";
    res.setHeader("Content-Type", contentType);

    res.setHeader("X-Frame-Options", "");
    res.setHeader("Content-Security-Policy", "");

    let html = response.data.toString("utf8"); // Assume UTF-8 for initial processing

    const baseTag = `<base href="${targetUrl}">`;

    // AFTER FETCHING THE TARGET PAGE AND LOADING `html` STRING:
    html = html

      .replace(
        /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
        ""
      )

      .replace(/<meta[^>]+http-equiv=["']X-Frame-Options["'][^>]*>/gi, "")

      .replace(/<meta[^>]+name=["']referrer["'][^>]*>/gi, "");

    // INJECT BASE TAG FOR RELATIVE LINKS
    if (html.includes("<head>")) {
      html = html.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}`);
    } else {
      html = `<head>${baseTag}</head>` + html;
    }

    html = html.replace(/<a\s+[^>]*href="([^"]+)"/gi, (match, href) => {
      if (href.startsWith("http")) {
        return match.replace(href, `/proxy?url=${encodeURIComponent(href)}`);
      }

      const absolute = new URL(href, targetUrl).toString();

      return match.replace(href, `/proxy?url=${encodeURIComponent(absolute)}`);
    });

    if (html.includes("<head>")) {
      html = html.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}`);
    } else if (html.includes("<html>")) {
      html = html.replace(
        /<html[^>]*>/i,
        (match) => `${match}\n<head>${baseTag}</head>`
      );
    } else {
      html = `<head>${baseTag}</head>` + html; // Fallback if no head or html tag
    }

    res.setHeader("Access-Control-Allow-Origin", "*");

    res.send(html);
  } catch (err) {
    console.error("Proxy error:", err.message); // Log the actual error
    if (err.response) {
      res
        .status(err.response.status)
        .send(
          `Failed to fetch target site: ${
            err.response.statusText || err.message
          }`
        );
    } else if (err.request) {
      res
        .status(504)
        .send("Failed to fetch target site: No response from target server.");
    } else {
      res
        .status(500)
        .send("Failed to fetch target site: An unexpected error occurred.");
    }
  }
});

server.listen(8080, () => {
  console.log("Listening on http://localhost:8080");
});
