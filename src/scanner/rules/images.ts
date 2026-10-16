import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.9 Images. */
export const IMAGE_RULES: Rule[] = [
  {
    id: "SEO-IMG-01",
    title: "Images have a src fallback",
    class: "C2",
    weight: 4,
    gate: null,
    category: "images",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "missing_src",
        reason:
          "{n} <img> elements on {url} have no src attribute, for example {example}. Google finds images in the src attribute and recommends always specifying a fallback URL with src.",
      },
    ],
    fix: "Always render src; lazy-loading libraries should swap in the real URL rather than leave it empty.",
    citations: [
      {
        source_id: "G-IMAGES",
        section: "Use HTML image elements to embed images",
        quote:
          "Google can find images in src attribute of <img> element (even when it's a child of other elements, such as the <picture> element).",
      },
      {
        source_id: "G-IMAGES",
        section: "Responsive images",
        quote:
          "We recommend that you always specify a fallback URL using the src attribute.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-IMG-02",
    title: "Images carry an alt attribute",
    class: "C2",
    weight: 4,
    gate: null,
    category: "images",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, STANDARD",
    conditions: [
      {
        code: "missing_alt",
        reason:
          "{n} images on {url} have no alt attribute, for example {src}. Google calls alt text the most important attribute for image metadata, and WCAG requires a text alternative for non-text content. Use alt=\"\" for purely decorative images.",
      },
    ],
    fix: "Require an alt field (with a \"decorative\" option) wherever editors place images.",
    citations: [
      {
        source_id: "G-IMAGES",
        section: "Use descriptive alt text",
        quote:
          "The most important attribute when it comes to providing more metadata for an image is the alt text (text that describes an image), which also improves accessibility for people who can't see images on web pages",
      },
      {
        source_id: "WCAG-111",
        section: "Success Criterion 1.1.1 Non-text Content",
        quote: null,
      },
    ],
    notes:
      "The scanner does not judge whether alt text is descriptive, and it never recommends adding keywords to alt text.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-IMG-04",
    title: "Lazy-loaded images declare dimensions",
    class: "C3",
    weight: 2,
    gate: null,
    category: "images",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    standard: "the HTML Standard",
    book: "STANDARD",
    conditions: [
      {
        code: "lazy_without_dimensions",
        reason:
          "{n} lazy-loaded images on {url} lack width or height, for example {src}. The HTML Standard advises dimensions on lazy-loaded images to prevent the page layout from shifting around after the image loads.",
      },
    ],
    fix: "Store intrinsic dimensions at upload and render them as width and height attributes.",
    citations: [
      {
        source_id: "WHATWG-EMBED",
        section: "4.8.3 The img element",
        quote:
          "to prevent the page layout from shifting around after the image loads",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-IMG-04-HC",
    title: "All images declare dimensions (house convention)",
    class: "C4",
    weight: 0,
    gate: null,
    category: "images",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    book: "house convention",
    conditions: [
      {
        code: "missing_dimensions",
        reason:
          "{n} images on {url} lack width or height, for example {src}. The HTML Standard advises dimensions on lazy-loaded images; the check for all images is a house convention.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "WHATWG-EMBED",
        section: "4.8.3 The img element",
        quote:
          "to prevent the page layout from shifting around after the image loads",
      },
    ],
    houseConvention: true,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-IMG-03",
    title: "Image formats Google Images supports",
    class: "C4",
    weight: 0,
    gate: null,
    category: "images",
    scope: "page (P), first max_images_per_page images",
    scopeKind: "page",
    engines: ["google"],
    book: "SUPPORTED (Chapter 44)",
    conditions: [
      {
        code: "unsupported_format",
        reason:
          "{n} images on {url} are in a format outside BMP, GIF, JPEG, PNG, WebP, SVG and AVIF, for example {src} ({format}). Google lists these formats as supported for images referenced in img src.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-IMAGES",
        section: "Supported image formats",
        quote:
          "Google Search supports images referenced in the src attribute of img in the following file formats: BMP, GIF, JPEG, PNG, WebP, SVG, and AVIF.",
      },
    ],
    notes:
      "Informational because Google states support, not ineligibility. Descriptive file names are a house-convention info item (SEO-IMG-03-HC), citing Google's example that my-new-black-kitten.jpg is better than IMG00023.JPG. Favicons have a different list (SEO-META-05A). Google also states \"Google doesn't index CSS images\"; the scanner cannot tell a content image from a decorative background, so it does not check CSS.",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-IMG-03-HC",
    title: "Descriptive image file names (house convention)",
    class: "C4",
    weight: 0,
    gate: null,
    category: "images",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    book: "house convention",
    conditions: [
      {
        code: "default_filename",
        reason:
          "{n} images on {url} have file names that look like camera or CMS defaults, for example {src}. Google's example: \"For example, my-new-black-kitten.jpg is better than IMG00023.JPG.\" The pattern list is a house convention.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-IMAGES",
        section: "Use descriptive filenames, titles, and alt text",
        quote: "For example, my-new-black-kitten.jpg is better than IMG00023.JPG.",
      },
    ],
    notes:
      "Info when image file names look like camera or CMS defaults (for example IMG_1234.jpg, DSC0001.JPG, a bare hash). The pattern list is a house convention.",
    houseConvention: true,
    informational: true,
    scannerAdded: false,
  },
];
