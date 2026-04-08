const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Health check (QUAN TRỌNG)
app.get("/", (req, res) => {
  res.send("OK");
});

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

  let browser;
  let context;

  // ⏱️ timeout guard (tránh Railway kill)
  const timeout = setTimeout(() => {
    console.log("Request timeout");
    res.status(504).json({ error: "Timeout" });
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

    await browser.close();

    const filtered = jobs.filter(job => {
      const text = (job.title || "") + " " + (job.tags || []).join(" ");
      const levels = parseLevels(text);

      if (levels.length === 0) return true;

      const lower = ["Fresher", "Junior", "Mid", "Intern"];
      return levels.some(l => lower.includes(l));
    });

    clearTimeout(timeout);

    res.json({
      success: true,
      count: filtered.length,
      data: filtered
    });

  } catch (err) {
    console.error("ERROR:", err.message);

    clearTimeout(timeout);

    res.status(500).json({
      error: err.message
    });
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
});

// ✅ bind đúng host cho container
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});