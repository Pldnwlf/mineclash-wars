// mineclash #21: Anzeigename im Match. Eingeloggt (JWT mit `name`, kein Gast)
// => immer der MC-Name, kein Clan-Tag, nicht änderbar. Gast/anonym => frei.
import type { TokenPayload } from "@openfront/shared/ApiSchemas";

export function isGuestClaims(claims: TokenPayload | null): boolean {
  return claims?.guest === true;
}

export function mineclashIdentity(
  claims: TokenPayload | null,
  username: string,
  clanTag: string | null,
): { username: string; clanTag: string | null } {
  if (claims?.name && !isGuestClaims(claims)) {
    return { username: claims.name, clanTag: null };
  }
  return { username, clanTag };
}
