import type { PrismTheme } from 'prism-react-renderer';

// Code highlighting with GitHub's Primer colours, which meet WCAG AA (4.5:1) on their backgrounds. Docusaurus's
// bundled `github` and `dracula` themes don't: their comments and properties fall below 3:1.

export const lightCodeTheme: PrismTheme = {
  plain: { color: '#1f2328', backgroundColor: '#f6f8fa' },
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: '#57606a', fontStyle: 'italic' } },
    { types: ['punctuation', 'operator'], style: { color: '#1f2328' } },
    { types: ['property', 'attr-name', 'tag', 'constant', 'symbol', 'number', 'boolean'], style: { color: '#0550ae' } },
    { types: ['string', 'char', 'attr-value', 'regex', 'url'], style: { color: '#0a3069' } },
    { types: ['keyword', 'selector', 'important', 'atrule', 'builtin'], style: { color: '#cf222e' } },
    { types: ['function', 'class-name'], style: { color: '#6639ba' } },
    { types: ['variable', 'parameter'], style: { color: '#953800' } },
    { types: ['inserted'], style: { color: '#116329' } },
    { types: ['deleted'], style: { color: '#82071e' } },
  ],
};

export const darkCodeTheme: PrismTheme = {
  plain: { color: '#e6edf3', backgroundColor: '#161b22' },
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: '#8b949e', fontStyle: 'italic' } },
    { types: ['punctuation', 'operator'], style: { color: '#e6edf3' } },
    { types: ['property', 'attr-name', 'tag', 'constant', 'symbol', 'number', 'boolean'], style: { color: '#79c0ff' } },
    { types: ['string', 'char', 'attr-value', 'regex', 'url'], style: { color: '#a5d6ff' } },
    { types: ['keyword', 'selector', 'important', 'atrule', 'builtin'], style: { color: '#ff7b72' } },
    { types: ['function', 'class-name'], style: { color: '#d2a8ff' } },
    { types: ['variable', 'parameter'], style: { color: '#ffa657' } },
    { types: ['inserted'], style: { color: '#7ee787' } },
    { types: ['deleted'], style: { color: '#ffa198' } },
  ],
};
