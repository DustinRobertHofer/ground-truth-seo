import type { RuleEvaluator } from "../findings.js";
import { AI_EVALUATORS } from "./ai.js";
import { CANONICAL_EVALUATORS } from "./canonical.js";
import { HEAD_EVALUATORS } from "./head.js";
import { HTTP_EVALUATORS } from "./http.js";
import { I18N_EVALUATORS } from "./i18n.js";
import { IMAGE_EVALUATORS } from "./images.js";
import { INDEXING_EVALUATORS } from "./indexing.js";
import { JAVASCRIPT_EVALUATORS } from "./javascript.js";
import { LINK_EVALUATORS } from "./links.js";
import { PERFORMANCE_EVALUATORS } from "./performance.js";
import { REDIRECT_EVALUATORS } from "./redirects.js";
import { ROBOTS_EVALUATORS } from "./robots.js";
import { SITEMAP_EVALUATORS } from "./sitemaps.js";
import { STRUCTURED_DATA_EVALUATORS } from "./structured-data.js";
import { TOOLING_EVALUATORS } from "./tooling.js";
import { URL_EVALUATORS } from "./urls.js";

export const EVALUATORS: Record<string, RuleEvaluator> = {
  ...HTTP_EVALUATORS,
  ...URL_EVALUATORS,
  ...ROBOTS_EVALUATORS,
  ...INDEXING_EVALUATORS,
  ...HEAD_EVALUATORS,
  ...CANONICAL_EVALUATORS,
  ...SITEMAP_EVALUATORS,
  ...LINK_EVALUATORS,
  ...IMAGE_EVALUATORS,
  ...STRUCTURED_DATA_EVALUATORS,
  ...I18N_EVALUATORS,
  ...REDIRECT_EVALUATORS,
  ...PERFORMANCE_EVALUATORS,
  ...JAVASCRIPT_EVALUATORS,
  ...AI_EVALUATORS,
  ...TOOLING_EVALUATORS,
};
