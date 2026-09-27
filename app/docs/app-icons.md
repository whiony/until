# App icon update (v7)

The standalone U is lifted three units in its 100-unit artwork, halfway between the low v5 letter and the high v6 letter. Optical placement was compared at Home Screen (60px) and browser-tab (16/32px) sizes, rather than judged solely by its bounding box. The website header wordmark is unchanged. `prepare-assets.mjs` generates opaque Apple (152/167/180), PWA (192/512), and favicon (16/32) PNGs from that artwork. Metadata and the manifest use new v7 filenames; old immutable filenames are retained so existing installations can finish using their older service worker. Root Apple aliases also contain the new artwork.

New filenames bypass browser and service-worker entries for the old icon URLs. The manifest retains its app ID, scope, and start URL. The normal service-worker activation lifecycle is preserved so an update does not interrupt an open editor.

## Already installed on iPhone

Open Until online in Safari and reload before adding it to the Home Screen. iOS may retain the installed Home Screen bitmap independently of browser caches. If the existing shortcut still shows the old icon, first confirm your account is synced and preserve any unsynced local data, then remove the Home Screen installation and add it again from Safari. Avoid clearing website data solely to refresh the icon: that can remove offline records. Browser viewport checks cannot establish how a particular iOS version refreshes its installed icon; optical placement under the actual Home Screen mask, Safari tab rendering, and refresh after reinstall require device verification.
