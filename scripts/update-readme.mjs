// Rebuilds the projects table in README.md from your public repositories.
// Description = repo "About" text, or the first paragraph of the repo README.
import fs from 'node:fs';

const USER = process.env.GH_USER;
const TOKEN = process.env.GITHUB_TOKEN;
const MAX = Number(process.env.MAX_PROJECTS) || 8;
const FILE = process.env.README_PATH || 'README.md';
const START = '<!--PROJECTS:START-->';
const END = '<!--PROJECTS:END-->';
if (!USER) throw new Error('GH_USER is not set');

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'profile-readme-bot',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function gh(path, raw = false) {
  const r = await fetch('https://api.github.com' + path, {
    headers: raw ? { ...headers, Accept: 'application/vnd.github.raw+json' } : headers,
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub API ${r.status} for ${path}`);
  return raw ? r.text() : r.json();
}

function firstParagraph(md = '') {
  const clean = md
    .replace(/^---[\s\S]*?---\n/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<(div|p|h\d|img|a|picture|details|table)[\s\S]*?<\/\1>/gi, '');
  for (const block of clean.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length || /^(#|!\[|\[!\[|<|\||>|---|===|\*\*\*|- \[|[-*] )/.test(lines[0])) continue;
    const text = lines.join(' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length >= 25) return text.length > 180 ? text.slice(0, 177).trimEnd() + '...' : text;
  }
  return '';
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, ' ');

const repos = (await gh(`/users/${USER}/repos?type=owner&sort=pushed&per_page=100`)) || [];
const picked = repos
  .filter((r) => !r.fork && !r.archived && !r.private && r.name.toLowerCase() !== USER.toLowerCase())
  .filter((r) => !(r.topics || []).includes('hide-from-profile'))
  .slice(0, MAX);

const rows = [];
for (const r of picked) {
  let desc = (r.description || '').trim();
  if (!desc) desc = firstParagraph((await gh(`/repos/${USER}/${r.name}/readme`, true)) || '');
  const stack = (r.topics || []).slice(0, 3).map((t) => `\`${t}\``).join(' ') || (r.language ? `\`${r.language}\`` : '—');
  rows.push(`| [**${cell(r.name)}**](${r.html_url}) | ${cell(desc || 'No description yet.')} | ${stack} | ${r.stargazers_count} | ${r.pushed_at.slice(0, 10)} |`);
}

const body = rows.length
  ? ['| Project | Description | Stack | Stars | Updated |', '|---|---|---|---:|---|', ...rows].join('\n')
  : '_No public projects yet. New ones will appear here automatically._';

const md = fs.readFileSync(FILE, 'utf8');
if (!md.includes(START) || !md.includes(END)) throw new Error('Markers not found in ' + FILE);
const next = md.replace(new RegExp(`${START}[\\s\\S]*?${END}`), `${START}\n${body}\n${END}`);
if (next !== md) { fs.writeFileSync(FILE, next); console.log(`Updated ${rows.length} project(s).`); }
else console.log('Already up to date.');
