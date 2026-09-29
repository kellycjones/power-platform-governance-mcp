import { describe, expect, it } from 'vitest';
import { areaFromPath, chunkDocument, cleanMarkdown, parseFrontMatter, slugifyHeading } from '../src/corpus/markdown.js';

const BASE = 'https://learn.microsoft.com/power-platform/';

describe('parseFrontMatter', () => {
  it('reads simple key: value pairs and returns the body', () => {
    const { meta, body } = parseFrontMatter('---\ntitle: "View policies"\nms.date: 11/19/2025\ntags:\n  - admin\n---\n# Heading\n');
    expect(meta).toEqual({ title: 'View policies', 'ms.date': '11/19/2025' });
    expect(body).toBe('# Heading\n');
  });

  it('passes through documents without front matter', () => {
    expect(parseFrontMatter('# Just a doc').body).toBe('# Just a doc');
  });
});

describe('cleanMarkdown', () => {
  it('strips Learn/DocFX markup but keeps the prose', () => {
    const md = [
      '[!INCLUDE [deprecation](../../includes/deprecate.md)]',
      ':::image type="content" source="media/x.png" alt-text="Screenshot.":::',
      '> [!NOTE]',
      '> Tenant admins can exclude environments.',
      'See [data policies](prevent-data-loss.md) for details.',
      '![diagram](media/diagram.png)',
      '[!VIDEO https://learn-video.azurefd.net/vod/player?id=1]',
      'Option 1: all environments.<br>Option 2&mdash;some.',
    ].join('\n');
    expect(cleanMarkdown(md)).toBe(
      'Tenant admins can exclude environments.\nSee data policies for details.\n\nOption 1: all environments.\nOption 2—some.',
    );
  });

  it('unwraps callouts indented under list items', () => {
    expect(cleanMarkdown('1. Step one.\n\n   > [!NOTE]\n   > Applies to blocked connectors.')).toBe(
      '1. Step one.\n\n   Applies to blocked connectors.',
    );
  });
});

describe('slugifyHeading / areaFromPath', () => {
  it('builds Learn-style anchors', () => {
    expect(slugifyHeading("What's next after installing the CoE Starter Kit?")).toBe(
      'whats-next-after-installing-the-coe-starter-kit',
    );
    expect(slugifyHeading('Tenant-level `policies`')).toBe('tenant-level-policies');
  });

  it('maps paths to doc areas', () => {
    expect(areaFromPath('admin/prevent-data-loss.md')).toBe('admin');
    expect(areaFromPath('guidance/coe/overview.md')).toBe('coe');
    expect(areaFromPath('alm/basics-alm.md')).toBe('alm');
  });
});

describe('chunkDocument', () => {
  const doc = {
    path: 'admin/dlp-policy-scope.md',
    markdown: `---
title: View policies and scope
---
# View data policies

Admins can view tenant-level policies and policies in environments they manage.

## Policy scope

Data policies can be created at both the tenant and environment level.

### Tenant-level policies

Tenant admins can apply a policy to all environments, some, or all except some.

\`\`\`powershell
# Not a heading: this is a comment in a code block
Get-DlpPolicy
\`\`\`

## Related information

- [Manage data policies](prevent-data-loss.md)
- [Connector classification](dlp-connector-classification.md)
`,
  };

  const sections = chunkDocument(doc, { baseUrl: BASE, minChars: 10 });

  it('splits on H2/H3 and keeps the heading trail', () => {
    expect(sections.map((s) => s.heading)).toEqual([
      'View data policies',
      'Policy scope',
      'Policy scope › Tenant-level policies',
    ]);
  });

  it('uses the H1 as the page title and builds deep links', () => {
    expect(sections[0]!.docTitle).toBe('View data policies');
    expect(sections[0]!.url).toBe('https://learn.microsoft.com/power-platform/admin/dlp-policy-scope');
    expect(sections[2]!.url).toBe('https://learn.microsoft.com/power-platform/admin/dlp-policy-scope#tenant-level-policies');
    expect(sections[2]!.id).toBe('admin/dlp-policy-scope#2');
    expect(sections[2]!.area).toBe('admin');
  });

  it('does not treat # comments inside code blocks as headings', () => {
    expect(sections[2]!.text).toContain('# Not a heading');
  });

  it('drops end-of-page link lists', () => {
    expect(sections.some((s) => s.heading === 'Related information')).toBe(false);
  });

  it('splits long sections, including one huge table, under maxChars', () => {
    const table = Array.from({ length: 80 }, (_, i) => `| setting${i} | Boolean | Controls feature number ${i}. |`).join('\n');
    const long = chunkDocument(
      { path: 'admin/list-tenantsettings.md', markdown: `# Tenant settings\n\n## Settings\n\n${table}` },
      { baseUrl: BASE, maxChars: 800 },
    );
    expect(long.length).toBeGreaterThan(3);
    expect(Math.max(...long.map((s) => s.text.length))).toBeLessThanOrEqual(800);
    expect(new Set(long.map((s) => s.id)).size).toBe(long.length);
  });
});
