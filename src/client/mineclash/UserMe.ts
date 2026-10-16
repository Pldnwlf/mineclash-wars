// mineclash #21: /users/@me ist Server-zu-Server (MineclashApi.ts). Der Client
// baut sein Profil aus dem JWT: MC-Name (fix im Match) = "verifizierter" Name,
// Gäste haben keinen und spielen unter frei gewähltem Namen.
import {
  TokenPayload,
  UserMeResponse,
  UserMeResponseSchema,
} from "@openfront/shared/ApiSchemas";

export function userMeFromClaims(claims: TokenPayload): UserMeResponse {
  const name = claims.guest ? null : (claims.name ?? null);
  // parse füllt Schema-Defaults (wie minimalUserMe auf dem Server).
  return UserMeResponseSchema.parse({
    user: {},
    player: {
      publicId: claims.sub.slice(0, 8),
      adfree: false,
      unlimitedRanked: false,
      canCreatePublicLobbies: true,
      flares: [],
      achievements: { singleplayerMap: [] },
      friends: [],
      subscription: null,
      username: name,
      usernameBase: name,
      usernameStatus: name ? "indefinite" : undefined,
    },
  });
}
