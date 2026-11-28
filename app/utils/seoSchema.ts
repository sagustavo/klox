export const SITE_URL = 'https://klox.dev';
export const OG_IMAGE_URL = `${SITE_URL}/images/klox-og.jpg`;
export const LOGO_URL = `${SITE_URL}/images/klox-favicon.png`;

export interface LandingFaqItem {
  question: string;
  answer: string;
}

export interface BuildLandingJsonLdParams {
  locale: 'en' | 'pt-br';
  canonicalUrl: string;
  description: string;
  features: readonly string[];
  faqs: readonly LandingFaqItem[];
  freeOfferName: string;
  freeOfferDescription: string;
  proOfferName: string;
  proOfferDescription: string;
}

/**
 * Builds the Schema.org JSON-LD @graph for the Klox marketing landing page,
 * combining SoftwareApplication/WebApplication (Free & Pro offers), WebSite,
 * Organization, and FAQPage strictly anchored to https://klox.dev.
 */
export function buildLandingJsonLd(params: BuildLandingJsonLdParams) {
  const isPtBr = params.locale === 'pt-br';
  const languageTag = isPtBr ? 'pt-BR' : 'en-US';
  const currency = isPtBr ? 'BRL' : 'USD';
  const proPrice = isPtBr ? '12.90' : '3.90';
  const signupPath = isPtBr ? '/pt-br/login?mode=signup' : '/login?mode=signup';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['SoftwareApplication', 'WebApplication'],
        '@id': `${SITE_URL}/#software`,
        name: 'Klox',
        alternateName: ['klox.dev', 'Klox Time Tracker'],
        url: params.canonicalUrl,
        applicationCategory: 'ProductivityApplication',
        applicationSubCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        inLanguage: languageTag,
        description: params.description,
        image: OG_IMAGE_URL,
        featureList: [...params.features],
        offers: [
          {
            '@type': 'Offer',
            name: params.freeOfferName,
            description: params.freeOfferDescription,
            price: '0',
            priceCurrency: currency,
            availability: 'https://schema.org/InStock',
            url: `${SITE_URL}${signupPath}`,
          },
          {
            '@type': 'Offer',
            name: params.proOfferName,
            description: params.proOfferDescription,
            price: proPrice,
            priceCurrency: currency,
            availability: 'https://schema.org/PreOrder',
            url: `${params.canonicalUrl}#pricing`,
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: proPrice,
              priceCurrency: currency,
              billingDuration: 'P1M',
            },
          },
        ],
        publisher: {
          '@id': `${SITE_URL}/#organization`,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: 'Klox',
        alternateName: 'klox.dev',
        url: `${SITE_URL}/`,
        inLanguage: ['en-US', 'pt-BR'],
        publisher: {
          '@id': `${SITE_URL}/#organization`,
        },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'Klox',
        alternateName: 'klox.dev',
        url: `${SITE_URL}/`,
        logo: {
          '@type': 'ImageObject',
          url: LOGO_URL,
          width: 500,
          height: 500,
        },
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'contact@klox.dev',
          contactType: 'customer support',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${params.canonicalUrl}#faq`,
        inLanguage: languageTag,
        mainEntity: params.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      },
    ],
  };
}
