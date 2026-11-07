# NASA Space Explorer

A responsive Astronomy Picture of the Day (APOD) explorer built with HTML, CSS, and vanilla JavaScript. Choose a nine-day window, discover NASA's daily images and videos, and open an entry to read its full explanation.

This is an educational project using NASA's public data. It is not an official NASA application.

## Run locally

There are no application dependencies, build steps, or accounts required to open the app. Serve this folder with a static web server; for example:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>. VS Code's Live Server extension is another option. If Python is installed under a versioned path on Windows, use its full executable path instead of `python`.

An internet connection is required for live APOD data and its media. The app does not substitute sample images when a request fails.

## Explore the archive

1. Open the app to see a random “Did You Know?” fact and the latest nine-day date window.
2. Change either date to move the window; the other date automatically stays eight days away. Select **Get Space Images** to load it. The app requires exactly nine consecutive calendar days, including both endpoints. A start date of January 1 corresponds to an end date of January 9.
3. Select any gallery card to open the large image or video view with its title, date, and explanation.
4. Close the modal with its close control, the Escape key, or the backdrop.

APOD's archive starts on **June 16, 1995**. Future dates and incomplete nine-day windows are not valid. Dates are handled as calendar dates so daylight saving changes do not shorten or lengthen the selection. NASA's publication day is interpreted in the U.S. Eastern time zone. If NASA has not yet published one of the requested days, the app explains the incomplete response rather than silently displaying fewer than nine entries. Try an earlier complete window.

## API access

