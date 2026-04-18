// server.js
const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

function parseLevels(text) {
  text = (text || "").toLowerCase();
  const found = new Set();

  if (text.includes("principal")) found.add("Principal");
  if (text.includes("lead")) found.add("Lead");
  if (text.includes("senior")) found.add("Senior");
  if (text.includes("mid") || text.includes("middle") || text.includes("experienced")) found.add("Mid");
  if (text.includes("junior") || text.includes("jr") || text.includes("entry")) found.add("Junior");
  if (text.includes("intern")) found.add("Intern");
  if (text.includes("fresher")) found.add("Fresher");

  return Array.from(found);
}

app.get("/jobs", async (req, res) => {
  const keyword = req.query.keyword || "frontend";

  let browser;
  try {
    console.log("Launching browser...");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    console.log("Browser launched successfully");

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    });

    const page = await context.newPage();

    await page.goto(
      `https://itviec.com/viec-lam-it/${keyword}-developer/ho-chi-minh-hcm`,
      {
        waitUntil: "domcontentloaded",
        timeout: 30000  // reduced from 60000 to avoid Railway timeout
      }
    );

    await page.waitForTimeout(3000);
    await page.waitForSelector(".job-card", { timeout: 30000 });

    const jobs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".job-card")).map(job => {
        const titleEl = job.querySelector("h3");
        const companyEl = job.querySelector(".logo-employer-card + span a");

        const rawLink = titleEl?.getAttribute("data-url");

        return {
          title: titleEl?.innerText?.trim(),

          // ✅ link job chuẩn
          link: rawLink
            ? rawLink.startsWith("http")
              ? rawLink
              : "https://itviec.com" + rawLink
            : null,

          company: companyEl?.innerText?.trim(),

          // ✅ link company
          company_link: companyEl
            ? "https://itviec.com" + companyEl.getAttribute("href")
            : null,

          tags: Array.from(job.querySelectorAll(".itag")).map(t =>
            t.innerText.trim()
          ),

          // ✅ "Đăng 4 giờ trước"
          time: job
            .querySelector(".small-text.text-dark-grey")
            ?.innerText?.trim()
        };
      });
    });

    // Try to fetch TopCV search results for the same keyword/location
    let topcvJobs = [];
    try {
      const page2 = await context.newPage();
      const topcvUrl = `https://www.topcv.vn/tim-viec-lam-${keyword}-developer-tai-ho-chi-minh-kl2?type_keyword=1&sba=1&locations=l2`;
      await page2.goto(topcvUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page2.waitForTimeout(2000);

      // wait for at least one result, but don't throw if none
      try {
        await page2.waitForSelector('.job-item-search-result', { timeout: 10000 });
      } catch (e) {
        // no results found quickly — continue with empty topcvJobs
      }

      topcvJobs = await page2.evaluate(() => {
        return Array.from(document.querySelectorAll('.job-item-search-result')).map(item => {
          const titleEl = item.querySelector('h3.title a span') || item.querySelector('h3.title a');
          const linkEl = item.querySelector('h3.title a');
          const companyEl = item.querySelector('.company-name');
          const companyLinkEl = item.querySelector('a.company');
          const salaryEl = item.querySelector('.title-salary') || item.querySelector('.salary span');
          const locationEl = item.querySelector('.city-text');
          const timeEl = item.querySelector('.label-update') || item.querySelector('.icon label');

          const tags = Array.from(item.querySelectorAll('.tag a.item-tag')).map(t => t.innerText.trim());

          return {
            title: titleEl?.innerText?.trim(),
            link: linkEl?.href || null,
            company: companyEl?.innerText?.trim(),
            company_link: companyLinkEl?.href || null,
            salary: salaryEl?.innerText?.trim(),
            location: locationEl?.innerText?.trim(),
            time: timeEl?.innerText?.trim(),
            tags
          };
        });
      });

      await page2.close();
    } catch (e) {
      console.error('TopCV scrape failed:', e.message);
      // continue — we still return itviec results
    }

    // merge both sources
    const combined = (jobs || []).concat(topcvJobs || []);

    const filtered = combined.filter(job => {
      const text = (job.title || "") + " " + (job.tags || []).join(" ");
      const levels = parseLevels(text);

      // keep if no level detected
      if (levels.length === 0) return true;

      const lowerLevels = new Set(["Fresher", "Junior", "Mid", "Intern", "Middle"]);
      const seniorLevels = new Set(["Senior", "Lead", "Principal"]);

      const hasLower = levels.some(l => lowerLevels.has(l));
      const hasSenior = levels.some(l => seniorLevels.has(l));

      // keep if any lower-level is present (e.g., Junior/Mid, Fresher/Junior)
      if (hasLower) return true;

      // if there are only senior-type levels (Senior, Lead, Principal), exclude
      if (hasSenior && !hasLower) return false;

      // default: keep
      return true;
    });

    // Return all filtered jobs (do not slice) as requested
    res.json({
      success: true,
      data: filtered
    });

  } catch (err) {
    console.error("Error in /jobs:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log("Browser closed");
      } catch (closeErr) {
        console.error("Error closing browser:", closeErr.message);
      }
    }
  }
});

app.listen(PORT, () => {
  console.log("http://localhost:" + PORT);
});