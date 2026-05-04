// server.js
const express = require('express');
const { chromium } = require('playwright');
const NodeCache = require('node-cache');

const appCache = new NodeCache({ stdTTL: 300 }); 
const app = express();
const PORT = process.env.PORT || 3000;

function parseLevels(text) {
  text = (text || '').toLowerCase();
  const found = new Set();
  if (text.includes('principal')) found.add('Principal');
  if (text.includes('lead')) found.add('Lead');
  if (text.includes('senior')) found.add('Senior');
  if (text.includes('mid') || text.includes('middle') || text.includes('experienced')) found.add('Mid');
  if (text.includes('junior') || text.includes('jr') || text.includes('entry')) found.add('Junior');
  if (text.includes('intern')) found.add('Intern');
  if (text.includes('fresher')) found.add('Fresher');
  return Array.from(found);
}

function isWithinDays(timeStr, maxDays = 2) {
  if (!timeStr) return false;
  const s = timeStr.toString().toLowerCase().trim();
  if (s.includes('hôm nay') || s.includes('hom nay') || s.includes('today')) return true;
  if (s.includes('hôm qua') || s.includes('hom qua') || s.includes('yesterday')) return maxDays >= 1;
  if (/\b(\d+)\s*giờ\b/.test(s) || /\b(\d+)\s*phút\b/.test(s) || /\b(\d+)\s*hour\b/.test(s) || /\b(\d+)\s*minute\b/.test(s)) return true;
  const m = s.match(/(\d+)\s*ngày/);
  if (m) {
    const days = parseInt(m[1], 10);
  }
  const me = s.match(/(\d+)\s*day/);
  if (me) {
    const days = parseInt(me[1], 10);
  }
  return false;
}

function filterJobsByLevel(jobs) {
  return jobs.filter(job => {
    const text = (job.title || '') + ' ' + (job.tags || []).join(' ');
    const levels = parseLevels(text);
    if (levels.length === 0) return true;
    const lowerLevels = new Set(['Fresher', 'Junior', 'Mid', 'Intern', 'Middle']);
    const seniorLevels = new Set(['Senior', 'Lead', 'Principal']);
    const hasLower = levels.some(l => lowerLevels.has(l));
    const hasSenior = levels.some(l => seniorLevels.has(l));
    if (hasLower) return true;
    return true;
  });
}

let sharedBrowser = null;

async function scrapeItViec(context, keyword) {
  const page = await context.newPage();
  try {
    await page.goto(`https://itviec.com/viec-lam-it/${keyword}-developer/ho-chi-minh-hcm`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    try { await page.waitForSelector('.job-card', { timeout: 8000 }); } catch (e) {}
    const jobs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.job-card')).map(job => {
        const titleEl = job.querySelector('h3');
        const companyEl = job.querySelector('.logo-employer-card + span a');
        const rawLink = titleEl?.getAttribute('data-url');
        return {
          title: titleEl?.innerText?.trim(),
          link: rawLink ? (rawLink.startsWith('http') ? rawLink : 'https://itviec.com' + rawLink) : null,
          company: companyEl?.innerText?.trim(),
          company_link: companyEl ? 'https://itviec.com' + companyEl.getAttribute('href') : null,
          tags: Array.from(job.querySelectorAll('.itag')).map(t => t.innerText.trim()),
          time: job.querySelector('.small-text.text-dark-grey')?.innerText?.trim()
        };
      });
    });
    return jobs || [];
  } catch (e) {
    console.error('ITViec Error:', e.message);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapeTopCV(context, keyword) {
  const page = await context.newPage();
  try {
    const topcvUrl = `https://www.topcv.vn/tim-viec-lam-${keyword}-developer-tai-ho-chi-minh-kl2?type_keyword=1&sba=1&locations=l2`;
    await page.goto(topcvUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    try { await page.waitForSelector('.job-item-search-result', { timeout: 8000 }); } catch (e) {}
    const topcvJobs = await page.evaluate(() => {
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
    return topcvJobs || [];
  } catch (e) {
    console.error('TopCV Error:', e.message);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapeIndeed(context, keyword) {
  const page = await context.newPage();
  try {
    const indeedUrl = `https://vn.indeed.com/jobs?q=${encodeURIComponent(keyword)}+developer&l=Th%C3%A0nh+ph%E1%BB%91+H%E1%BB%93+Ch%C3%AD+Minh`;
    await page.goto(indeedUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    try { await page.waitForSelector('.job_seen_beacon', { timeout: 8000 }); } catch (e) {}
    const indeedJobs = await page.evaluate(() => {
      const items = document.querySelectorAll('.job_seen_beacon');
      return Array.from(items).map(item => {
        const titleEl = item.querySelector('h2.jobTitle a span[id^="jobTitle-"]');
        const linkEl = item.querySelector('h2.jobTitle a');
        const companyEl = item.querySelector('span[data-testid="company-name"]');
        const locationEl = item.querySelector('div[data-testid="text-location"]');
        return {
          title: titleEl?.innerText?.trim(),
          link: linkEl?.href ? 'https://vn.indeed.com' + linkEl.href : null,
          company: companyEl?.innerText?.trim(),
          company_link: null,
          salary: null,
          location: locationEl?.innerText?.trim(),
          time: null,
          tags: []
        };
      });
    });
    return indeedJobs || [];
  } catch (e) {
    console.error('Indeed Error:', e.message);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

app.get('/jobs', async (req, res) => {
  const keyword = req.query.keyword || 'frontend';
  const maxDays = req.query.maxDays ? parseInt(req.query.maxDays, 10) || 2 : 2;
  const cacheKey = `jobs_${keyword}`;

  const cachedData = appCache.get(cacheKey);
  if (cachedData) {
    const timeFiltered = cachedData.filter(job => isWithinDays(job.time, maxDays));
    const filtered = filterJobsByLevel(timeFiltered);
    return res.json({ success: true, data: filtered, cached: true });
  }

  if (!sharedBrowser) {
    return res.status(503).json({ error: 'Browser not ready. Please try again.' });
  }

  const context = await sharedBrowser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  });

  try {
    const results = await Promise.allSettled([
      scrapeItViec(context, keyword),
      scrapeTopCV(context, keyword),
      scrapeIndeed(context, keyword)
    ]);

    const combined = [
      ...(results[0].status === 'fulfilled' ? results[0].value : []),
      ...(results[1].status === 'fulfilled' ? results[1].value : []),
      ...(results[2].status === 'fulfilled' ? results[2].value : [])
    ];

    if (combined.length > 0) appCache.set(cacheKey, combined);

    const timeFiltered = combined.filter(job => isWithinDays(job.time, maxDays));
    const filtered = filterJobsByLevel(timeFiltered);

    res.json({ success: true, data: filtered, cached: false });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  } finally {
    await context.close().catch(() => {});
  }
});

(async () => {
  try {
    sharedBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const server = app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
    const shutdown = async () => {
      if (sharedBrowser) await sharedBrowser.close();
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (e) {
    process.exit(1);
  }
})();