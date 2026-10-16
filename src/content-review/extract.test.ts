import { describe, expect, it } from "vitest";
import { baselineSite, page, snapshotOf, text, type FakeSite } from "../testing/index.js";
import { canonicalize } from "../scanner/snapshot/canonical-json.js";
import { extractContent, llmsStructure } from "./extract.js";

const ORIGIN = "https://www.example.com";
const HOME = `${ORIGIN}/`;
const ABOUT = `${ORIGIN}/about`;
const CONTACT = `${ORIGIN}/contact`;
const CONFIG = { start_url: HOME, max_pages: 20 };

const HOME_HEAD = `<link rel="canonical" href="${HOME}"><link rel="icon" href="/favicon.png"><meta name="description" content="Boat tours on Lake Example."><meta property="og:title" content="Example Boat Tours"><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Example Tours","url":"${HOME}"},{"@type":"LocalBusiness","name":"Example Tours LLC"}]}</script>`;
const HOME_BODY = `<header><a href="/">Logo</a><nav><a href="/about">About the company</a> <a href="/contact">Contact us</a></nav></header>
<main>
<h1>Boat tours on Lake Example</h1>
<p>Two-hour tours leave the north dock daily.</p>
<ul><li>Sunset tour</li><li>Fishing tour</li></ul>
<table><tr><th>Tour</th><th>Price</th></tr><tr><td>Sunset</td><td>$40</td></tr></table>
<h2>Questions</h2>
<details><summary>Do tours run in rain?</summary><p>Yes, unless there is lightning.</p></details>
<details open><summary>Can I bring a dog?</summary><p>Leashed dogs are welcome.</p></details>
<p hidden>Secret text</p>
<img src="/photo.png" alt="Pontoon boat" width="100" height="100">
</main>
<footer>Copyright Example Tours</footer>`;
const ABOUT_BODY = `<h1>About us</h1><h2>Who runs the tours?</h2><p>Captain Ana has run tours since 2004.</p><img src="/a.png"><a href="/">Home page</a> <a href="/contact">Contact us</a>`;
const ABOUT_HEAD = `<link rel="canonical" href="${ABOUT}"><meta name="description" content="About the example company."><meta name="author" content="Ana Example"><script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Who runs the tours?","acceptedAnswer":{"@type":"Answer","text":"<p>Captain Ana.</p>"}}]}</script>`;
const LLMS = `# Example Tours\n\n> Boat tours on Lake Example.\n\nWe run daily tours.\n\n## Tours\n\n- [Sunset tour](${ORIGIN}/sunset.md): Evening\n- [Fishing](${ORIGIN}/fishing): Morning\n\n## Optional\n\n- [About](${ABOUT})\n`;

function site(overrides: Record<string, ReturnType<typeof page> | ReturnType<typeof text> | undefined> = {}): FakeSite {
  const base = baselineSite(ORIGIN);
  const responses = {
    ...base.responses,
    [HOME]: page("Example Tours | Boat tours on Lake Example", HOME_HEAD, HOME_BODY),
    [ABOUT]: page("About Example Tours", ABOUT_HEAD, ABOUT_BODY),
    [`${ORIGIN}/llms.txt`]: text(LLMS),
  } as FakeSite["responses"];
  for (const [url, response] of Object.entries(overrides)) {
    if (response === undefined) delete responses[url];
    else responses[url] = response;
  }
  return { ...base, responses };
}

async function extract(fake: FakeSite, pages?: number) {
  const { snapshot, config } = await snapshotOf(fake, CONFIG);
  return extractContent(snapshot, config, { pages });
}

