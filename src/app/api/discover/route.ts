import configManager from '@/lib/config';
import { fetchFeed, type RssItem } from '@/lib/rss';

const FEEDS_KEY = '***';
const MAX_ARTICLES = 60;

const getFeeds = (): string[] =>
  String(configManager.getConfig(FEEDS_KEY, '') ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const saveFeeds = (feeds: string[]) => {
  configManager.updateConfig(FEEDS_KEY, feeds.join('\n'));
};

export const GET = async () => {
  try {
    const feeds = getFeeds();

    // One dead feed must not take down the page.
    const settled = await Promise.allSettled(
      feeds.map((f) => fetchFeed(f)),
    );

    const seen = new Set<string>();
    const articles: RssItem[] = settled
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .filter((a) => {
        const key = a.url.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0),
      )
      .slice(0, MAX_ARTICLES);

    return Response.json({ blogs: articles, feeds }, { status: 200 });
  } catch (err) {
    console.error(`An error occurred in discover route: ${err}`);
    return Response.json(
      { message: 'An error has occurred' },
      { status: 500 },
    );
  }
};

export const POST = async (req: Request) => {
  try {
    const body = await req.json();
    const url = String(body.url ?? '').trim();

    if (!/^https?:\/\/\S+$/i.test(url)) {
      return Response.json(
        { message: 'A valid http(s) feed URL is required' },
        { status: 400 },
      );
    }

    const feeds = getFeeds();
    if (body.remove) {
      saveFeeds(feeds.filter((f) => f !== url));
    } else if (!feeds.includes(url)) {
      saveFeeds([...feeds, url]);
    }

    return Response.json({ feeds: getFeeds() }, { status: 200 });
  } catch (err) {
    console.error(`An error occurred in discover route: ${err}`);
    return Response.json(
      { message: 'An error has occurred' },
      { status: 500 },
    );
  }
};
