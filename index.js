import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import axios from "axios";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
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

server.get("/puppet-proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing URL");

  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );

    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 60000 });

    let content = await page.content();

    let $ = cheerio.load(content);

    res.setHeader("Content-Type", "text/html");

    res.removeHeader("Content-Security-Policy");
    res.removeHeader("X-Frame-Options");
    res.removeHeader("X-Content-Type-Options");
    res.removeHeader("Referrer-Policy");

    // $('meta[http-equiv="Content-Security-Policy"]').remove();
    // $('meta[http-equiv="X-Frame-Options"?]').remove();
    // $('meta[name="referrer"]').remove();

    process.on("unhandledRejection", console.error);
    process.on("uncaughtException", console.error);

    if ($("base").length === 0) {
      $("head").prepend(`<base href="${targetUrl}">`);
    } else {
      $("base").attr("href", targetUrl);
    }
    // console.log("BASE TAG FINAL:", $("base").attr("href"));

    const baseTag = `<base href="${targetUrl}">`;

    if ($("base").length > 0) {
      $("base").remove(); // GET RID OF THE OLD CRUSTY ONE
    }

    $("head").prepend(baseTag); // SLAM THE NEW ONE TO THE FRONT

    $("[href], [src], [action]").each((_, el) => {
      const $el = $(el);
      const tag = $el[0].tagName.toLowerCase();

      let attr = $el.attr("href")
        ? "href"
        : $el.attr("src")
        ? "src"
        : $el.attr("action")
        ? "action"
        : null;

      if (!attr) return;

      let val = $el.attr(attr);
      if (
        !val ||
        val.startsWith("data:") ||
        val.startsWith("mailto:") ||
        val.startsWith("javascript:")
      )
        return;

      try {
        if (!val.startsWith("http") && !val.startsWith("//")) {
          val = new URL(val, targetUrl).toString();
        } else if (val.startsWith("//")) {
          val = "https:" + val;
        }

        // console.log(`[${tag}] Rewriting ${attr}: ${val}`);
      } catch (e) {
        console.warn("Bad URL rewrite:", val);
        return;
      }

      if (tag === "a" || attr === "action") {
        $el.attr(attr, `/proxy?url=${encodeURIComponent(val)}`);
      } else {
        // $el.attr(attr, `/resource-proxy?url=${encodeURIComponent(val)}`);
      }
    });

    content = $.html();
    res.send(content);
  } catch (e) {
    console.error(e);
    res.status(500).send("failed to load site");
  } finally {
    if (browser) await browser.close();
  }
});
server.get("/resource-proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing URL");

  try {
    const response = await axios.get(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      responseType: "arraybuffer",
    });

    const contentType =
      response.headers["content-type"] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.send(response.data);
  } catch (err) {
    console.error("Resource Proxy error:", err.message);
    res.status(500).send("Failed to fetch resource.");
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

    const contentType = response.headers["content-type"] || "text/html";
    res.setHeader("Content-Type", contentType);

    res.setHeader(
      "Content-Security-Policy",
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
    );
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Access-Control-Allow-Origin", "*");

    let html = response.data.toString("utf8");

    const baseTag = `<base href="${targetUrl}">`;

    const $ = cheerio.load(html);

    $('meta[http-equiv="Content-Security-Policy"]').remove();
    $('meta[http-equiv="X-Frame-Options"]').remove();
    $('meta[name="referrer"]').remove();

    $("a[href]").each((_, el) => {
      let href = $(el).attr("href");
      if (!href.startsWith("http")) {
        href = new URL(href, targetUrl).toString();
      }
      $(el).attr("href", `/proxy?url=${encodeURIComponent(href)}`);
    });

    if ($("base").length === 0) {
      $("head").prepend(`<base href="${targetUrl}">`);
    }

    html = $.html();

    console.log($.html().slice(0, 500));

    res.send(html);
  } catch (err) {
    console.error("Proxy error:", err.message);
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
