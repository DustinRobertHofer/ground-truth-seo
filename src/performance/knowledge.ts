/**
 * KNOWLEDGE.md §13, transcribed: the home page performance diagnostics, the
 * metric thresholds, the LCP breakdown, what each diagnostic says and the
 * sources it cites. Strings are stored exactly as in the knowledge base with
 * Markdown backticks stripped; knowledge.test.ts holds them to it. The numeric
 * thresholds are the values the §13.3 table prints, so they are checked
 * against that text too.
 *
 * Safe to import from client components: it holds strings and numbers only.
 */

export const PERFORMANCE_DIAGNOSTICS_VERSION = "1.0.0";

export type MetricId = "LCP" | "INP" | "CLS" | "FCP" | "TTFB" | "TBT";
/** The metrics with Chrome UX Report field data, in §13.3 order. */
export type FieldMetricId = Exclude<MetricId, "TBT">;
export type SubpartKey = "ttfb" | "load_delay" | "load_duration" | "render_delay";

export interface PerformanceCitation {
  source_id: string;
  section: string;
  quote: string;
  /** Emitted only for these conditions; null for every condition (§13.1). */
  conditions: readonly string[] | null;
}

export interface PerformanceMetric {
  id: MetricId;
  name: string;
  coreWebVital: boolean;
  fieldInput: string | null;
  labInput: string | null;
  /** The Good and Poor cells as printed. */
  goodText: string;
  poorText: string;
  /** At or below: good. Above `poor`: poor. Null for a metric without a rating (TBT). */
  good: number | null;
  poor: number | null;
  unit: "ms" | "thousandths";
}

export interface LcpSubpart {
  key: SubpartKey;
  name: string;
  fieldInput: string;
  labInput: string;
  optimal: string;
}

export interface PerformanceCondition {
  code: string;
  /** The `Shown` line: when the condition is reported. */
  shown: string;
  /** Filled only from observed values (§13.1). */
  statement: string;
}

export interface PerformanceDiagnostic {
  id: string;
  title: string;
  metric: FieldMetricId;
  /** The `input` part of the Metric line as written: "lab" or "field and lab". */
  input: string;
  inspect: string;
  conditions: readonly PerformanceCondition[];
  recommendation: string;
  citations: readonly PerformanceCitation[];
  notes: string | null;
}

export interface PerformanceStatement {
  key: string;
  text: string;
  source: string;
}

/** §13.3, in order. Thresholds are integers: milliseconds, or thousandths for CLS. */
export const METRICS: readonly PerformanceMetric[] = [
  { id: "LCP", name: "Largest Contentful Paint", coreWebVital: true, fieldInput: "largest_contentful_paint", labInput: "largest-contentful-paint", goodText: "2,500 ms", poorText: "4,000 ms", good: 2500, poor: 4000, unit: "ms" },
  { id: "INP", name: "Interaction to Next Paint", coreWebVital: true, fieldInput: "interaction_to_next_paint", labInput: null, goodText: "200 ms", poorText: "500 ms", good: 200, poor: 500, unit: "ms" },
  { id: "CLS", name: "Cumulative Layout Shift", coreWebVital: true, fieldInput: "cumulative_layout_shift", labInput: "cumulative-layout-shift", goodText: "0.100", poorText: "0.250", good: 100, poor: 250, unit: "thousandths" },
  { id: "FCP", name: "First Contentful Paint", coreWebVital: false, fieldInput: "first_contentful_paint", labInput: "first-contentful-paint", goodText: "1,800 ms", poorText: "3,000 ms", good: 1800, poor: 3000, unit: "ms" },
  { id: "TTFB", name: "Time to First Byte", coreWebVital: false, fieldInput: "experimental_time_to_first_byte", labInput: null, goodText: "800 ms", poorText: "1,800 ms", good: 800, poor: 1800, unit: "ms" },
  { id: "TBT", name: "Total Blocking Time", coreWebVital: false, fieldInput: null, labInput: "total-blocking-time", goodText: "none", poorText: "none", good: null, poor: null, unit: "ms" },
];

