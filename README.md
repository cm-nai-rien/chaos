# Chao's Lists

Personal movie and book logs, served at https://cm-nai-rien.github.io/chaos/

```
index.html            Home page linking both lists
assets/theme.css      Design system: palettes, fonts, Movies | Books switch
assets/list.css       Shared components for the two list pages
assets/admin.css      Shared styles for the two admin pages
movies/               Movie list, analytics, admin, movies.json
books/                Book list, analytics, admin, books.json, covers/
```

## Design system

Each page sets its palette with `data-site="movies"` or `data-site="books"` on `<html>`.
Shared rules use role tokens from `theme.css` (`--c-deep`, `--c-accent`, `--c-ink`, …),
so changing a font or component once updates both sites, while each keeps its own colors.

## Adding entries

Use the admin pages (`/movies/admin.html`, `/books/admin.html`). Log in once with a
fine-grained GitHub token that has **Contents: Read & Write** on this repo; the token is
shared between both admin pages for the browser tab.

## Local preview

```
python3 -m http.server 8080
```

Then open http://localhost:8080. Links are relative, so the site works at any path
(it is served under `/chaos/` on GitHub Pages).

History from the old `MovieSite` and `BookSite` repos is kept in this repo's git log.
