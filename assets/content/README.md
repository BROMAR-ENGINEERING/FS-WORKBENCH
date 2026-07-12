# Content images

Figures used by information sections. Reference them with a relative path from the app root:

    <img src="assets/content/category-3-architecture.png">

`<img src>` works from `file://`; `fetch()` does not. User-supplied images live in the
BroSafe **data folder** under `assets/` and are referenced the same way.
