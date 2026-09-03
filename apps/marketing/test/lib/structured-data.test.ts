import { describe, expect, it } from 'vitest';
import { site } from '../../src/lib/site';
import { faqStructuredData, pageStructuredData } from '../../src/lib/structured-data';

describe('faqStructuredData', () => {
  it('renders a FAQPage with one Question per item', () => {
    const data = faqStructuredData([{ question: 'Why?', answer: 'Because.' }]);
    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Why?', acceptedAnswer: { '@type': 'Answer', text: 'Because.' } },
      ],
    });
  });
});

describe('pageStructuredData', () => {
  const page = {
    canonical: `${site.url}/pricing`,
    name: 'Pricing',
    description: 'Plans.',
    imageUrl: `${site.url}/og/pricing.png`,
    isHome: false,
  };

  it('always carries the Organization, WebSite, SoftwareApplication and WebPage nodes', () => {
    const types = pageStructuredData(page)['@graph'].map((node) => node['@type']);
    expect(types).toEqual(['Organization', 'WebSite', 'SoftwareApplication', 'WebPage', 'BreadcrumbList']);
  });

  it('breadcrumbs every page but the homepage', () => {
    const home = pageStructuredData({ ...page, canonical: `${site.url}/`, name: 'BuzzKit', isHome: true });
    expect(home['@graph'].map((node) => node['@type'])).not.toContain('BreadcrumbList');
    const webPage = home['@graph'].find((node) => node['@type'] === 'WebPage');
    expect(webPage).not.toHaveProperty('breadcrumb');
    const priced = pageStructuredData(page);
    expect(priced['@graph'].find((node) => node['@type'] === 'WebPage')).toMatchObject({
      breadcrumb: { '@id': `${site.url}/pricing#breadcrumb` },
    });
  });

  it('offers only the priced plans in USD', () => {
    const software = pageStructuredData(page)['@graph'].find(
      (node) => node['@type'] === 'SoftwareApplication'
    );
    const offers = (software as { offers: { price: string; priceCurrency: string }[] }).offers;
    expect(offers.length).toBeGreaterThan(0);
    for (const offer of offers) {
      expect(offer.priceCurrency).toBe('USD');
      expect(offer.price).toMatch(/^\d+$/);
    }
  });
});