describe("extractContent", () => {
  it("samples the home page first, then pages by crawl depth and URL", async () => {
    const content = await extract(site());
    expect(content.pages.map((p) => p.url)).toEqual([HOME, ABOUT, CONTACT]);
    expect(content.candidates).toBe(3);
    expect(content.pages[0]!.depth).toBe(0);
    expect((await extract(site(), 2)).pages.map((p) => p.url)).toEqual([HOME, ABOUT]);
  });

  it("leaves out noindex pages", async () => {
    const content = await extract(site({ [CONTACT]: page("Contact", `<meta name="robots" content="noindex">`) }));
    expect(content.pages.map((p) => p.url)).toEqual([HOME, ABOUT]);
  });

  it("reads head metadata and site names", async () => {
    const content = await extract(site());
    const home = content.pages[0]!;
    expect(home.title).toBe("Example Tours | Boat tours on Lake Example");
    expect(home.metaDescription).toBe("Boat tours on Lake Example.");
    expect(home.ogTitle).toBe("Example Boat Tours");
    expect(home.canonical).toBe(HOME);
    expect(home.lang).toBe("en");
    expect(content.siteName).toBe("Example Tours");
    expect(content.organizationName).toBe("Example Tours LLC");
  });

  it("serializes main content with structure, marks collapsed text and drops chrome and hidden text", async () => {
    const home = (await extract(site())).pages[0]!;
    expect(home.text).toBe(
      [
        "# Boat tours on Lake Example",
        "Two-hour tours leave the north dock daily.",
        "- Sunset tour",
        "- Fishing tour",
        "| Tour | Price |",
        "| Sunset | $40 |",
        "## Questions",
        "[toggle] Do tours run in rain?",
        "[collapsed] Yes, unless there is lightning.",
        "[toggle] Can I bring a dog?",
        "Leashed dogs are welcome.",
        "[image: Pontoon boat]",
      ].join("\n"),
    );
    expect(home.text).not.toContain("Secret");
    expect(home.text).not.toContain("Copyright");
    expect(home.visibleQa).toEqual([
      { question: "Do tours run in rain?", answer: "Yes, unless there is lightning.", collapsed: true },
      { question: "Can I bring a dog?", answer: "Leashed dogs are welcome.", collapsed: false },
    ]);
    expect(home.headings).toEqual([
      { level: 1, text: "Boat tours on Lake Example" },
      { level: 2, text: "Questions" },
    ]);
  });

  it("uses the body without nav and footer when there is no main element", async () => {
    const about = (await extract(site())).pages[1]!;
    expect(about.text.startsWith("# About us\n## Who runs the tours?\nCaptain Ana has run tours since 2004.")).toBe(true);
    expect(about.questionHeadings).toEqual(["Who runs the tours?"]);
    expect(about.faqMarkup).toEqual([{ question: "Who runs the tours?", answer: "Captain Ana." }]);
    expect(about.jsonLdTypes).toEqual(["Answer", "FAQPage", "Question"]);
    expect(about.authors).toEqual(["Ana Example"]);
    expect(about.images).toBe(1);
    expect(about.imagesWithoutAlt).toBe(1);
  });

  it("reads React streaming segments and records the fallback shown before scripts run", async () => {
    const streamed = `<main style="height:90vh"><svg></svg><div><span>Loading...</span></div></main>
<div hidden id="S:2"><header><nav><a href="/">Home</a></nav></header><main class="w-full"><h1>Captain-led boat tours</h1><p>Tours leave the north dock at 9 and 5 every day from May to October.</p></main></div>
<div hidden><p>Not streamed, really hidden</p></div>
<script>$RC("B:0","S:2")</script>`;
    const content = await extract(site({ [CONTACT]: page("Contact Example", "", streamed) }));
    const contact = content.pages.find((p) => p.url === CONTACT)!;
    expect(contact.text).toBe("# Captain-led boat tours\nTours leave the north dock at 9 and 5 every day from May to October.");
    expect(contact.streamingFallback).toBe("Loading...");
    expect(contact.headings).toEqual([{ level: 1, text: "Captain-led boat tours" }]);
    expect(content.pages[0]!.streamingFallback).toBeNull();
  });

  it("reads llms.txt and its structure", async () => {
    const { llmsTxt } = await extract(site());
    expect(llmsTxt.outcome).toBe("HTTP 200");
    expect(llmsTxt.found).toBe(true);
    expect(llmsTxt.structure).toEqual({
      h1: "Example Tours",
      summary: "Boat tours on Lake Example.",
      sections: [
        { title: "Tours", links: 2 },
        { title: "Optional", links: 1 },
      ],
      links: 3,
      markdownLinks: 1,
    });
  });

  it("recognizes an HTML page served at /llms.txt and a missing file", async () => {
    const html = await extract(site({ [`${ORIGIN}/llms.txt`]: page("Not found but 200") }));
    expect(html.llmsTxt).toMatchObject({ found: false, servedHtml: true, text: null, outcome: "HTTP 200" });
    const missing = await extract(site({ [`${ORIGIN}/llms.txt`]: undefined }));
    expect(missing.llmsTxt).toMatchObject({ found: false, servedHtml: false, outcome: "HTTP 404" });
  });

  it("reports the home page's access for every crawler in the reference", async () => {
    const blocked = site({ [`${ORIGIN}/robots.txt`]: text(`User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`) });
    const { crawlerAccess } = await extract(blocked);
    expect(crawlerAccess.find((c) => c.crawler === "GPTBot")).toMatchObject({ outcome: "disallowed", rule: "Disallow: /" });
    expect(crawlerAccess.find((c) => c.crawler === "OAI-SearchBot")).toMatchObject({ outcome: "allowed" });
  });

  it("is deterministic", async () => {
    const { snapshot, config } = await snapshotOf(site(), CONFIG);
    expect(canonicalize(extractContent(snapshot, config))).toBe(canonicalize(extractContent(snapshot, config)));
  });
});

describe("llmsStructure", () => {
  it("requires the H1 to be the first content line", () => {
    expect(llmsStructure("Intro\n# Name\n").h1).toBeNull();
    expect(llmsStructure("\n\n# Name\n> Summary\n").summary).toBe("Summary");
  });
});