/** The §13.3 citations, in order. */
export const METRIC_CITATIONS: readonly PerformanceCitation[] = [
  { source_id: "WEBDEV-LCP", section: "What is a good LCP score?", quote: "To provide a good user experience, sites should strive to have Largest Contentful Paint of 2.5 seconds or less.", conditions: null },
  { source_id: "WEBDEV-THRESHOLDS", section: "Largest Contentful Paint", quote: "Thus, we conclude that 2.5 seconds is a reasonable \"good\" threshold, and 4 seconds is a reasonable \"poor\" threshold for Largest Contentful Paint.", conditions: null },
  { source_id: "WEBDEV-INP", section: "What is a good INP score?", quote: "An INP below or at 200 milliseconds means a page has good responsiveness.", conditions: null },
  { source_id: "WEBDEV-INP", section: "What is a good INP score?", quote: "An INP above 500 milliseconds means a page has poor responsiveness.", conditions: null },
  { source_id: "WEBDEV-CLS", section: "What is a good CLS score?", quote: "Good CLS values are 0.1 or less. Poor values are greater than 0.25.", conditions: null },
  { source_id: "WEBDEV-FCP", section: "What is a good FCP score?", quote: "Good FCP values are 1.8 seconds or less. Poor values are greater than 3.0 seconds", conditions: null },
  { source_id: "WEBDEV-TTFB", section: "What is a good TTFB score?", quote: "Good TTFB values are 0.8 seconds or less, and poor values are greater than 1.8 seconds.", conditions: null },
  { source_id: "WEBDEV-VITALS", section: "Other Web Vitals", quote: "the metrics Time to First Byte (TTFB) and First Contentful Paint (FCP) are both vital aspects of the loading experience, and are both useful in diagnosing issues with LCP (slow server response times or render-blocking resources, respectively).", conditions: null },
  { source_id: "WEBDEV-INP", section: "In the lab", quote: "In such cases, Total Blocking Time (TBT) may be a reasonable proxy metric for INP, but it's not a substitute for INP in and of itself.", conditions: null },
  { source_id: "PSI-ABOUT", section: "Core Web Vitals", quote: "the aggregation passes the Core Web Vitals assessment if the 75th percentiles of all three metrics are Good.", conditions: null },
  { source_id: "PSI-ABOUT", section: "Core Web Vitals", quote: "If the aggregation has insufficient data for INP, then it will pass the assessment if both the 75th percentiles of LCP and CLS are Good. If either LCP or CLS have insufficient data, the page or origin-level aggregation cannot be assessed.", conditions: null },
];

/** §13.4, in order. */
export const LCP_SUBPARTS: readonly LcpSubpart[] = [
  { key: "ttfb", name: "Time to first byte", fieldInput: "largest_contentful_paint_image_time_to_first_byte", labInput: "timeToFirstByte", optimal: "about 40%" },
  { key: "load_delay", name: "Resource load delay", fieldInput: "largest_contentful_paint_image_resource_load_delay", labInput: "resourceLoadDelay", optimal: "under 10%" },
  { key: "load_duration", name: "Resource load duration", fieldInput: "largest_contentful_paint_image_resource_load_duration", labInput: "resourceLoadDuration", optimal: "about 40%" },
  { key: "render_delay", name: "Element render delay", fieldInput: "largest_contentful_paint_image_element_render_delay", labInput: "elementRenderDelay", optimal: "under 10%" },
];

/** The §13.4 citations, in order. */
export const BREAKDOWN_CITATIONS: readonly PerformanceCitation[] = [
  { source_id: "WEBDEV-OPT-LCP", section: "LCP breakdown", quote: "Every single page can have its LCP value broken down into these four subparts. There is no overlap or gap between them. Collectively, they add up to the full LCP time.", conditions: null },
  { source_id: "WEBDEV-OPT-LCP", section: "Optimal subpart times", quote: "Note that these time breakdowns are guidelines, not strict rules.", conditions: null },
  { source_id: "WEBDEV-OPT-LCP", section: "Optimal subpart times", quote: "These subparts are only meaningful relative to each other, so it's best to always measure them that way.", conditions: null },
  { source_id: "CRUX-METRICS", section: "LCP image subparts", quote: "As they represent aggregated data across many page views, image subparts are provided at the 75th percentile so the sum of the subparts aren't expected to equal the overall LCP 75th percentile.", conditions: null },
];

