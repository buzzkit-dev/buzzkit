import type { FaqItem } from './content';
import { plans } from './pricing';
import { site } from './site';

export function faqStructuredData(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function pageStructuredData(page: {
  canonical: string;
  name: string;
  description: string;
  imageUrl: string;
  isHome: boolean;
}) {
  const { canonical, name, description, imageUrl, isHome } = page;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${site.url}/#organization`,
        name: site.name,
        url: site.url,
        logo: `${site.url}/logo.png`,
        email: site.contactEmail,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: site.contactEmail,
          url: `${site.url}/contact`,
          availableLanguage: 'English',
        },
        sameAs: [site.githubOrgUrl, site.githubUrl],
      },
      {
        '@type': 'WebSite',
        '@id': `${site.url}/#website`,
        name: site.name,
        url: site.url,
        publisher: { '@id': `${site.url}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${site.url}/#software`,
        name: site.name,
        description: site.description,
        url: site.url,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web, iOS',
        offers: plans
          .filter((plan) => plan.price.startsWith('$'))
          .map((plan) => ({
            '@type': 'Offer',
            name: plan.name,
            price: plan.price.slice(1),
            priceCurrency: 'USD',
            url: `${site.url}/pricing`,
          })),
        softwareHelp: site.docsUrl,
        sameAs: [site.githubUrl],
      },
      {
        '@type': 'WebPage',
        '@id': canonical,
        url: canonical,
        name,
        description,
        isPartOf: { '@id': `${site.url}/#website` },
        about: { '@id': `${site.url}/#software` },
        primaryImageOfPage: { '@type': 'ImageObject', url: imageUrl, width: 1200, height: 630 },
        inLanguage: 'en',
        ...(isHome ? {} : { breadcrumb: { '@id': `${canonical}#breadcrumb` } }),
      },
      ...(isHome
        ? []
        : [
            {
              '@type': 'BreadcrumbList',
              '@id': `${canonical}#breadcrumb`,
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${site.url}/` },
                { '@type': 'ListItem', position: 2, name, item: canonical },
              ],
            },
          ]),
    ],
  };
}
