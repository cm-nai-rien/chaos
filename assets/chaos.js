/* ==========================================================================
   Shared helpers for every page: Movies, Books, Chronology, Home.
   - Chaos.esc(text)          escape text before it goes into innerHTML
   - Chaos.thumb(url, width)  ask image hosts for a small copy, not the original
   - Chaos.github.update()    read → change → write one JSON file in the repo
   - Chaos.notes              the note editor used on all three list pages
   Needs admin-auth.js (for the saved sign-in) to be loaded first.
   ========================================================================== */
(function () {
    const REPO = 'cm-nai-rien/chaos';
    const FILES = { movies: 'movies/movies.json', books: 'books/books.json' };

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Google Books' zoom=0 covers are ~3000px wide; fife=wN asks for N px instead
    function thumb(url, w = 300) {
        if (!url) return url;
        if (url.includes('books.google.com/books/content')) {
            return url.replace(/&fife=[^&]*/, '') + `&fife=w${w}`;
        }
        // Amazon/Goodreads: add a size tag before the extension, e.g. 123._SX300_.jpg
        if (url.includes('media-amazon.com/images/')) {
            return url.replace(/\._[A-Z]{2}\d+_(?=\.\w+$)/, '').replace(/\.(jpe?g|png|webp)$/i, `._SX${w}_.$1`);
        }
        if (url.includes('covers.openlibrary.org') && w <= 200) return url.replace(/-L\.jpg$/, '-M.jpg');
        if (url.includes('image.tmdb.org/t/p/')) {
            const size = w <= 92 ? 'w92' : w <= 185 ? 'w185' : w <= 342 ? 'w342' : 'w500';
            return url.replace(/\/t\/p\/w\d+\//, `/t/p/${size}/`);
        }
        return url;
    }

    /* ---------- GitHub: read a JSON file, change it, write it back ---------- */
    const decode = b64 => new TextDecoder('utf-8').decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0)));
    // same layout as the files already use (4 spaces, keep or skip the final newline)
    const encode = (obj, endNewline) => {
        const bytes = new TextEncoder().encode(JSON.stringify(obj, null, 4) + (endNewline ? '\n' : ''));
        let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
        return btoa(bin);
    };
    // mutate(data) changes the parsed file in place and returns false to cancel
    async function update(path, mutate, message) {
        const token = window.ChaosAuth && ChaosAuth.token();
        if (!token) throw new Error('Sign in on the Admin Portal first.');
        const api = `https://api.github.com/repos/${REPO}/contents/${path}`;
        const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };
        for (let attempt = 0; attempt < 2; attempt++) {
            const get = await fetch(api, { headers, cache: 'no-store' });
            if (get.status === 401) { ChaosAuth.expire(); throw new Error('Your sign-in has expired. Sign in again on the Admin Portal.'); }
            if (!get.ok) throw new Error(`Could not read the file from GitHub (${get.status}).`);
            const file = await get.json();
            const raw = decode(file.content), data = JSON.parse(raw);
            if (mutate(data) === false) throw new Error('This item is no longer in the file.');
            const put = await fetch(api, {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, content: encode(data, raw.endsWith('\n')), sha: file.sha })
            });
            if (put.ok) return data;
            if (put.status === 409 && attempt === 0) continue;   // someone saved in between: retry on the new version
            const err = await put.json().catch(() => ({}));
            throw new Error(err.message || `GitHub did not save (${put.status}).`);
        }
    }

    /* ---------- notes ---------- */
    // Which log entry a note belongs to
    const keyOf = (kind, item) => kind === 'movies' ? `movies|${item.title}|${item.date_sort}` : `books|${item.title}`;
    const sameItem = (kind, a, b) => a.title === b.title && (kind === 'books' || a.date_sort === b.date_sort);
    // notes imported from Goodreads carry <br/> tags: show them as line breaks, drop any other tag
    const plain = t => (!t || t === 'nan') ? '' : String(t).replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[a-z][^>]*>/gi, '').trim();
    const clean = plain;

    // GitHub Pages takes about a minute to publish a save. Until it has, this browser
    // remembers the new note so all three pages show it right away.
    const PENDING = 'chaosPendingNotes';
    const readPending = () => { try { return JSON.parse(localStorage.getItem(PENDING) || '{}'); } catch (e) { return {}; } };
    const writePending = p => { try { localStorage.setItem(PENDING, JSON.stringify(p)); } catch (e) {} };

    function applyPending(kind, items) {
        const p = readPending(); let changed = false;
        Object.entries(p).forEach(([k, v]) => {
            if (!k.startsWith(kind + '|')) return;
            const item = items.find(i => keyOf(kind, i) === k);
            // published (or too old to matter): forget it
            if (!item || clean(item.review) === clean(v.review) || Date.now() - v.at > 864e5) { delete p[k]; changed = true; return; }
            item.review = v.review;
        });
        if (changed) writePending(p);
        return items;
    }

    async function saveNote(kind, item, review) {
        await update(FILES[kind], data => {
            const target = data.find(i => sameItem(kind, i, item));
            if (!target) return false;
            target.review = review;
        }, `Edit note: ${item.title}`);
        const p = readPending(); p[keyOf(kind, item)] = { review, at: Date.now() }; writePending(p);
        item.review = review;
    }

    /* The editor. The page keeps its own look for the note text (render),
       this adds the Edit button and the editing box underneath.
       opts: { host, kind, item, render(review), onSaved?(review) } */
    function attach({ host, kind, item, render, onSaved }) {
        const signedIn = !!(window.ChaosAuth && ChaosAuth.token());
        render(clean(item.review));
        if (!signedIn) return;

        const wrap = document.createElement('div');
        wrap.className = 'note-editor';
        wrap.innerHTML = `
            <button type="button" class="note-btn note-open">${clean(item.review) ? 'Edit note' : 'Add a note'}</button>
            <div class="note-form" hidden>
                <textarea rows="5" placeholder="What did you think?"></textarea>
                <div class="note-actions">
                    <button type="button" class="note-btn note-save">Save</button>
                    <button type="button" class="note-btn note-cancel">Cancel</button>
                    <span class="note-status" role="status"></span>
                </div>
            </div>`;
        host.appendChild(wrap);
        const $ = s => wrap.querySelector(s);
        const open = $('.note-open'), form = $('.note-form'), box = $('textarea'), status = $('.note-status');

        open.onclick = () => { box.value = clean(item.review); form.hidden = false; open.hidden = true; status.textContent = ''; box.focus(); };
        $('.note-cancel').onclick = () => { form.hidden = true; open.hidden = false; };
        box.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('.note-save').click(); });
        $('.note-save').onclick = async () => {
            const review = box.value.trim();
            const btn = $('.note-save');
            btn.disabled = true; status.textContent = 'Saving…';
            try {
                await saveNote(kind, item, review);
                render(review);
                status.textContent = 'Saved';
                open.textContent = review ? 'Edit note' : 'Add a note';
                setTimeout(() => { form.hidden = true; open.hidden = false; status.textContent = ''; }, 700);
                onSaved && onSaved(review);
            } catch (e) {
                status.textContent = e.message;
            } finally {
                btn.disabled = false;
            }
        };
    }

    window.Chaos = { esc, thumb, plain, github: { update, files: FILES }, notes: { attach, applyPending, keyOf } };
})();
