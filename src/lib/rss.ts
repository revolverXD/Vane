export interface RssItem {
  title: string;
  url: string;
  date: string;
  content: string;
  thumbnail: string;
}

const decodeEntities = (t: string) =>
  t
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const strip = (t: string) =>
  decodeEntities(
    t
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim();

// Ordered preference, not regex alternation — WordPress feeds put the full
// HTML (with images) in content:encoded while description is a plain excerpt.
const firstTag = (block: string, names: string[]): string => {
  for (const name of names) {
    const m = new RegExp(
      `<(${name})[^>]*>([\\s\\S]*?)</\\1>`,
    ).exec(block);
    if (m) return m[2];
  }
  return '';
};

const firstAttr = (block: string, tag: string, attr: string): string => {
  const m = new RegExp(
    `<${tag}[^>]*\\b${attr}="([^"]*)"`,
  ).exec(block);
  return m ? m[1] : '';
};

// ponytail: regex RSS/Atom parser — covers ~95% of feeds. If a weird feed
// fails, upgrade to a real XML parser then.
export const parseFeed = (xml: string): RssItem[] => {
  const blocks =
    xml.match(/<item[\s>][\s\S]*?<\/item>/g) ??
    xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) ??
    [];

  const items: RssItem[] = [];
  for (const block of blocks) {
    const title = strip(firstTag(block, ['title']));
    let url = strip(firstTag(block, ['link']));
    if (!url) url = firstAttr(block, 'link', 'href');
    if (!title || !url) continue;

    const date =
      strip(
        firstTag(block, ['pubDate', 'published', 'updated', 'date']) ||
          firstAttr(block, 'date', 'content'),
      ) || '';

    const rawDescription = firstTag(block, [
      'content:encoded',
      'description',
      'content',
      'summary',
    ]);
    const imgInContent = /<img[^>]*\bsrc="([^"]+)"/.exec(rawDescription);
    const thumbnail =
      firstAttr(block, 'enclosure', 'url') ||
      firstAttr(block, 'media:content', 'url') ||
      firstAttr(block, 'media:thumbnail', 'url') ||
      (imgInContent ? imgInContent[1] : '');

    items.push({
      title,
      url,
      date,
      content: strip(rawDescription).slice(0, 300),
      thumbnail,
    });
  }
  return items;
};

export const fetchFeed = async (
  feedUrl: string,
  signal?: AbortSignal,
): Promise<RssItem[]> => {
  const res = await fetch(feedUrl, {
    signal: signal ?? AbortSignal.timeout(8000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; VaneRSSBot/1.0)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Feed returned ${res.status}`);
  return parseFeed(await res.text());
};