/** §13.5, in order. */
export const DIAGNOSTICS: readonly PerformanceDiagnostic[] = [
  {
    id: "PERF-LCP-01",
    title: "The LCP resource starts loading late",
    metric: "LCP",
    input: "lab",
    inspect: "the lcp-breakdown-insight subparts and LCP element.",
    conditions: [
      { code: "load_delay", shown: "resource load delay is 10% or more of the sum of the four subparts.", statement: "In the {run} lab run, the LCP element ({element}) started loading its resource {value} after the first byte arrived: {share}% of its {lcp} LCP. On a well-optimized page, web.dev puts resource load delay under 10% of LCP." },
    ],
    recommendation: "Let the browser find the LCP resource in the HTML and start it with the first resources the page loads: give the image an <img> element with src or srcset in the server's HTML, preload it with fetchpriority=\"high\" when only CSS or JavaScript references it, never lazy-load it, and serve it from the page's own origin where you can.",
    citations: [
      { source_id: "WEBDEV-OPT-LCP", section: "1. Eliminate resource load delay", quote: "A good rule of thumb is that your LCP resource should start loading at the same time as the first resource loaded by that page.", conditions: null },
      { source_id: "WEBDEV-OPT-LCP", section: "Optimal subpart times", quote: "Of the four subparts, two have the word \"delay\" in their names. That is a clue that you want to get these times as close to zero as possible.", conditions: null },
      { source_id: "WEBDEV-OPT-LCP", section: "Optimize the priority the resource is given", quote: "When possible, it's a good idea to host critical resources on the same origin as your HTML document resource because then those resources can save time by reusing the existing connection", conditions: null },
    ],
    notes: null,
  },
  {
    id: "PERF-LCP-02",
    title: "The LCP image is lazy-loaded",
    metric: "LCP",
    input: "lab",
    inspect: "the eagerlyLoaded item of the lcp-discovery-insight checklist, and the LCP element.",
    conditions: [
      { code: "lazy", shown: "eagerlyLoaded is false.", statement: "In the {run} lab run, the LCP element ({element}) is lazy-loaded, so the browser waits for layout before it requests the image." },
    ],
    recommendation: "Remove loading=\"lazy\" from the LCP image, and from any image that may be the largest element on another screen size. Keep lazy loading for images further down the page.",
    citations: [
      { source_id: "WEBDEV-OPT-LCP", section: "Optimize the priority the resource is given", quote: "Never lazy-load your LCP image, as that will always lead to unnecessary resource load delay, and will have a negative impact on LCP.", conditions: null },
      { source_id: "WEBDEV-OPT-LCP", section: "Optimize the priority the resource is given", quote: "Using lazy loading means that the resource won't be loaded until after layout confirms the image is in the viewport and so may begin loading later than it otherwise would.", conditions: null },
    ],
    notes: null,
  },
  {
    id: "PERF-LCP-03",
    title: "The LCP resource is not in the initial HTML",
    metric: "LCP",
    input: "lab",
    inspect: "the requestDiscoverable item of the lcp-discovery-insight checklist, and the LCP element.",
    conditions: [
      { code: "not_discoverable", shown: "requestDiscoverable is false.", statement: "In the {run} lab run, the browser could not find the resource of the LCP element ({element}) in the initial HTML document, so it could request it only after a script or style sheet referenced it." },
    ],
    recommendation: "Put the image in the HTML the server sends, as an <img> element with src or srcset (not data-src filled in by a script). When only a style sheet or a script can reference it, preload it with <link rel=\"preload\" as=\"image\" fetchpriority=\"high\">.",
    citations: [
      { source_id: "WEBDEV-OPT-LCP", section: "Optimize when the resource is discovered", quote: "To eliminate unnecessary resource load delay, your LCP resource should be discoverable from the HTML source. In cases where the resource is only referenced from an external CSS or JavaScript file, the LCP resource should be preloaded with a high fetch priority", conditions: null },
    ],
    notes: null,
  },
  {
    id: "PERF-LCP-04",
    title: "The LCP image is not requested with high priority",
    metric: "LCP",
    input: "lab",
    inspect: "the priorityHinted item of the lcp-discovery-insight checklist, and the LCP element.",
    conditions: [
      { code: "no_priority", shown: "priorityHinted is false.", statement: "In the {run} lab run, the LCP element ({element}) is an image requested without fetchpriority=\"high\"." },
    ],
    recommendation: "Add fetchpriority=\"high\" to the LCP image's <img> element, or to its preload, and to no more than one or two images on the page.",
    citations: [
      { source_id: "WEBDEV-OPT-LCP", section: "Optimize the priority the resource is given", quote: "It's a good idea to set fetchpriority=\"high\" on an <img> element if you think it's likely to be your page's LCP element. However, setting a high priority on more than one or two images makes priority setting unhelpful in reducing LCP.", conditions: null },
    ],
    notes: null,
  },
  {
    id: "PERF-LCP-05",
    title: "The LCP element renders late",
    metric: "LCP",
    input: "lab",
    inspect: "the lcp-breakdown-insight subparts and LCP element.",
    conditions: [
      { code: "render_delay", shown: "element render delay is 10% or more of the sum of the four subparts.", statement: "In the {run} lab run, the LCP element ({element}) rendered {value} after its resource finished loading: {share}% of its {lcp} LCP. On a well-optimized page, web.dev puts element render delay under 10% of LCP." },
    ],
    recommendation: "Find what holds rendering back once the resource has arrived: style sheets and synchronous scripts in the <head> (PERF-FCP-01), an element that JavaScript adds instead of the server's HTML, a script that hides content until it decides what to show, or long tasks on the main thread (PERF-INP-01). Server-side rendering or static generation removes the wait for scripts.",
    citations: [
      { source_id: "WEBDEV-OPT-LCP", section: "2. Eliminate element render delay", quote: "The goal in this step is to ensure the LCP element can render immediately after its resource has finished loading, no matter when that happens.", conditions: null },
      { source_id: "WEBDEV-OPT-LCP", section: "Use server-side rendering", quote: "Your page content won't require additional JavaScript requests to finish before it can render.", conditions: null },
    ],
    notes: null,
  },
  {
    id: "PERF-LCP-06",
    title: "Images could be smaller",
    metric: "LCP",
    input: "lab",
    inspect: "the image-delivery-insight items: URL, size and estimated saving.",
    conditions: [
      { code: "smaller", shown: "at least one image has an estimated saving above zero.", statement: "In the {run} lab run, Lighthouse estimates that {count} images could be {bytes} smaller in all; the largest saving is {top_bytes} on {top_url}." },
    ],
    recommendation: "Serve each image compressed, in a modern format such as AVIF or WebP, and at the size it is displayed, or through an image CDN that does this for you. A smaller LCP image shortens resource load duration, which improves LCP only when the two delays are already short.",
    citations: [
      { source_id: "WEBDEV-OPT-LCP", section: "LCP breakdown", quote: "if you reduced the file size of our image by compressing it more or switching to a more optimal format (such as AVIF or WebP), that would reduce the resource load duration, but it wouldn't actually improve LCP because the time would just shift to the element render delay subpart", conditions: null },
      { source_id: "WEBDEV-OPT-LCP", section: "Reduce the distance the resource has to travel", quote: "Image CDNs in particular are especially helpful because they not only reduce the distance the resource has to travel, but they also generally reduce the size of the resource—automatically implementing all of the size-reduction recommendations from earlier for you.", conditions: null },
    ],
    notes: null,
  },
  {
    id: "PERF-INP-01",
    title: "Long tasks keep the main thread busy",
    metric: "INP",
    input: "field and lab",
    inspect: "the field INP; the long-tasks items (URL and duration) and the lab Total Blocking Time.",
    conditions: [
      { code: "field", shown: "the field INP is above 200 ms.", statement: "Real visitors on {device} waited {value} at the 75th percentile for {scope_label} to respond to an interaction ({first_date} to {last_date}), above the 'good' value of 200 ms." },
      { code: "long_tasks", shown: "the run lists at least one long task.", statement: "In the {run} lab run, the main thread ran {count} long tasks while the page loaded, the longest for {longest} ({longest_url}); Total Blocking Time was {tbt}." },
    ],
    recommendation: "Send less JavaScript at startup and split what remains, break long tasks up by yielding to the main thread, and keep event handlers to the work that updates the next frame, deferring the rest.",
    citations: [
      { source_id: "WEBDEV-OPT-INP", section: "The relationship between script evaluation and long tasks during startup", quote: "Depending on the size of a script, this work can introduce long tasks on the main thread, which will delay the browser from responding to other user interactions.", conditions: null },
      { source_id: "WEBDEV-OPT-INP", section: "Yield to the main thread often", quote: "This prevents the collective work from becoming a long task that blocks the main thread, which allows other interactions that otherwise would be waiting on the main thread to run sooner.", conditions: null },
      { source_id: "WEBDEV-INP", section: "In the lab", quote: "In such cases, Total Blocking Time (TBT) may be a reasonable proxy metric for INP, but it's not a substitute for INP in and of itself.", conditions: ["long_tasks"] },
    ],
    notes: null,
  },
  {
    id: "PERF-INP-02",
    title: "JavaScript is downloaded but not used",
    metric: "INP",
    input: "lab",
    inspect: "the unused-javascript items: URL, size and unused bytes.",
    conditions: [
      { code: "unused", shown: "the run lists at least one script.", statement: "In the {run} lab run, {count} scripts carried {bytes} of JavaScript that the page did not use while loading ({examples})." },
    ],
    recommendation: "Split bundles by page and load the code for a feature when it is first used, so the browser parses, compiles and runs less at startup.",
    citations: [
      { source_id: "WEBDEV-OPT-INP", section: "The relationship between script evaluation and long tasks during startup", quote: "After a JavaScript file has been fetched from the network, the browser still has work to do before that JavaScript can run; that work includes parsing a script to check its syntax is valid, compiling it into bytecode, and then finally executing it.", conditions: null },
      { source_id: "WEBDEV-FCP", section: "How to improve FCP", quote: "Remove unused JavaScript", conditions: null },
    ],
    notes: null,
  },
  {
    id: "PERF-INP-03",
    title: "Scripts force synchronous layout",
    metric: "INP",
    input: "lab",
    inspect: "the forced-reflow-insight items: source location and reflow time.",
    conditions: [
      { code: "forced_reflow", shown: "the run lists at least one source.", statement: "In the {run} lab run, scripts forced the browser to calculate layout synchronously from {count} places ({examples})." },
    ],
    recommendation: "In each listed place, read the layout values you need before changing styles, or move the reads to a later task, so the browser can lay the page out once.",
    citations: [
      { source_id: "WEBDEV-OPT-INP", section: "Avoid layout thrashing", quote: "Layout thrashing is a performance bottleneck because by updating styles and then immediately requesting the values of those styles in JavaScript, the browser is forced to do synchronous layout work it otherwise could have waited to perform asynchronously later on after event callbacks have finished running.", conditions: null },
    ],
    notes: null,
  },
  {
    id: "PERF-CLS-01",
    title: "Content shifts on the page",
    metric: "CLS",
    input: "field and lab",
    inspect: "the field CLS; the lab CLS and the cls-culprits-insight items: shifted elements with their scores, and the causes the run names (\"Unsized image element\", \"Web font\", \"Injected iframe\").",
    conditions: [
      { code: "field", shown: "the field CLS is above 0.100, and the lab CLS is above 0.100 too or there is no lab run.", statement: "Real visitors on {device} saw a layout shift score of {value} at the 75th percentile on {scope_label} ({first_date} to {last_date}), above the 'good' value of 0.100." },
      { code: "post_load", shown: "the field CLS is above 0.100 and the lab CLS is 0.100 or less.", statement: "Real visitors on {device} saw a layout shift score of {value} at the 75th percentile on {scope_label} ({first_date} to {last_date}), while the {run} lab run measured {lab_value} during load, which often points to shifts after the page has loaded." },
      { code: "lab", shown: "the lab CLS is above 0.100.", statement: "In the {run} lab run, the page shifted by {value} while loading; the elements that moved most were {examples}.{causes_clause}" },
    ],
    recommendation: "Reserve space for everything that arrives late: width and height on images and video, a min-height or aspect-ratio on ad slots, embeds and injected banners. Animate with transform rather than top or left. Shifts after load come from content added on scroll, after a timer or in response to the visitor; reserve space for it too.",
    citations: [
      { source_id: "WEBDEV-OPT-CLS", section: "Ads, embeds, and other late-loaded content", quote: "Images aren't the only type of content that can cause layout shifts. Ads, embeds, iframes, and other dynamically injected content can all cause content appearing after them to shift down, increasing your CLS.", conditions: null },
      { source_id: "WEBDEV-OPT-CLS", section: "Reserve space for late-loading content", quote: "When placing late-loading content in the content flow, layout shifts can be avoided by reserving the space for them in the initial layout.", conditions: null },
      { source_id: "WEBDEV-OPT-CLS", section: "Animations", quote: "Changing the top and left properties also cause layout shifts, even when the element being moved is on its own layer. Avoid animating using these properties.", conditions: null },
      { source_id: "WEBDEV-OPT-CLS", section: "CLS in lab tools versus field", quote: "Disagreement between the CrUX and Lighthouse CLS scores often indicates post-load CLS.", conditions: ["post_load"] },
      { source_id: "WEBDEV-OPT-CLS", section: "CLS in lab tools versus field", quote: "Lighthouse will identify the elements that were shifted, but often these are the ones impacted rather than the elements causing the CLS.", conditions: ["lab"] },
    ],
    notes: "{causes_clause} is \" Lighthouse traced shifts to {causes}.\" when the run names causes, where {causes} counts each cause, as in \"2 unsized images and 1 web font\", otherwise empty. Elements are named by their selectors.",
  },
  {
    id: "PERF-CLS-02",
    title: "Images have no width and height",
    metric: "CLS",
    input: "lab",
    inspect: "the unsized-images items: URL and element.",
    conditions: [
      { code: "unsized", shown: "the run lists at least one image.", statement: "In the {run} lab run, {count} images have no explicit width and height ({examples})." },
    ],
    recommendation: "Add width and height attributes to every <img> and <video> element (CSS can still resize them, with height: auto), or reserve their space with CSS aspect-ratio.",
    citations: [
      { source_id: "WEBDEV-OPT-CLS", section: "Images without dimensions", quote: "Always include width and height size attributes on your images and video elements. Alternatively, reserve the required space with CSS aspect-ratio or similar.", conditions: null },
    ],
    notes: null,
  },
  {
    id: "PERF-CLS-03",
    title: "The page cannot use the back/forward cache",
    metric: "CLS",
    input: "lab",
    inspect: "the bf-cache items whose failure type is Actionable: the reason Chrome gives.",
    conditions: [
      { code: "blocked", shown: "the run lists at least one actionable reason.", statement: "In the {run} lab run, Chrome could not keep the home page in the back/forward cache: {reasons}." },
    ],
    recommendation: "Remove each reason Chrome names, so that a visitor who returns with the back or forward button gets the page back as they left it, without shifting again.",
    citations: [
      { source_id: "WEBDEV-OPT-CLS", section: "Reduce CLS by ensuring pages are eligible for the bfcache", quote: "A highly effective technique for keeping CLS scores low is to ensure your web pages are eligible for the back/forward cache (bfcache).", conditions: null },
      { source_id: "WEBDEV-OPT-CLS", section: "Reduce CLS by ensuring pages are eligible for the bfcache", quote: "This means the fully loaded page is instantly available—without any shifts which may be normally seen during load due to any of the reasons given earlier.", conditions: null },
    ],
    notes: "{reasons} lists every reason in the order of the run, separated by \"; \".",
  },
  {
    id: "PERF-FCP-01",
    title: "Requests block the first render",
    metric: "FCP",
    input: "lab",
    inspect: "the render-blocking-insight items: URL, size and estimated wasted time; the audit's estimated FCP saving.",
    conditions: [
      { code: "blocking", shown: "the run lists at least one request.", statement: "In the {run} lab run, {count} requests blocked the first render ({examples}).{saving_clause}" },
    ],
    recommendation: "Load scripts with async or defer instead of synchronously in the <head>. Make the CSS that blocks rendering small: remove unused rules, move styles the first view does not need to a later load, inline only small critical CSS, and minify and compress the rest.",
    citations: [
      { source_id: "WEBDEV-OPT-LCP", section: "Defer or inline render-blocking JavaScript", quote: "It is almost never necessary to add synchronous scripts (scripts without the async or defer attributes) to the <head> of your pages, and doing so will almost always have a negative impact on performance.", conditions: null },
      { source_id: "WEBDEV-OPT-LCP", section: "Reduce or inline render-blocking stylesheets", quote: "In most cases, the best way to ensure the style sheet does not block rendering of the LCP element is to reduce its size so that it's smaller than the LCP resource.", conditions: null },
      { source_id: "WEBDEV-OPT-LCP", section: "Reduce or inline render-blocking stylesheets", quote: "Defer non-critical CSS: split your style sheet out into styles that are required for initial page load and then styles that can be loaded lazily.", conditions: null },
    ],
    notes: "{saving_clause} is \" Lighthouse estimates the first render could come {saving} earlier without them.\" when the estimated FCP saving is above zero, otherwise empty.",
  },
  {
    id: "PERF-FCP-02",
    title: "Text waits for web fonts",
    metric: "FCP",
    input: "lab",
    inspect: "the font-display-insight items: URL and estimated wasted time.",
    conditions: [
      { code: "font_display", shown: "the run lists at least one font.", statement: "In the {run} lab run, {count} web fonts loaded without a font-display value that keeps text visible while they download ({examples})." },
    ],
    recommendation: "Set font-display to swap, fallback or optional in each @font-face rule. optional also avoids a layout shift when the font arrives late, and preloading the fonts the first view needs helps them arrive in time.",
    citations: [
      { source_id: "WEBDEV-OPT-LCP", section: "Eliminate the network time entirely", quote: "If you set a font-display value of anything other than auto or block, then text will always be visible during load, and LCP won't be blocked on an additional network request.", conditions: null },
      { source_id: "WEBDEV-OPT-CLS", section: "Web fonts", quote: "font-display: optional can avoid a re-layout as the web font is only used if it is available by the time of initial layout.", conditions: null },
    ],
    notes: null,
  },
  {
    id: "PERF-TTFB-01",
    title: "The home page redirects before it loads",
    metric: "TTFB",
    input: "lab",
    inspect: "the noRedirects item of the document-latency-insight checklist and the redirect duration.",
    conditions: [
      { code: "redirects", shown: "noRedirects is false.", statement: "In the {run} lab run, the request for {url} went through redirects that took {value} before the page itself was requested." },
    ],
    recommendation: "Link to the final URL everywhere you control, including navigation, sitemaps, ads and newsletters, and send an HSTS header so that browsers go straight to HTTPS on later visits.",
    citations: [
      { source_id: "WEBDEV-OPT-TTFB", section: "Avoid multiple page redirects", quote: "Eliminating redirects under your direct control can help to achieve a good TTFB.", conditions: null },
      { source_id: "WEBDEV-OPT-TTFB", section: "Avoid multiple page redirects", quote: "Focus on eliminating same-origin redirects, as this is something you have direct control over.", conditions: null },
      { source_id: "WEBDEV-OPT-TTFB", section: "Avoid multiple page redirects", quote: "One way you can get around this is to use the Strict-Transport-Security header (HSTS), which enforces HTTPS on the first visit to an origin, and then tells the browser to immediately access the origin through the HTTPS scheme on future visits.", conditions: null },
    ],
    notes: null,
  },
  {
    id: "PERF-TTFB-02",
    title: "The server responds slowly",
    metric: "TTFB",
    input: "field and lab",
    inspect: "the field TTFB; the serverResponseIsFast item of the document-latency-insight checklist and the observed server response time.",
    conditions: [
      { code: "field", shown: "the field TTFB is above 800 ms.", statement: "Real visitors on {device} waited {value} at the 75th percentile for the first byte of {scope_label} ({first_date} to {last_date}), above the 'good' value of 800 ms." },
      { code: "lab", shown: "serverResponseIsFast is false.", statement: "In the {run} lab run, the server took {value} to answer the request for the home page." },
    ],
    recommendation: "Check first that the hosting can handle the traffic. Then serve the page through a CDN, with Cache-Control headers that let its edge servers keep a copy, and stream or statically render the HTML so the first bytes leave early.",
    citations: [
      { source_id: "WEBDEV-OPT-TTFB", section: "Hosting, hosting, hosting", quote: "Before you even consider other optimization approaches, hosting should be the first thing you consider.", conditions: null },
      { source_id: "WEBDEV-OPT-TTFB", section: "Use a Content Delivery Network (CDN)", quote: "While adopting a CDN involves a varying amount of effort from trivial to significant, it should be a high priority to pursue in optimizing your TTFB if your website is not already using one.", conditions: null },
      { source_id: "WEBDEV-OPT-TTFB", section: "Use cached content where possible", quote: "CDNs allow content to be cached at edge servers which are located physically closer to visitors, provided the content is configured with the appropriate Cache-Control HTTP headers.", conditions: null },
      { source_id: "WEBDEV-TTFB", section: "What is a good TTFB score?", quote: "Because TTFB isn't a Core Web Vitals metric, it's not absolutely necessary that sites meet the \"good\" TTFB threshold, provided that it doesn't impede their ability to score well on the metrics that matter.", conditions: ["field"] },
    ],
    notes: null,
  },
];

