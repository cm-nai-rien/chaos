/* ==========================================================================
   Admin sign-in, shared by movies/admin.html and books/admin.html
   - The GitHub token is the only credential. The login is a real <form>
     with a username + password field, so the browser's password manager
     offers to save it (and can require Touch ID before filling it in).
   - After a successful sign-in the token is remembered in this browser for
     30 days, across both admin pages. Then it asks again.
   ========================================================================== */
(function () {
    const KEY = 'chaosAdminSession';
    const DAYS = 30;
    const REPO = 'cm-nai-rien/chaos';

    const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
    const write = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) {} };

    // Pasted keys can carry invisible or full-width characters; keep plain visible ASCII only
    const clean = raw => (raw || '').normalize('NFKC').replace(/[^\x21-\x7E]/g, '');

    function session() {
        // carry over a token from the old per-tab login
        try {
            const old = sessionStorage.getItem('adminToken');
            if (old && !read()) write({ token: old, expires: Date.now() + DAYS * 864e5 });
            sessionStorage.removeItem('adminToken');
        } catch (e) {}
        const s = read();
        if (!s || !s.token || Date.now() > s.expires) { write(null); return null; }
        return s;
    }

    // Ask GitHub whether this token can write to the repo
    async function verify(token) {
        const res = await fetch(`https://api.github.com/repos/${REPO}`, {
            headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' }
        });
        if (res.status === 401) return 'GitHub did not accept this token. It may have expired or been copied incompletely.';
        if (res.status === 404) return 'This token cannot see the chaos repo. Add it under the token\'s repository access.';
        if (!res.ok) return `GitHub check failed (${res.status}). Try again in a moment.`;
        const repo = await res.json();
        if (repo.permissions && !repo.permissions.push) return 'This token can read but not write. Give it Contents: Read & Write.';
        return null;
    }

    function daysLeft(s) { return Math.max(1, Math.ceil((s.expires - Date.now()) / 864e5)); }

    /* opts: { onEnter(token), beforeEnter?(form) } */
    window.ChaosAuth = {
        clean,
        token() { const s = session(); return s ? s.token : ''; },
        signOut() { write(null); location.reload(); },
        // call this when GitHub rejects the saved token while saving
        expire() { write(null); },
        init(opts) {
            const form = document.getElementById('login-form');
            const err = document.getElementById('error-msg');
            const btn = form.querySelector('button[type="submit"]');
            const status = document.getElementById('session-status');
            const showErr = msg => { err.textContent = msg; err.style.display = 'block'; };

            function enter(s) {
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('admin-panel').style.display = 'block';
                if (status) status.textContent = `Signed in · remembered for ${daysLeft(s)} more day${daysLeft(s) === 1 ? '' : 's'}`;
                opts.onEnter(s.token);
            }

            const saved = session();
            if (saved) enter(saved);

            form.addEventListener('submit', async e => {
                e.preventDefault();
                err.style.display = 'none';
                const tokInput = document.getElementById('token-input');
                const tok = clean(tokInput.value);
                if (!tok) return showErr('Paste your GitHub token.');
                if (!/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(tok)) return showErr('That doesn\'t look like a GitHub token. It should start with github_pat_.');
                tokInput.value = tok;
                btn.disabled = true; btn.textContent = 'Checking…';
                let problem;
                try { problem = await verify(tok); } catch (x) { problem = 'Could not reach GitHub. Check your connection.'; }
                btn.disabled = false; btn.textContent = 'Sign in';
                if (problem) return showErr(problem);
                if (opts.beforeEnter) opts.beforeEnter(form);
                const s = { token: tok, expires: Date.now() + DAYS * 864e5 };
                write(s);
                enter(s);
            });

            document.querySelectorAll('[data-sign-out]').forEach(b => b.addEventListener('click', () => ChaosAuth.signOut()));
        }
    };
})();
