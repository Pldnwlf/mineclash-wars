import fs from "fs";
import path from "path";
import {
  sourceCodeUrl,
  sourceFileUrl,
  sourceRef,
} from "../../src/client/mineclash/SourceLinks";

const root = path.join(__dirname, "..", "..");
const sha = "1807517a7d1c2e3f4a5b6c7d8e9f001122334455";

describe("source links (#31)", () => {
  it("links the build commit when known", () => {
    expect(sourceCodeUrl(sha)).toBe(
      `https://github.com/Pldnwlf/mineclash-wars/tree/${sha}`,
    );
    expect(sourceFileUrl("LICENSE", sha)).toContain(`/blob/${sha}/LICENSE`);
  });

  it("falls back to the release branch", () => {
    for (const c of ["", "DEV", "unknown", "desktop"]) {
      expect(sourceRef(c)).toBe("release");
    }
  });

  it("every rules key exists in en and de", () => {
    const keys = ["stake", "win", "refund", "disconnect", "fair"];
    for (const lang of ["en", "de"]) {
      const j = JSON.parse(
        fs.readFileSync(
          path.join(root, "resources/lang", `${lang}.json`),
          "utf8",
        ),
      );
      for (const k of keys) {
        expect(j.mineclash[`${k}_title`]).toBeTruthy();
        expect(j.mineclash[`${k}_1`]).toBeTruthy();
      }
      expect(j.mineclash.accept).toBeTruthy();
    }
  });

  it("legal pages are ours, not OpenFront's", () => {
    for (const f of ["privacy-policy.html", "terms-of-service.html"]) {
      const s = fs.readFileSync(path.join(root, "resources/public", f), "utf8");
      expect(s).not.toMatch(/openfront\.io/i);
      expect(s).toContain("PLATZHALTER");
    }
  });
});
