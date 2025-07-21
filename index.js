import express from "express";
import path from "path";
import { fileURLToPath } from "url"; // FIXED: Corrected typo here
import * as cheerio from "cheerio";
import axios from "axios";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url); // FIXED: Corrected typo here
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
          "X-Subscription-Token": "YOUR_API_KEY_HERE",
        },
      }
    );

    const $ = cheerio.load(response.data);

    let results = [];
    $(".result").each((i, el) => {
      const a = $(el).find("a.result__a");
      const title = a.text();
      const duckUrl = a.attr("href");
      const snippet = $(el).find(".result__snippet").text();

      // FIXED: Ensure duckUrl exists before processing
      //   if (!duckUrl) {
      //       console.warn("Skipping result: DuckDuckGo URL not found for element", $(el).html());
      //       return;
      //   }

      const urlParams = new URLSearchParams(duckUrl.split("?")[1]);
      const realUrl = urlParams.get("uddg");

      // FIXED: Only push result if realUrl is successfully extracted
      if (realUrl) {
        results.push({
          title,
          url: realUrl,
          snippet,
        });
      } else {
        console.warn(
          "Skipping result: Could not extract real URL from DuckDuckGo URL:",
          duckUrl
        );
      }
    });

    res.json(results);
  } catch (err) {
    console.error("Error fetching DuckDuckGo search results:", err.message);
    res.status(500).json({ error: "Failed to fetch search results." });
  }
});

server.get("/proxy", async (req, res) => {
  // res.setHeader( // Original line, not needed after fixes below
  //   "Content-Security-Policy",
  //   "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  // );

  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing URL");

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      responseType: "arraybuffer", // FIXED: Crucial for handling various encodings
    });

    // Pass through Content-Type from the original response
    const contentType = response.headers["content-type"] || "text/html";
    res.setHeader("Content-Type", contentType);

    res.removeHeader("X-Frame-Options");
    // FIXED: Removed the problematic Content-Security-Policy header setting here
    res.removeHeader("Content-Security-Policy"); // Remove if present from original server

    let html = response.data.toString("utf8"); // Assume UTF-8 for initial processing

    html = html.replace(
      /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*\/?>/gi, // Added /? for self-closing tags
      ""
    );
    html = html.replace(
      /<meta[^>]+http-equiv=["']X-Frame-Options["'][^>]*\/?>/gi, // Added /? for self-closing tags
      ""
    );
    // Also remove referrer meta tags which can sometimes interfere
    html = html.replace(/<meta[^>]+name=["']referrer["'][^>]*\/?>/gi, "");

    const baseTag = `<base href="${targetUrl}">`;
    // FIXED: More robust base tag injection
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
