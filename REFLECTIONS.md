# NASA Space Explorer — Project 7 reflections

**Reflection draft:** These answers describe the completed project. Review the first-person wording before submitting.

## 1. Paste your website's URL

**GitHub Pages URL:** <https://33misha.github.io/07-nasa-space-explorer/>

**Deployment status:** Published and verified on November 6, 2026 in a fresh incognito browser. The public site loaded nine real images, opened the full-size image modal, and displayed the video entry in the January 1–9, 2025 range.

## 1B. Did you do any of the LevelUps?

Yes. This project includes all three:

- **APOD video entries:** Video days remain in the nine-day gallery, with a video preview or fallback and a clear link to watch the content.
- **Random space fact:** A “Did You Know?” section selects a fact randomly when the page loads.
- **Hover zoom:** Gallery images scale smoothly on hover. Reduced-motion preferences are respected.

## 2. Working with a real API

> Reflect on your experience working with a real API. What was it like using NASA's APOD API in your project? What challenges did you face when trying to connect, fetch data, or handle the results?

Working with NASA's APOD API turns this app from a static page into something that responds to real information. The dates a visitor chooses become request parameters, and the returned objects supply the gallery's titles, dates, media, and explanations. One lesson is that fetching data and displaying useful data are separate jobs. A response must be checked before it can be trusted to represent the selected window.

The nine-day requirement makes that especially clear. The start and end dates are inclusive, so they must be eight calendar days apart. Using calendar dates also avoids introducing an off-by-one error around daylight saving changes. After the request finishes, the app checks that the expected dates are actually present instead of treating any array as a complete gallery. A day that NASA has not published yet needs an understandable message, not a silent eight-card result.

Another challenge is that APOD is not a uniform collection of image files. Some days are videos, image fields can differ, and an entry may point to a NASA article. An upstream migration also caused the legacy API to return generic NASA logo records with the title “NASA Science.” The implementation detects that incorrect content and requests the same window from NASA Science's official APOD endpoint. Loading, network failure, API-key errors, and quota limits also need clear feedback. I used AI assistance to help implement and review these cases, while keeping the app's behavior tied to the assignment and the API's actual fields. This project shows why a dependable API app needs validation and recovery as well as a successful fetch.

## 3. Debugging interview plan

> Write up a plan for how you will answer the following interview question: “How do you approach debugging when something doesn't work as expected?” Think about a time in this project when something didn't work—maybe your API data wasn't displaying, or a feature broke. How did you figure out what was wrong and fix it?

My answer would start with a repeatable process: reproduce the problem, state the expected result, inspect the evidence, isolate the cause, make a focused change, and check the result. I would use the browser's Console to find JavaScript errors and the Network panel to see whether a request was sent, which parameters it used, and what NASA returned. This separates a broken click handler from a failed request or a rendering problem.

A concrete example from this project's development is an upstream response that looked successful but contained the wrong content. The legacy APOD endpoint returned nine records titled “NASA Science,” pointing to a NASA logo. Counting the items alone would have passed the gallery check. Comparing the response titles and media URLs with the requested astronomy content exposed the real problem: an upstream migration, rather than a CSS or card-rendering defect. The implementation detects those generic records and requests the same dates from NASA Science's official APOD endpoint. Development checks confirmed that endpoint could return nine real entries, including a video in a historical window.

I would then check a normal historical range and deliberately test the boundaries: an invalid range, a video day, an incomplete response, and a failed request. For an eight-card result, I would compare requested dates with returned dates before changing layout code. After a fix, I would repeat the original reproduction and one nearby case to look for regressions. In an interview, I would distinguish development checks performed with AI assistance from checks I personally ran, and describe only results I can explain from the evidence.

## 4. LinkedIn post draft

> Draft a short LinkedIn post reflecting on what you built and learned this week. You might share what it was like building a project that connects to a real NASA data source, what surprised you about working with APIs, or how AI supported your process. Consider adding a link or image of your project to help it stand out.

I built a NASA Space Explorer using HTML, CSS, and JavaScript! The app connects to NASA's Astronomy Picture of the Day API and turns a selected nine-day window into a gallery of space images and videos. Each entry opens a detailed view with its title, date, and explanation.

One lesson from this project: a successful API request is only the beginning. Date boundaries, different media types, loading states, missing data, and quota limits all affect whether an app feels reliable. I also added a random space fact and smooth image zoom, with keyboard access and responsive layouts in mind.

I used AI assistance to support the implementation and review process. The project gave me a concrete way to connect API data, DOM updates, CSS, and debugging decisions in one application.

Project link: https://33misha.github.io/07-nasa-space-explorer/

#WebDevelopment #JavaScript #NASA #APIs #LearningInPublic

---

## Before submitting

1. Review and personalize the reflection drafts.
2. If you change the answers, update `submission.html` and print it to PDF again.
3. Upload `submission.pdf` to the Project 7 submission page on HQ. The website is already published and verified.

The assignment awards credit for the LinkedIn draft; actually publishing it is optional.
