# Galamsey Watch Ghana

A citizen-science pilot by Analem Jacob, inspired by Project Squirrel and the
Citizen Sciences in Landscape Ecology lab at UBC Forestry (MGEM). It explores
how people might record landscape changes that merit follow-up.

## Try the pilot

Requires Node.js 24 or newer. No package installation or API key is needed.

```sh
npm start
```

Open the address printed in your terminal (normally http://127.0.0.1:8080).

1. Wait for **Offline map and form ready** in the footer.
2. Browse the Ghana map, toggle regions, waterways, or examples, and use the
   observation filter. Selecting an example opens its map popup.
3. Disconnect. Reload the site and open **Try a report**. Pick a fictional
   location using the second map or enter decimal coordinates inside Ghana.
4. Save. Reload again and open **Outbox**. Your example should still be there.
5. Reconnect. Select **Sync queued examples**. The local server stores the
   example in SQLite and returns a receipt. The outbox marks it **Synced**.
   Resending the same example ID does not create a second database record.
6. Use **Export GeoJSON** to open the saved examples in QGIS or ArcGIS Pro.
   Coordinates in the export are longitude, then latitude (WGS 84).

The SQLite file is `server/.private/pilot.sqlite` and is ignored by Git. The
local API has no public data-reading endpoint. The site keeps submitted examples
off the public map. Removing an example from the outbox removes its device copy.
Browser storage can be cleared or evicted, so export anything you want to keep.

## Put it on GitHub Pages

Create a dedicated repository (for example, `galamsey-watch-ghana`), commit the
contents of this folder to `main`, then set **Settings → Pages → Deploy from a branch**
to `main` and `/docs`. Use the URL shown in Settings after deployment.
See the [GitHub Pages guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

GitHub Pages serves the map, offline form, local outbox, and GeoJSON export.
The SQLite sync server runs separately on your computer. This release supports
fictional observations only and the server listens on loopback for that trial.

## Files

- `docs/` is the GitHub Pages site, including the offline service worker.
- `docs/data/` contains Ghana region boundaries, surrounding countries,
  reference waterways and lakes, labels, the fictional dataset, and sources.
- `server/` contains the optional local SQLite sync server.
- `docs/vendor/` and `docs/assets/` contain the locally bundled map library and fonts.

For source and dataset attribution, see [SOURCES.txt](docs/data/SOURCES.txt).

## Volunteer mapping

The website includes a separate imagery map for tracing candidate mining pits.
Scroll and pan to a community, draw an outline, and download it as a GeoJSON
polygon. This works without Google sign-in or data storage. Candidate
submissions are private and pending review. Confirm the geometry and imagery
before drawing conclusions about a site. The fictional report dashboard uses
its existing example data.

To activate online sign-in and submissions:

1. Create a Firebase project, register a web app, and enable the Google sign-in
   provider. Add `analemjacob.github.io` to Authentication → Settings →
   Authorized domains.
2. Create a Cloud Firestore database and deploy the supplied rules from this
   repository with `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`.
   These rules allow Google-authenticated contributors to create pending
   submissions. The project operator reviews them in the Firebase console.
   The client accepts only bounded-length candidate payloads and the operator
   should validate submitted geometry before use.
3. Put the Firebase **web app client configuration** in the `firebase` field
   in `docs/volunteer-config.json` and publish the file with the website.
   Use the SDK config object, with JSON-quoted keys. Keep service-account
   credentials out of the website and repository.

The default imagery is EOX Sentinel-2 cloudless (2024). To enable the more
detailed Mapbox Satellite layer for this non-commercial pilot, add a
URL-restricted **public** Mapbox token to `mapboxPublicToken` and set
`enableNoncommercialMapboxTracing` to `true` in the same configuration.
Check source detail on the target communities before tracing. Coverage,
resolution and imagery dates vary. See the
[Mapbox imagery terms and tracing guidance](https://www.mapbox.com/imagery).
