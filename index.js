const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// log startup
console.log("🚀 Starting app...");

// Basic logging
app.use((req, res, next) => {
  console.log(`> ${req.method} ${req.path}`);
  next();
});

// ✅ Health check
app.get("/", (req, res) => {
  res.send("OK");
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// parse level
function parseLevels(text) {
  text = (text || "").toLowerCase();
  const found = new Set();

  if (text.includes("principal")) found.add("Principal");
  if (text.includes("lead")) found.add("Lead");
  if (text.includes("senior")) found.add("Senior");
  if (text.includes("mid") || text.includes("middle")) found.add("Mid");
  if (text.includes("junior") || text.includes("jr")) found.add("Junior");
  if (text.includes("intern")) found.add("Intern");
  if (text.includes("fresher")) found.add("Fresher");

  return Array.from(found);
}

// API crawl
app.get("/jobs", async (req, res) => {
  const keyword = req.query.keyword || "frontend";

  // ✅ mock mode để debug
  if (process.env.DISABLE_SCRAPE === "1") {
    return res.json({
      success: true,
      mock: true,
      data: [{ title: "Mock Job", company: "ACME" }]
    });
  }

  // 🔥 lazy load Playwright (FIX QUAN TRỌNG)
  const { chromium } = require("playwright");

  let browser;
  let context;

  let timedOut = false;
  const timeout = setTimeout(async () => {
    timedOut = true;
    console.log("⏱ Timeout");

    try { if (context) await context.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}

    if (!res.headersSent) {
      res.status(504).json({ error: "Timeout" });
    }
  }, 25000);

  try {
    console.log("Launching browser...");

    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });

    context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(
      `https://itviec.com/viec-lam-it/${keyword}-developer/ho-chi-minh-hcm`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );

    await page.waitForSelector(".job-card", { timeout: 10000 });

    const jobs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".job-card")).map(job => {
        const titleEl = job.querySelector("h3");
        const companyEl = job.querySelector(".logo-employer-card + span a");

        const rawLink = titleEl?.getAttribute("data-url");

        return {
          title: titleEl?.innerText?.trim(),
          link: rawLink
            ? rawLink.startsWith("http")
              ? rawLink
              : "https://itviec.com" + rawLink
            : null,
          company: companyEl?.innerText?.trim(),
          company_link: companyEl
            ? "https://itviec.com" + companyEl.getAttribute("href")
            : null,
          tags: Array.from(job.querySelectorAll(".itag")).map(t =>
            t.innerText.trim()
          ),
          time: job
            .querySelector(".small-text.text-dark-grey")
            ?.innerText?.trim()
        };
      });
    });

    const filtered = jobs.filter(job => {
      const text = (job.title || "") + " " + (job.tags || []).join(" ");
      const levels = parseLevels(text);

      if (levels.length === 0) return true;

      const lower = ["Fresher", "Junior", "Mid", "Intern"];
      return levels.some(l => lower.includes(l));
    });

    clearTimeout(timeout);

    if (!timedOut && !res.headersSent) {
      res.json({
        success: true,
        count: filtered.length,
        data: filtered
      });
    }

  } catch (err) {
    console.error("ERROR:", err.message);
    clearTimeout(timeout);

    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
});

// ✅ QUAN TRỌNG: bind đúng host
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});