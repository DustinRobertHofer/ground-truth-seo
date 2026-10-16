import { describe, expect, it } from "vitest";
import { cruxKey, normalizeCruxResponse } from "./crux.js";

describe("Chrome UX Report normalization", () => {
  it("stores integer milliseconds and CLS thousandths, never floating point", () => {
    const record = normalizeCruxResponse("origin", "https://www.example.com", "PHONE", {
      record: {
        key: { origin: "https://www.example.com", formFactor: "PHONE" },
        metrics: {
          largest_contentful_paint: { percentiles: { p75: 2612 } },
          interaction_to_next_paint: { percentiles: { p75: "175" } },
          cumulative_layout_shift: { percentiles: { p75: "0.05" } },
        },
        collectionPeriod: { firstDate: { year: 2026, month: 9, day: 13 }, lastDate: { year: 2026, month: 10, day: 10 } },
      },
    });
    expect(record).toEqual({
      scope: "origin",
      target: "https://www.example.com",
      form_factor: "PHONE",
      first_date: "2026-09-13",
      last_date: "2026-10-10",
      lcp_p75_ms: 2612,
      inp_p75_ms: 175,
      cls_p75_thousandths: 50,
    });
  });

  it("leaves a missing metric null and an empty record out", () => {
    const partial = normalizeCruxResponse("url", "https://www.example.com/", "DESKTOP", {
      record: { metrics: { largest_contentful_paint: { percentiles: { p75: 900 } } } },
    });
    expect(partial).toMatchObject({ lcp_p75_ms: 900, inp_p75_ms: null, cls_p75_thousandths: null, first_date: "", last_date: "" });
    expect(normalizeCruxResponse("origin", "https://www.example.com", "PHONE", {})).toBeNull();
  });

  it("keys records so the evaluator's unit names the scope and device", () => {
    expect(cruxKey("origin", "https://www.example.com", "PHONE")).toBe("origin|PHONE");
    expect(cruxKey("url", "https://www.example.com/about", "DESKTOP")).toBe("url|DESKTOP|https://www.example.com/about");
  });
});