/** §13.6, in order. `source` is "Scanner statement" or "<source ID> · <section>". */
export const PERFORMANCE_STATEMENTS: readonly PerformanceStatement[] = [
  { key: "advisory", text: "These diagnostics are advisory. They are not SEO rules: they carry no weight, never change the score and are not part of report.json. In the report, SEO-PERF-01 judges the same Core Web Vitals field data.", source: "Scanner statement" },
  { key: "field_first", text: "If Lighthouse and CrUX disagree, then CrUX likely provides a more accurate picture of your user experience.", source: "WEBDEV-OPT-LCP · Using PageSpeed Insights Lighthouse data" },
  { key: "lab_one_run", text: "Lab data is useful for debugging issues, as it is collected in a controlled environment. However, it may not capture real-world bottlenecks.", source: "PSI-ABOUT · About PageSpeed Insights" },
  { key: "no_lab_score", text: "No Lighthouse score is shown. Google says that \"trying to get a perfect score just for SEO reasons may not be the best use of your time\".", source: "G-PAGE-EXP · What aspects of page experience are used in ranking?" },
  { key: "field_off", text: "Field data was not requested: no Chrome UX Report API key is configured (CRUX_API_KEY).", source: "Scanner statement" },
  { key: "field_none", text: "The Chrome UX Report has no field data for the home page or for the origin on {device}. It includes only pages and origins with enough real visits from Chrome users.", source: "Scanner statement" },
  { key: "field_origin", text: "The Chrome UX Report has too little data for the home page itself on {device}, so field values there are for the whole origin.", source: "Scanner statement" },
  { key: "field_failed", text: "The Chrome UX Report could not be read for {device}: {error}.", source: "Scanner statement" },
  { key: "lab_off", text: "The lab run was not requested: no PageSpeed Insights API key is configured (PAGESPEED_API_KEY, or CRUX_API_KEY when that key's Google Cloud project has the PageSpeed Insights API enabled).", source: "Scanner statement" },
  { key: "lab_failed", text: "PageSpeed Insights could not complete the {run} lab run: {error}.", source: "Scanner statement" },
];
/** The share of LCP above which a delay subpart is shown (§13.5 PERF-LCP-01, PERF-LCP-05): "10% or more". */
export const DELAY_SHARE_PERCENT = 10;

/** The cause names the run gives in cls-culprits-insight (PERF-CLS-01 Inspect), and how {causes} counts them. */
export const CLS_CAUSES = [
  { cause: "Unsized image element", one: "unsized image", many: "unsized images" },
  { cause: "Web font", one: "web font", many: "web fonts" },
  { cause: "Injected iframe", one: "injected iframe", many: "injected iframes" },
] as const;

/** The bf-cache failure type PERF-CLS-03 reads. */
export const BFCACHE_ACTIONABLE = "Actionable";

/** The §13.6 `{error}` texts. `<status>` and `<code>` are filled from the InputError. */
export const INPUT_ERROR_TEXT = {
  http: "the API answered HTTP <status>",
  timeout: "the request timed out",
  network: "a connection error",
  invalid: "the response could not be read",
  lighthouse: "Lighthouse reported <code>",
  unknown_code: "an error",
} as const;

export function diagnosticById(id: string): PerformanceDiagnostic | undefined {
  return DIAGNOSTICS.find((d) => d.id === id);
}

export function statementByKey(key: string): PerformanceStatement {
  const s = PERFORMANCE_STATEMENTS.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown performance statement ${key}`);
  return s;
}
