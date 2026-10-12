// mineclash #31: stake match rules text, shared by the rules page and the
// accept popup. All text goes through translateText (keys: "mineclash.*").
import { html, TemplateResult } from "lit";
import { translateText } from "../Utils";
import { buildCommit, sourceCodeUrl, sourceFileUrl } from "./SourceLinks";

// [section key, number of bullet items]
const SECTIONS: ReadonlyArray<readonly [string, number]> = [
  ["stake", 3],
  ["win", 4],
  ["refund", 2],
  ["disconnect", 1],
  ["fair", 5],
];

export function renderRules(): TemplateResult {
  return html`${SECTIONS.map(
    ([key, count]) => html`
      <h3 class="text-lg font-semibold text-blue-100 mt-5 mb-2">
        ${translateText(`mineclash.${key}_title`)}
      </h3>
      <ul class="list-disc pl-5 space-y-1 text-gray-300 leading-relaxed">
        ${Array.from(
          { length: count },
          (_, i) =>
            html`<li>${translateText(`mineclash.${key}_${i + 1}`)}</li>`,
        )}
      </ul>
    `,
  )}`;
}

/** Source code (AGPL §13), licenses, credits, terms, privacy. */
export function renderLegalLinks(): TemplateResult {
  const commit = buildCommit();
  const link = (href: string, key: string, external = true) =>
    html`<a
      href=${href}
      target=${external ? "_blank" : "_self"}
      rel="noopener noreferrer"
      class="text-blue-400 hover:text-blue-300 underline"
      >${translateText(key)}</a
    >`;
  return html`<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
    ${link(sourceCodeUrl(commit), "mineclash.link_source")}
    ${link(sourceFileUrl("LICENSE", commit), "mineclash.link_license")}
    ${link(
      sourceFileUrl("LICENSE-ASSETS", commit),
      "mineclash.link_license_assets",
    )}
    ${link(sourceFileUrl("LICENSING.md", commit), "mineclash.link_licensing")}
    ${link("#modal=credits", "mineclash.link_credits", false)}
    ${link("/terms-of-service.html", "mineclash.link_terms")}
    ${link("/privacy-policy.html", "mineclash.link_privacy")}
  </div>`;
}
