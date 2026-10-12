import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { composeVersionDisplay, desktopVersion } from "../DesktopShell";
import { currentGameVersion } from "../GameVersion";
import {
  buildCommit,
  sourceCodeUrl,
  sourceFileUrl,
} from "../mineclash/SourceLinks";

@customElement("page-footer")
export class Footer extends LitElement {
  // Per instance, not at module scope: currentGameVersion reads
  // BOOTSTRAP_CONFIG, which the server injects into the page and which is not
  // guaranteed to exist at the moment this module is first imported.
  private readonly gameVersion = currentGameVersion();

  // Starts as the game version alone and gains the shell version once the
  // bridge answers, so the line is never blank while that call is in flight.
  @state() private versionLabel = this.gameVersion;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // desktopVersion() resolves null off the desktop shell and on its own
    // timeout, so this can only ever leave the label as-is or extend it.
    void desktopVersion().then((shellVersion) => {
      this.versionLabel = composeVersionDisplay(this.gameVersion, shellVersion);
    });
  }

  // mineclash #19: one slim bar (FrontWars layout); #31: AGPL §13 source
  // offer, licenses, credits, rules stay on the left.
  render() {
    const link = "hover:text-white transition-colors";
    return html`
      <footer
        class="[.in-game_&]:hidden relative z-50 flex w-full shrink-0 flex-col items-center gap-2 border-t border-white/10 bg-black/40 px-6 py-2 text-[13px] text-white/50 backdrop-blur-md lg:flex-row lg:justify-between"
      >
        <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
          <a
            href=${sourceCodeUrl(buildCommit())}
            data-i18n="mineclash.link_source"
            target="_blank"
            rel="noopener noreferrer"
            class=${link}
          ></a>
          <a
            href=${sourceFileUrl("LICENSE", buildCommit())}
            data-i18n="mineclash.link_license"
            target="_blank"
            rel="noopener noreferrer"
            class=${link}
          ></a>
          <a
            href=${sourceFileUrl("LICENSE-ASSETS", buildCommit())}
            data-i18n="mineclash.link_license_assets"
            target="_blank"
            rel="noopener noreferrer"
            class=${link}
          ></a>
          <a
            href=${sourceFileUrl("LICENSING.md", buildCommit())}
            data-i18n="mineclash.link_licensing"
            target="_blank"
            rel="noopener noreferrer"
            class=${link}
          ></a>
          <a
            href="#modal=credits"
            data-i18n="mineclash.link_credits"
            class=${link}
          ></a>
          <a
            href="#modal=rules"
            data-i18n="mineclash.link_rules"
            class=${link}
          ></a>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
          <span class="footer-version">${this.versionLabel}</span>
          <span data-i18n="main.copyright"></span>
          <a
            href="/privacy-policy.html"
            data-i18n="main.privacy_policy"
            target="_blank"
            class=${link}
          ></a>
          <a
            href="/terms-of-service.html"
            data-i18n="main.terms_of_service"
            target="_blank"
            class=${link}
          ></a>
          <!-- Single instance: translateText() resolves the active language via
               document.querySelector("lang-selector"), so a second one would
               shadow it. -->
          <lang-selector
            class="[&_button]:size-9 [&_img]:size-8"
          ></lang-selector>
        </div>
      </footer>
    `;
  }
}
