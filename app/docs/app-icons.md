# App icon update (v6)

The standalone U is lifted six units in its 100-unit artwork for optical centering. The website header wordmark is unchanged. `prepare-assets.mjs` generates opaque Apple (152/167/180), PWA (192/512), and favicon (16/32) PNGs from that artwork. Metadata and the manifest use new v6 filenames; old immutable filenames are retained so existing installations can finish using their older service worker. Root Apple aliases also contain the new artwork.

New filenames bypass browser and service-worker entries for the old icon URLs. The manifest retains its app ID, scope, and start URL. The normal service-worker activation lifecycle is preserved so an update does not interrupt an open editor.

## Already installed on iPhone

Open Until online in Safari and reload before adding it to the Home Screen. iOS may retain the installed Home Screen bitmap independently of browser caches. If the existing shortcut still shows the old icon, first confirm your account is synced and preserve any unsynced local data, then remove the Home Screen installation and add it again from Safari. Avoid clearing website data solely to refresh the icon: that can remove offline records. Browser viewport checks cannot establish how a particular iOS version refreshes its installed icon; optical placement under the actual Home Screen mask, Safari tab rendering, and refresh after reinstall require device verification.