The app requests the [NASA APOD API](https://api.nasa.gov/#apod) with `start_date`, `end_date`, and `thumbs=true`, plus a valid `api_key`. The bundled default is NASA's public `DEMO_KEY`, so no personal key is required to begin.

The public demo key has a shared, restricted quota. If NASA reports a rate limit, wait before retrying or obtain a free personal key from [NASA's API portal](https://api.nasa.gov/). Use the app's optional API-key setting to save your key in this browser's `localStorage`; it is not written into the source code or committed to Git. Save an empty key to return to `DEMO_KEY`. Clearing browser storage also removes the saved key. The app can still use the demo key if browser storage is unavailable.

This is a client-side project: a supplied key is visible to that browser and is sent to NASA when fetching data. Do not enter a key that must be kept secret. The app handles failed requests with an actionable message and restores the controls for retrying.

API entries may contain image URLs, video URLs, thumbnails, or NASA article links. The app uses available image fields for pictures, provides access to videos, and safely renders explanation text. It validates that the returned dates cover the requested nine-day window before replacing the gallery.

NASA's migration can also make the legacy API return generic “NASA Science” logo records instead of the requested astronomy entries. The app detects that response and requests the same window from NASA Science's official `apod-basic` endpoint at `https://science.nasa.gov/wp-json/wp/v2/apod-basic`. That fallback remains a live NASA data source; it does not use fixtures or sample cards. See the [NASA APOD API repository](https://github.com/nasa/apod-api) for the upstream service.

## Rubric coverage

| Criterion | Implementation |
| --- | --- |
| Fetch correct data | NASA APOD request with a valid key; validates nine consecutive selected dates. |
| Display the gallery | Nine cards created from API data, each with a visual, title, and date. |
| Modal view | Large image or video view, full title, date, and explanation; several ways to close. |
| NASA branding | Provided NASA logo, NASA-inspired blue/red palette, clear typography, consistent controls. |
| Loading message | Visible loading status while the request is pending; removed after success or failure. |
| LevelUp: video entries | Video entries stay in the nine-day gallery and have an accessible way to watch. |
| LevelUp: random space fact | A random fact appears in the “Did you know?” section on page load. |
| LevelUp: hover zoom | Smooth CSS scaling on gallery images, respecting reduced-motion preferences. |
| Reflection: APIs | Substantive answer in [REFLECTIONS.md](REFLECTIONS.md) and the printable submission. |
| Reflection: debugging | Concrete debugging plan and project example in the reflection document. |
| Reflection: LinkedIn | A prepared post describing the app, API lessons, and AI support. |

The reflections are prepared drafts to review and personalize before submission.

## Accessibility and layout

- Labeled date controls, native buttons, visible keyboard focus, and readable status/error messages.
- Keyboard-operable gallery and modal, Escape dismissal, and focus returned after closing.
- Responsive gallery layout for phones, tablets, and desktops.
- Descriptive image text and video links; reduced-motion support for animated effects.

## Project files

```text
index.html       Page structure, filters, gallery, and modal
style.css        NASA-inspired styling and responsive layout
js/dateRange.js  Original starter date helper (preserved)
js/script.js     Application behavior, fetching, validation, rendering, and facts
img/             Provided NASA branding assets
REFLECTIONS.md   Written assignment answers and submission notes
submission.html  Standalone printable version of the written answers
tests/           Browser automation and its dependency-free helper
```

All custom application JavaScript stays in `js/script.js`, as requested by the starter README and assignment.

## Verification checklist

Automated browser checks require **Node.js 22 or later** and an installed **Chrome or Edge**. No npm dependency installation is required. Run:

```sh
npm test
```

If the browser is installed in a nonstandard location, set `CHROME_PATH` to its executable before running the command. The tests use controlled API responses for repeatable behavior; a live-data check is still useful for detecting upstream API changes.

Use browser DevTools and test both live API responses and controlled failure cases. A checklist describes what to verify; checked results should be recorded only after running the checks.

Verified on November 6, 2026: all 13 automated browser tests passed. A separate live browser check loaded all nine current images, opened a full-size image with its explanation, and displayed the video entry in the January 1–9, 2025 window. No JavaScript exceptions occurred. Phone, tablet, and desktop layouts were checked for horizontal overflow.

- A complete historical window returns exactly nine cards with matching dates, titles, and visuals.
- Changing the selection and submitting replaces the previous gallery.
- Both ends of the allowed archive range, month/year boundaries, and daylight saving changes preserve nine calendar days.
- Empty fields, a reversed range, a short/long range, and future dates produce helpful validation.
- A delayed request shows the loading message; success and errors both remove it and re-enable controls.
- Image cards open a modal containing the large image and all metadata.
- Video entries have a usable preview or fallback and a working video link.
- Close control, Escape, backdrop dismissal, keyboard navigation, and restored focus work.
- Network failure, invalid-key/rate-limit responses, incomplete results, and broken media remain understandable.
- At narrow phone, tablet, and desktop widths, the layout has no horizontal overflow.
- A random fact appears on load; hover zoom works and respects reduced-motion settings.
- Browser console has no unexpected errors during the normal workflow.

## Publish with GitHub Pages

The assignment asks for a public GitHub Pages link. The expected address for this repository is:

**<https://33misha.github.io/07-nasa-space-explorer/>**

This is an **expected URL until deployment is verified**. A URL written in the documentation does not establish that the site is live.

1. Commit the finished project and push it to the repository's `main` branch.
2. In the GitHub repository, open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select **main** and **/(root)**, then save.
5. Wait for the Pages deployment to finish, and open the public URL GitHub displays.
6. Open that same URL in a private/incognito window. Verify the page, nine-item gallery, and modal without signing in.

Use the live Pages URL in the assignment, rather than the repository or Codespace address. If the repository name or owner differs, use the actual URL shown by GitHub Pages.

## Written submission

Review and personalize [REFLECTIONS.md](REFLECTIONS.md). Open [submission.html](submission.html) in a browser, update the deployment status after verifying the live site, and print to PDF using the browser's print dialog. The document includes print styles and the required answers.

Upload the completed PDF to the project's submission page on HQ. A LinkedIn post is optional; the written draft is included for the reflection requirement. This repository does not post to LinkedIn or upload coursework automatically.

## Sources

- [NASA APOD API documentation](https://api.nasa.gov/#apod)
- [Astronomy Picture of the Day](https://science.nasa.gov/apod/)
- [NASA brand guidelines](https://www.nasa.gov/nasa-brand-center/brand-guidelines/)
- [NASA Web Design System colors](https://nasa.github.io/nasawds-site/components/colors/)

Astronomy media may carry individual copyright credits. Refer to the credit shown with each APOD entry and its NASA source before reusing it.
