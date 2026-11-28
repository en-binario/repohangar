# Third-Party Notices

RepoHangar is licensed under the MIT License (see [LICENSE](LICENSE)). This file records the third-party software
bundled into the packaged VSIX (`dist/`), as well as third-party files present only in the source repository.

---

## Bundled Runtime Components (Shipped in VSIX)

### preact

- Repository: https://github.com/preactjs/preact
- License: MIT
- Usage: Bundled unmodified into `dist/webview.js` and `dist/profiles.js`.

```text
The MIT License (MIT)

Copyright (c) 2015-present Jason Miller

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

### @vscode/codicons

- Repository: https://github.com/microsoft/vscode-codicons
- Licenses: MIT (code and CSS — `LICENSE-CODE`) and CC-BY-4.0 (icon font and glyphs — `LICENSE`)
- Usage: `dist/codicon.css` and `dist/codicon.ttf` are copied unmodified into `dist/codicons/`.

#### Code License (MIT — `LICENSE-CODE`)

```text
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE
```

#### Icons License (CC-BY-4.0 — `LICENSE`)

```text
Attribution 4.0 International (CC-BY-4.0)

Copyright (c) Microsoft Corporation.
Source: https://github.com/microsoft/vscode-codicons
License: Creative Commons Attribution 4.0 International Public License
Full Legal Code: https://creativecommons.org/licenses/by/4.0/legalcode

Modification notice: The Codicons icon font (`codicon.ttf`) and stylesheet
(`codicon.css`) included in RepoHangar are distributed unmodified.

Disclaimer of warranties: Unless otherwise separately undertaken by the
Licensor, to the extent possible, the Licensor offers the Licensed Material
as-is and as-available, and makes no representations or warranties of any
kind concerning the Licensed Material, whether express, implied, statutory,
or other (see Section 5 of the CC-BY-4.0 Legal Code).

No endorsement: Nothing in this attribution implies sponsorship, endorsement,
or affiliation by Microsoft Corporation. No additional legal terms or
technological measures are applied that legally restrict others from doing
anything the CC-BY-4.0 license permits.
```

---

## Source-Repository Third-Party Files (Not Shipped in VSIX)

The following third-party files exist only in the source repository and are excluded from the packaged VSIX:

### Visual Studio Code Git Extension API Declarations (`src/git/git.d.ts`)

- Source: https://github.com/microsoft/vscode (`extensions/git/src/api/git.d.ts`)
- License: MIT
- Usage: TypeScript declaration file used only at compile time; erased from the compiled JavaScript bundle and not
  shipped in the VSIX.

```text
MIT License

Copyright (c) 2015 - present Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### OpenSpec Workflow Skills (`.claude/skills/openspec-*/SKILL.md`)

- Source: https://github.com/Fission-AI/OpenSpec
- License: MIT
- Usage: Development workflow skill definitions retained in the source repository only; excluded from the VSIX.

---

## First-Party Test Fixtures (Not Shipped in VSIX)

- `test/integration/fixtures/git-graph-opener-0.1.0.vsix` is a first-party unpublished MIT extension
  (`enbinario.git-graph-opener`, Copyright (c) 2026 Jhon Tapia - enbinario.com) used solely to test settings migration
  and duplicate-menu suppression. It is excluded from the RepoHangar VSIX.
