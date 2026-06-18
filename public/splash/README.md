# Apple Splash Screens

These PNGs are referenced from `app/layout.tsx` via
`<link rel="apple-touch-startup-image">` tags — iOS Safari uses them
as the splash image while the PWA is launching from the home screen.

**Current files are brand-orange solid placeholders** produced by
`scripts/generate-pwa-assets.mjs`. See `../README-pwa-assets.md` for
the replacement plan.

## Why one PNG per device class?

iOS expects a near-exact viewport match (CSS pixels × pixel ratio).
We ship the five most common iPhone / iPad classes. Devices that
don't match precisely fall back to the closest size.

| File                              | Device                                |
| --------------------------------- | ------------------------------------- |
| `apple-splash-1284-2778.png`      | iPhone 14 Pro Max, 13 Pro Max         |
| `apple-splash-1170-2532.png`      | iPhone 14 Pro, 13 Pro                 |
| `apple-splash-1125-2436.png`      | iPhone X / 11 Pro                     |
| `apple-splash-828-1792.png`       | iPhone 11, XR                         |
| `apple-splash-1640-2360.png`      | iPad Pro 11" portrait                 |

## Regenerating

```sh
node scripts/generate-pwa-assets.mjs
```
