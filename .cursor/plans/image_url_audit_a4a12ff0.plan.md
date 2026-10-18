---
name: Image URL audit
overview: A repo-wide search shows the recipe `Image` bug (blind `http`→`https`) was the main instance of that pattern. Other image flows use different mechanisms (auth fetch, ngrok-only upgrades, or external URLs). Optional follow-up is to generalize the helper if new API fields return Django `/media/` URLs.
todos:
  - id: optional-rename-util
    content: "Optional: rename/document resolveRecipeImageUrl as shared API-media helper for future serializers"
    status: pending
  - id: optional-legacy-chat
    content: "Optional: confirm app routing does not use mobile/screens/chat/[roomId].tsx; align or remove if dead"
    status: pending
isProject: false
---

# Image / media URL patterns (post-recipe fix)

## What went wrong with recipes (fixed)

`[RecipeCard.tsx](mobile/components/meals/RecipeCard.tsx)` and `[RecipeDetail.tsx](mobile/components/meals/RecipeDetail.tsx)` used to rewrite **every** `http://` image URL to `https://`. That breaks `**http://localhost:8900/media/...`** (no TLS on `runserver`) and can break **LAN** API hosts. The fix is centralized in `[recipeImageUrl.ts](mobile/utils/recipeImageUrl.ts)` as `resolveRecipeImageUrl()`.

## Search results: no identical pattern elsewhere

Grep for `replace('http://', 'https://')` (and similar) under `mobile/` finds:


| Location                                                                                 | Behavior                                          | Risk                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| `[AuthenticatedImage.tsx](mobile/components/AuthenticatedImage.tsx)`                     | Upgrades **only** URLs containing `**ngrok.app`** | Intentional; does **not** touch localhost/LAN |
| `[api/serializers.py` `UserProfileSerializer.get_photo_url](backend/api/serializers.py)` | Same **ngrok-only** `http`→`https`                | Scoped                                        |
| `[recipeImageUrl.ts](mobile/utils/recipeImageUrl.ts)`                                    | Loopback/LAN vs public rules                      | Correct intentional logic                     |


No other components duplicate the old “always upgrade recipe image” behavior.

## How other images work (different class)

- **Profile / nav avatar / chat avatars** use `[AuthenticatedImage](mobile/components/AuthenticatedImage.tsx)`: **axios + Bearer token**, then blob/base64—**not** a raw `<img src>` to `/media/`. URLs come from `build_absolute_uri('/api/users/.../photo/')`, not from `RecipeSerializer`-style `/media/` paths.
- **GIFs / external URLs** in chat use raw `Image` with **decrypted** or remote URLs—typically **already https** (e.g. Giphy); not Django media.
- `**[profile.tsx` `getPhotoUrl](mobile/app/(tabs)/profile.tsx)`** only adds cache-busting; it does **not** force `https`.

So the **same root cause** (Django returns `http://localhost:8900/media/...` + client forces `https`) does not appear elsewhere in the same form.

## Optional follow-ups (only if you want hardening)

1. **Rename / generalize** `[resolveRecipeImageUrl](mobile/utils/recipeImageUrl.ts)` to something like `resolveApiMediaImageUrl` and document that **any future serializer** that returns absolute `/media/` URLs (built from `request`) should use this helper in the UI—**single place** for the rules.
2. **Legacy screen** `[mobile/screens/chat/[roomId].tsx](mobile/screens/chat/[roomId].tsx)` still uses raw `Image` for `sender_photo_url`. If that route is ever used on **HTTPS** with an `**http://`** photo URL, browsers could block **mixed content**. The primary app route is `[app/(tabs)/chat/[roomId].tsx](mobile/app/(tabs)`/chat/[roomId].tsx), which uses `AuthenticatedImage`. Low priority unless you still ship the `screens/` copy.
3. **Operations** (not a duplicate code bug): `[config/urls.py](backend/config/urls.py)` only serves `**/media/`** when `**DEBUG=True**`. If recipe images ever “vanish” in production, that’s a deployment/`DEBUG`/reverse-proxy issue, not the client `http`/`https` normalization.

## Conclusion

**No further instances** of the same recipe-specific bug were found. The only related client logic is **ngrok-scoped** upgrades in `AuthenticatedImage` and `UserProfileSerializer`, which are narrower and appropriate. Optional work is generalizing the media URL helper for future features and pruning or aligning the legacy chat screen if it’s still reachable.