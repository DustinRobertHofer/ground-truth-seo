import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.10 Structured data. */
export const STRUCTURED_DATA_RULES: Rule[] = [
  {
    id: "SEO-SD-01",
    title: "JSON-LD blocks are valid JSON",
    class: "C1",
    weight: 8,
    gate: null,
    category: "structured_data",
    scope: "pages in P with JSON-LD",
    scopeKind: "page",
    engines: ["google"],
    book: "ELIGIBILITY REQUIREMENT, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "invalid_json",
        reason:
          "A JSON-LD block on {url} (line {line}) is not valid JSON: {error}. Structured data must be in one of Google's supported formats to be eligible for rich results, and a block that does not parse cannot be read as JSON-LD.",
      },
    ],
    fix: "Serialize JSON-LD with a JSON encoder from template data; never hand-concatenate strings.",
    citations: [
      {
        source_id: "G-SD-POLICIES",
        section: "Technical guidelines: Format",
        quote: "one of three supported formats",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-SD-02",
    title: "Items include the properties Google requires for their feature",
    class: "C1",
    weight: 8,
    gate: { kind: "feature", name: "breadcrumb" },
    category: "structured_data",
    scope:
      "each (page, feature) pair for registry features that have required properties",
    scopeKind: "pair",
    engines: ["google"],
    book: "ELIGIBILITY REQUIREMENT, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "missing_required",
        reason:
          "The {type} item on {url} is missing {missing}. Google lists these as required properties, and items missing required properties are not eligible for rich results.",
      },
      {
        code: "missing_required_site_name",
        reason:
          "The WebSite item on the home page of {origin} is missing {missing}. Google lists name and url as the required properties to add for a site name.",
      },
      {
        code: "too_few_images",
        reason:
          "The VacationRental item on {url} lists {n} images. Google's vacation rental documentation states that the listing must have a minimum of 8 photos.",
      },
    ],
    fix: "Map every required property to a mandatory source field and block publishing when it is empty.",
    citations: [
      {
        source_id: "G-SD-POLICIES",
        section: "Technical guidelines: Completeness",
        quote:
          "Items that are missing required properties are not eligible for rich results.",
      },
    ],
    notes:
      "Gate varies by feature: feature:site_name, feature:breadcrumb, feature:vacation_rental. The second citation, \"The quote in the registry row for the feature.\", is not stored here; the evaluator pulls it from FEATURE_REGISTRY. Registry rules: a type enters the registry only with its Google page, that page's last-updated date, the required properties copied from it, and a verbatim quote. Types with no required properties (Google's Organization: \"There are no required properties; instead, add the properties that apply to your organization.\") are not units of this rule; the Organization logo is checked by SEO-SD-05. Types without an entry are reported as info (\"no Google feature requirements registered\") and never failed. Recommended properties are never required.",
    related: ["SEO-SD-05"],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-SD-04",
    title: "The home page states a site name preference",
    class: "C2",
    weight: 4,
    gate: null,
    category: "structured_data",
    scope: "home page of each in-scope origin",
    scopeKind: "origin",
    engines: ["google"],
    book: "ELIGIBILITY REQUIREMENT (Deliverable 5); corrected to a recommendation (§1.4)",
    conditions: [
      {
        code: "missing",
        opportunity: true,
        reason:
          "The home page of {origin} has no WebSite structured data. Google generates site names automatically, but says WebSite structured data is the most important source if you want to specify a preference.",
      },
      {
        code: "url_not_canonical_home",
        reason:
          "The WebSite url on {origin} is {value}; Google asks that it be the canonical home page, {expected}.",
      },
      {
        code: "multiple_blocks",
        reason:
          "The home page of {origin} has {n} WebSite items. Google asks that site name properties sit in the same node and advises against an additional WebSite block where it can be avoided.",
      },
    ],
    fix: "Add one WebSite item with name (and optionally alternateName) and url set to the canonical home URL; keep the name consistent with the title and og:site_name.",
    citations: [
      {
        source_id: "G-SITENAME",
        section: "How site names in Google Search are created",
        quote:
          "To indicate your site name preference, add WebSite structured data to your home page.",
      },
      {
        source_id: "G-SITENAME",
        section: "How site names in Google Search are created",
        quote:
          "However, WebSite structured data is most important, if you want to specify a preference.",
      },
      {
        source_id: "G-SITENAME",
        section: "Required properties (url)",
        quote:
          "Set this to the canonical home page of your site's domain or subdomain.",
      },
      {
        source_id: "G-SITENAME",
        section: "Technical guidelines",
        quote:
          "avoid creating an additional WebSite structured data block on your home page if you can help it.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-SD-05",
    title: "The Organization logo meets Google's requirements",
    class: "C1",
    weight: 8,
    gate: { kind: "feature", name: "org_logo" },
    category: "structured_data",
    scope: "each Organization item with a logo",
    scopeKind: "resource",
    engines: ["google"],
    book: "ELIGIBILITY REQUIREMENT, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "logo_not_ok",
        reason:
          "The Organization logo {logo_url} returned {outcome}. Google requires the logo image URL to be crawlable and indexable.",
      },
      {
        code: "logo_blocked",
        reason:
          "The Organization logo {logo_url} is disallowed for Googlebot-Image by {rule}. Google requires the logo image URL to be crawlable and indexable.",
      },
      {
        code: "logo_noindex",
        reason:
          "The Organization logo {logo_url} is served with noindex. Google requires the logo image URL to be crawlable and indexable.",
      },
      {
        code: "logo_unsupported_format",
        reason:
          "The Organization logo {logo_url} is {format}. Google requires a logo format supported by Google Images.",
      },
      {
        code: "logo_too_small",
        reason:
          "The Organization logo {logo_url} is {width}×{height}. Google requires a logo of at least 112x112px.",
      },
      {
        code: "logo_unreadable",
        reason:
          "The scanner could not read the format or dimensions of the Organization logo {logo_url}.",
      },
    ],
    fix: "Point logo to a stable, crawlable PNG, JPEG, WebP or SVG image at least 112×112.",
    citations: [
      {
        source_id: "G-ORG",
        section: "Recommended properties (logo)",
        quote: "must be 112x112px, at minimum",
      },
      {
        source_id: "G-ORG",
        section: "Recommended properties (logo)",
        quote: "The image URL must be crawlable and indexable.",
      },
      {
        source_id: "G-ORG",
        section: "Recommended properties (logo)",
        quote: "The image file format must be supported by Google Images.",
        conditions: ["logo_unsupported_format"],
      },
      {
        source_id: "G-IMAGES",
        section: "Supported image formats",
        quote:
          "Google Search supports images referenced in the src attribute of img in the following file formats: BMP, GIF, JPEG, PNG, WebP, SVG, and AVIF.",
        conditions: ["logo_unsupported_format"],
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-SD-03",
    title: "Marked-up values appear on the page",
    class: "C4",
    weight: 0,
    gate: null,
    category: "structured_data",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION (the check itself is a house convention)",
    conditions: [
      {
        code: "not_visible",
        reason:
          "The {property} value “{value}” of the {type} item on {url} does not occur in the page's visible text. Google says: \"Don't mark up content that is not visible to readers of the page.\"",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-SD-POLICIES",
        section: "Quality guidelines: Content",
        quote: "Don't mark up content that is not visible to readers of the page.",
      },
    ],
    notes:
      "Info when the string value of name, headline or description in a registered-feature item does not occur in the page's visible text (§3.4) after normalization. Informational, because formatting differences make exact matching unreliable.",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-SD-06-HC",
    title: "Breadcrumb positions are consecutive (house convention)",
    class: "C4",
    weight: 0,
    gate: null,
    category: "structured_data",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    book: "house convention",
    conditions: [
      {
        code: "positions_not_consecutive",
        reason:
          "The BreadcrumbList item on {url} has ListItem position values {positions}, which do not run 1, 2, 3 in order. Consecutive positions are a house convention.",
      },
    ],
    fix: null,
    citations: [],
    notes: "Info when ListItem.position values do not run 1, 2, 3 in order.",
    houseConvention: true,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-SD-07",
    title: "Markup for retired Google features",
    class: "C4",
    weight: 0,
    gate: null,
    category: "structured_data",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "retired_feature",
        reason:
          "For your information: Google no longer shows {feature} in Search ({date}). The markup does no harm according to the reviewed documentation, but it earns no Google feature.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-UPDATES",
        section: "entries for the dates shown",
        quote: null,
      },
    ],
    notes:
      "Info when an item has a type listed in §8 with a verified type mapping. Never a failure. Retired markup is never a failure.",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-SD-08",
    title: "AI-specific markup is never recommended",
    class: "C4",
    weight: 0,
    gate: null,
    category: "structured_data",
    scope: "none",
    scopeKind: "none",
    engines: ["google"],
    book: "EXPLICITLY DISMISSED",
    conditions: [
      {
        code: "never_recommended",
        reason:
          "Structured data isn't required for generative AI search, and there's no special schema.org markup you need to add.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-AI-OPT",
        section: "Mythbusting generative AI search: what you don't need to do",
        quote:
          "Structured data isn't required for generative AI search, and there's no special schema.org markup you need to add.",
      },
    ],
    notes:
      "Not a check. The scanner never recommends schema or files for generative AI features, because Google says: \"Structured data isn't required for generative AI search, and there's no special schema.org markup you need to add.\"",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
];

