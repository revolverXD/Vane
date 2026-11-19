import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { Mutex } from 'async-mutex';
import { getFirecrawlConfig } from './config/serverRegistry';

class Scraper {
  private static browser: any | undefined;
  private static IDLE_KILL_TIMEOUT = 30000;
  private static NAVIGATION_TIMEOUT = 20000;
  private static idleTimeout: NodeJS.Timeout | undefined;
  private static browserMutex = new Mutex();
  private static userCount = 0;

  private static async initBrowser() {
    await this.browserMutex.runExclusive(async () => {
      if (!this.browser) {
        const { chromium } = await import('playwright');
        this.browser = await chromium.launch({
          headless: true,
          channel: 'chromium-headless-shell',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
          ],
        });
      }

      if (this.idleTimeout) clearTimeout(this.idleTimeout);
    });
  }

  private static scheduleIdleKill() {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);

    this.idleTimeout = setTimeout(async () => {
      await this.browserMutex.runExclusive(async () => {
        if (this.browser && this.userCount === 0) {
          {
            await this.browser.close();
            this.browser = undefined;
          }
        }
      });
    }, this.IDLE_KILL_TIMEOUT);
  }


  private static async firecrawlScrape(
    url: string,
  ): Promise<{ content: string; title: string } | null> {
    const { url: base, fcKey } = getFirecrawlConfig();
    if (!base) return null;

    try {
      const res = await fetch(`${base.replace(/\/+$/, '')}/v2/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fcKey ? { 'x-firecrawl-api-key': fcKey } : {}),
        },
        body: JSON.stringify({ url, formats: ['markdown'] }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        console.log(`Firecrawl returned HTTP ${res.status} for ${url}, falling back to built-in browser`);
        return null;
      }

      const data = await res.json();
      const markdown: string = data?.data?.markdown ?? '';
      if (!markdown.trim()) return null;

      const title: string = data?.data?.metadata?.title || url;
      return {
        content: `
        # ${title} - ${url}
        ${markdown.trim()}
        `,
        title,
      };
    } catch (err) {
      console.log(`Firecrawl scrape failed for ${url}, falling back to built-in browser:`, err);
      return null;
    }
  }

  static async scrape(
    url: string,
  ): Promise<{ content: string; title: string }> {
    const firecrawl = await this.firecrawlScrape(url);
    if (firecrawl) return firecrawl;

    await this.initBrowser();

    if (!this.browser) throw new Error('Browser not initialized');

    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    this.userCount++;

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.NAVIGATION_TIMEOUT,
      });

      await page
        .waitForLoadState('load', { timeout: 5000 })
        .catch(() => undefined);
      await page.waitForTimeout(500);

      const html = await page.content();

      const dom = new JSDOM(html, {
        url,
      });

      const content = new Readability(dom.window.document).parse();

      const title = await page.title();

      return {
        content: `
        # ${title ?? 'No title'} - ${url}
        ${content?.textContent?.trim() ?? 'No content available'}
        `,
        title,
      };
    } catch (err) {
      console.log(`Error scraping ${url}:`, err);

      return {
        title: 'Failed to scrape',
        content: `# ${url}\n\nError scraping content.`,
      };
    } finally {
      this.userCount--;

      await context.close().catch(() => undefined);

      if (this.userCount === 0) {
        this.scheduleIdleKill();
      }
    }
  }
}

export default Scraper;