export interface FeatureRegistryEntry {
  feature: "site_name" | "breadcrumb" | "vacation_rental";
  /** The schema.org type that triggers the feature. */
  type: string;
  /** Where the triggering item must live, as written ("WebSite on an in-scope home page"). */
  trigger: string;
  /** Required property paths; `a | b` means either; see KNOWLEDGE.md §4.10. */
  required: string[];
  lastItemOptional?: string[];
  /** Verbatim registry quote. */
  quote: string;
  source_id: string;
  source_last_updated: string;
  notes: string;
}

/** KNOWLEDGE.md §4.10 Feature registry (ruleset 1.0.0). */
export const FEATURE_REGISTRY: FeatureRegistryEntry[] = [
  {
    feature: "site_name",
    type: "WebSite",
    trigger: "WebSite on an in-scope home page",
    required: ["name", "url"],
    quote:
      "Add the required properties to the home page of your website, in either JSON-LD, RDFa, or microdata format.",
    source_id: "G-SITENAME",
    source_last_updated: "2025-12-10",
    notes:
      "Domain and subdomain home pages only. The Rich Results Test does not support site names; the Schema Markup Validator does.",
  },
  {
    feature: "breadcrumb",
    type: "BreadcrumbList",
    trigger: "BreadcrumbList",
    required: [
      "itemListElement",
      "itemListElement[].position",
      "itemListElement[].name",
      "itemListElement[].item",
    ],
    lastItemOptional: ["itemListElement[].item"],
    quote:
      "If the breadcrumb is the last item in the breadcrumb trail, item is not required.",
    source_id: "G-BREADCRUMB",
    source_last_updated: "2026-09-08",
    notes:
      "Breadcrumb rich results appear on desktop only since January 2025 (G-UPDATES).",
  },
  {
    feature: "vacation_rental",
    type: "VacationRental",
    trigger: "VacationRental",
    required: [
      "containsPlace",
      "containsPlace.occupancy",
      "containsPlace.occupancy.value",
      "identifier",
      "image",
      "latitude | geo.latitude",
      "longitude | geo.longitude",
      "name",
    ],
    quote:
      "One or more images of the listing. The listing must have a minimum of 8 photos (at least 1 image of each of the following: bedroom, bathroom, and common area).",
    source_id: "G-VR",
    source_last_updated: "2026-09-08",
    notes:
      "Limited availability: \"These instructions are intended for sites that have already connected with a Google Technical Account Manager and have access to the Hotel Center.\" Markup belongs on listing detail pages. The photo categories cannot be checked from markup.",
  },
];

export interface RetiredFeature {
  feature: string;
  status: string;
  date: string;
  types: string[];
}

/** KNOWLEDGE.md §8 Retired structured-data features. */
export const RETIRED_FEATURES: RetiredFeature[] = [
  {
    feature: "FAQ rich result",
    status:
      "\"will no longer appear in Google Search starting May 7, 2026\"; documentation removed June 15, 2026",
    date: "2026-05-07",
    types: ["FAQPage"],
  },
  {
    feature: "Special announcement",
    status: "No longer shown; documentation removed",
    date: "2025-09-09",
    types: ["SpecialAnnouncement"],
  },
  {
    feature: "Course info, estimated salary, learning video, vehicle listing",
    status:
      "\"are no longer shown in Google Search results\"; documentation removed",
    date: "2025-09-09",
    types: [],
  },
  {
    feature: "Practice problem",
    status: "Documentation removed",
    date: "2026-01-06",
    types: [],
  },
  {
    feature: "Sitelinks search box",
    status: "Feature removed; nositelinkssearchbox no longer used",
    date: "2024-11-29",
    types: [],
  },
  {
    feature: "Breadcrumb",
    status: "Still supported; shown on desktop only",
    date: "January 2025",
    types: [],
  },
];
